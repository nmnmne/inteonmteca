/* Two streaming decks share one audio clock, master bus and recorder. */
(() => {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const signal = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  let batchDepth = 0, changePending = false;
  const change = () => {
    if (batchDepth) { changePending = true; return; }
    syncVisualPlayback();
    signal('dj-change');
  };
  function batch(action) {
    ++batchDepth;
    try { return action(); }
    finally {
      --batchDepth;
      if (!batchDepth && changePending) {
        changePending = false;
        change();
      }
    }
  }
  const fail = (id, message) => signal('dj-error', { id, message });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const decks = {};
  let context, output, stereoMeters, recorder, recordStart = 0, lastDownload;
  let monitorBus, monitorPlayer, monitorDevice = '', routeSequence = 0;
  let speakerOutput, layoutRequest = 0;
  let master = 0.82, cross = 0, loopTimer;
  let sharpCross = false;
  const cutChannels = new Set();
  // The listening-room effects observe this transport and a read-only tap of
  // the actual stereo programme, before it is routed to speakers/headphones.
  const visuals = new EventTarget();
  visuals.paused = true;
  visuals.analysis = null;
  function syncVisualPlayback() {
    const audible = context?.state === 'running' && master > 0 && Object.values(decks).find(deck =>
      deck.channel > 0 && !cutChannels.has(deck.id) && (deck.id === 'A' ? cross < 1 : cross > -1)
      && (deck.scratch || (!deck.audio.paused && !deck.audio.ended && deck.audio.readyState >= 2)));
    if (visuals.paused === !audible) return;
    visuals.paused = !audible;
    if (audible) visuals.dispatchEvent(new CustomEvent('play', { detail: { deck: audible.id } }));
    visuals.dispatchEvent(new Event(audible ? 'playing' : 'pause'));
  }

  function meter() {
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    return { analyser, samples: new Float32Array(analyser.fftSize) };
  }

  function readMeter(m) {
    if (!m || context.state !== 'running') return 0;
    m.analyser.getFloatTimeDomainData(m.samples);
    let peak = 0;
    for (let i = 0; i < m.samples.length; i++) peak = Math.max(peak, Math.abs(m.samples[i]));
    return Math.min(1, peak);
  }

  function setParam(param, value, immediate = false) {
    if (immediate) {
      param.cancelScheduledValues(0);
      param.setValueAtTime(value, context.currentTime);
    } else param.setTargetAtTime(value, context.currentTime, 0.012);
  }

  function filterNode(type, frequency, q) {
    const node = context.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  function connectPlayback(source, destination) {
    if (window.InteonSoundFilter) window.InteonSoundFilter.connect(source, destination);
    else source.connect(destination);
  }

  function updateFilter(deck, immediate) {
    if (!deck.nodes) return;
    const ceiling = Math.min(20000, context.sampleRate / 2 - 1);
    const lowPass = ceiling * Math.pow(80 / ceiling, Math.max(0, -deck.filter));
    const highPass = 15 * Math.pow(12000 / 15, Math.max(0, deck.filter));
    setParam(deck.nodes.lowPass.frequency, lowPass, immediate);
    setParam(deck.nodes.highPass.frequency, highPass, immediate);
  }

  function updateCross(immediate, gate = false, channels = ['A', 'B']) {
    const travel = (cross + 1) / 2;
    for (const id of channels) {
      const gain = decks[id].nodes?.cross.gain;
      if (!gain) continue;
      const open = id === 'A' ? 1 - travel : travel;
      // In cut mode each channel opens fully within the first 4% of fader travel.
      const level = cutChannels.has(id) ? 0 : sharpCross ? Math.min(1, open / 0.04) : Math.sin(open * Math.PI / 2);
      if (immediate) setParam(gain, level, true);
      else gain.setTargetAtTime(level, context.currentTime, gate || sharpCross ? 0.0018 : 0.012);
    }
  }

  function effectiveBPM(deck) {
    return deck.baseBPM * deck.audio.playbackRate;
  }

  function updateEcho(deck, immediate) {
    if (!deck.nodes) return;
    const beat = effectiveBPM(deck) > 0 ? 60 / effectiveBPM(deck) : 0.5;
    setParam(deck.nodes.delay.delayTime, Math.min(1.8, beat * 0.75), immediate);
    setParam(deck.nodes.send.gain, deck.echo * 0.65, immediate);
  }

  function resetEchoLine(nodes) {
    // A delay retains the previous track's samples even after its send reaches zero.
    nodes.send.disconnect();
    nodes.delay?.disconnect();
    nodes.feedback?.disconnect();
    nodes.delay = context.createDelay(2);
    nodes.feedback = context.createGain();
    nodes.feedback.gain.value = 0.32;
    nodes.send.connect(nodes.delay).connect(nodes.channel);
    nodes.delay.connect(nodes.feedback).connect(nodes.delay);
  }

  function wireDeck(deck) {
    const source = context.createMediaElementSource(deck.audio);
    const trim = context.createGain();
    trim.gain.value = importGain(deck.track);
    const low = filterNode('lowshelf', 240, 0.7);
    const mid = filterNode('peaking', 1200, 0.75);
    const high = filterNode('highshelf', 5000, 0.7);
    const highPass = filterNode('highpass', 15, 0.707);
    const lowPass = filterNode('lowpass', 18000, 0.707);
    const send = context.createGain();
    const channel = context.createGain();
    const monitor = context.createGain();
    monitor.gain.value = 0;
    const crossGain = context.createGain();
    const channelMeter = meter();
    source.connect(trim).connect(low).connect(mid).connect(high).connect(highPass).connect(lowPass);
    lowPass.connect(channel);
    lowPass.connect(monitor);
    lowPass.connect(send);
    channel.connect(channelMeter.analyser).connect(crossGain).connect(output.master);
    low.gain.value = deck.eq.low;
    mid.gain.value = deck.eq.mid;
    high.gain.value = deck.eq.high;
    channel.gain.value = deck.channel;
    const adaptive = window.DJImportLoudness?.createAdaptive(context, source, trim.gain, deck.audio);
    adaptive?.configure(deck.track);
    deck.nodes = { source, trim, adaptive, low, mid, high, highPass, lowPass, channel, monitor, send, cross: crossGain, meter: channelMeter };
    resetEchoLine(deck.nodes);
    deck.vinyl?.attach(context, source, trim, deck.audio);
    updateFilter(deck, true);
    updateEcho(deck, true);
  }

  function activate() {
    if (!AudioContextClass) throw new Error('Этот браузер не поддерживает Web Audio.');
    if (!context) {
      context = new AudioContextClass({ latencyHint: 'interactive' });
      const gain = context.createGain();
      gain.gain.value = master;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -1.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      connectPlayback(gain, limiter);

      const split = context.createChannelSplitter(2);
      limiter.connect(split);
      stereoMeters = [meter(), meter()];
      stereoMeters.forEach((m, i) => split.connect(m.analyser, i));
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      limiter.connect(analyser);
      visuals.analysis = { context, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
      context.addEventListener('statechange', syncVisualPlayback);
      output = { master: gain, limiter };
      Object.values(decks).forEach(wireDeck);
      updateCross(true);
      if (window.DJSpatial?.createOutput) speakerOutput = DJSpatial.createOutput(context,limiter,change);
      else limiter.connect(context.destination);
    }
    return context.state === 'running' ? Promise.resolve() : context.resume();
  }

  async function setOutputLayout(layout) {
    if (!['stereo', 'headphones', '7.1.4'].includes(layout)) return false;
    const request = ++layoutRequest;
    try {
      await activate();
      if (request !== layoutRequest) return false;
      if (!speakerOutput) return layout === 'stereo';
      const active = await speakerOutput.setLayout(layout);
      if (!active && request === layoutRequest) fail(null,'Не удалось настроить выбранную раскладку. Работает стереовыход.');
      return active;
    } catch (error) {
      fail(null, 'Не удалось открыть аудиовыход. ' + error.message);
      return false;
    }
  }

  async function testOutputChannel(index) {
    try {
      await activate();
      if (!speakerOutput || !await speakerOutput.refresh()) return false;
      return speakerOutput.testChannel(index,master);
    } catch (error) {
      fail(null, 'Не удалось проверить канал. ' + error.message);
      return false;
    }
  }

  function duration(deck) {
    if (Number.isFinite(deck.audio.duration)) return deck.audio.duration;
    const estimate = Number(deck.track?.duration);
    return Number.isFinite(estimate) ? Math.max(0, estimate) : 0;
  }

  function position(deck) {
    return deck.scratch?.time ?? deck.pendingSeek ?? deck.audio.currentTime;
  }

  function move(deck, target) {
    const seconds = clamp(target, 0, duration(deck) || Number.MAX_SAFE_INTEGER);
    deck.vinyl?.prime(seconds);
    if (deck.audio.readyState >= 1) {
      deck.audio.currentTime = seconds;
      deck.pendingSeek = null;
    } else {
      deck.pendingSeek = seconds;
    }
  }

  function updateLoopTimer() {
    const needed = Object.values(decks).some(d => d.loopBeats && !d.audio.paused);
    if (needed && !loopTimer) loopTimer = setInterval(() => Object.values(decks).forEach(checkLoop), 16);
    if (!needed && loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
  }

  function checkLoop(deck) {
    if (!deck.loopBeats || deck.audio.seeking || deck.audio.paused) return;
    const over = deck.audio.currentTime - deck.loopEnd;
    if (over >= 0) move(deck, deck.loopStart + over % (deck.loopEnd - deck.loopStart));
  }

  function clearLoop(deck) {
    deck.loopBeats = 0;
    deck.loopStart = deck.loopEnd = null;
    updateLoopTimer();
  }

  function cueKey(deck) {
    return 'inteonmteca.dj.cues.1:' + (deck.track.id || deck.track.src || deck.track.audio);
  }

  function saveCues(deck) {
    const other = decks[deck.id === 'A' ? 'B' : 'A'];
    if (other.track && cueKey(other) === cueKey(deck)) {
      other.cue = deck.cue;
      other.hotCues = deck.hotCues.slice();
    }
    try { localStorage.setItem(cueKey(deck), JSON.stringify([deck.cue, deck.hotCues])); }
    catch { /* Storage can be disabled in a private session. */ }
  }

  function restoreCues(deck) {
    deck.cue = 0;
    deck.hotCues = Array(8).fill(null);
    try {
      const saved = JSON.parse(localStorage.getItem(cueKey(deck)));
      if (!Array.isArray(saved)) return;
      if (Number.isFinite(saved[0])) deck.cue = Math.max(0, saved[0]);
      if (Array.isArray(saved[1])) {
        deck.hotCues = deck.hotCues.map((_, i) => Number.isFinite(saved[1][i]) ? Math.max(0, saved[1][i]) : null);
      }
    } catch { /* Use empty cue points if the saved entry is unavailable. */ }
  }

  function play(deck) {
    if (!deck.track) return;
    if (deck.scratch) { deck.scratch.resume = true; change(); return; }
    const sequence = ++deck.sequence;
    try {
      const ready = activate();
      // Both calls run in the originating user gesture (required by mobile browsers).
      const started = deck.audio.play();
      Promise.all([ready, started]).catch(err => {
        if (sequence !== deck.sequence) return;
        deck.audio.pause();
        if (err.name !== 'AbortError') fail(deck.id, 'Не удалось запустить деку ' + deck.id + '. ' + err.message);
        change();
      });
    } catch (err) {
      fail(deck.id, err.message);
    }
  }

  function performanceDefaults() {
    return {
      tempo: 0, bend: 0, eq: { low: 0, mid: 0, high: 0 }, keyLock: true,
      filter: 0, echo: 0, channel: 0.8, monitor: false
    };
  }

  function makeDeck(id) {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    const deck = {
      id, audio, track: null, sequence: 0, loadVersion: 0, pendingSeek: null, baseBPM: 0, cue: 0,
      hotCues: Array(8).fill(null), loopBeats: 0, loopStart: null, loopEnd: null,
      ...performanceDefaults()
    };
    audio.addEventListener('loadedmetadata', () => {
      if (deck.pendingSeek != null) move(deck, deck.pendingSeek);
      change();
    });
    for (const event of ['playing', 'play', 'pause', 'durationchange', 'seeked']) {
      audio.addEventListener(event, () => { updateLoopTimer(); change(); });
    }
    for (const event of ['playing', 'pause', 'seeking', 'seeked', 'ratechange', 'ended']) {
      audio.addEventListener(event, () => {
        deck.vinyl?.capture(!audio.paused && !audio.seeking && !audio.ended && !deck.scratch);
      });
    }
    audio.addEventListener('timeupdate', () => {
      checkLoop(deck);
      if (!deck.scratch) deck.vinyl?.prime(position(deck));
    });
    audio.addEventListener('ended', () => {
      if (deck.loopBeats && audio.ended) {
        move(deck, deck.loopStart);
        play(deck);
      } else if (audio.ended && deck.track) {
        signal('dj-ended', { id, loadVersion: deck.loadVersion });
      }
      updateLoopTimer();
      change();
    });
    audio.addEventListener('error', () => {
      if (audio.error && deck.track) fail(id, 'Дека ' + id + ' не смогла открыть «' + deck.track.title + '».');
      change();
    });
    return deck;
  }

  decks.A = makeDeck('A');
  decks.B = makeDeck('B');

  function importGain(track) {
    const measured = track?.normalization;
    return track?.imported && ['measured', 'ungated'].includes(measured?.status) && Number.isFinite(measured.gainDb)
      ? Math.pow(10, measured.gainDb / 20)
      : 1;
  }

  function load(id, track) {
    const deck = decks[id];
    if (!deck) return;
    const src = track?.src || track?.audio;
    if (typeof src !== 'string' || !src.trim()) {
      fail(id, 'В карточке трека нет аудиофайла.');
      return;
    }
    ++deck.sequence;
    ++deck.loadVersion;
    deck.scratch = null;
    deck.vinyl?.close();
    deck.audio.pause();
    clearLoop(deck);
    deck.pendingSeek = null;
    deck.track = track;
    Object.assign(deck, performanceDefaults());
    applyKeyLock(deck);
    if (deck.nodes) {
      const nodes = deck.nodes;
      nodes.adaptive?.configure(track);
      setParam(nodes.trim.gain, importGain(track), true);
      for (const band of ['low', 'mid', 'high']) setParam(nodes[band].gain, deck.eq[band], true);
      setParam(nodes.channel.gain, deck.channel, true);
      setParam(nodes.monitor.gain, 0, true);
      updateFilter(deck, true);
      resetEchoLine(nodes);
    }
    if (cutChannels.delete(id)) updateCross(true, true, [id]);
    if (monitorPlayer && !Object.values(decks).some(d => d.monitor)) monitorPlayer.pause();
    const bpm = Number(track.bpm);
    deck.baseBPM = Number.isFinite(bpm) ? Math.max(0, bpm) : 0;
    deck.audio.defaultPlaybackRate = deck.audio.playbackRate = 1;
    deck.audio.src = src;
    deck.audio.load();
    deck.vinyl = window.DJScratch?.create(track, () => duration(deck), () => {
      if (deck.scratch && (deck.vinyl?.status === 'unavailable' || (deck.vinyl?.status === 'history' && !deck.vinyl.history))) {
        endScratch(id);
        fail(id, deck.vinyl.status === 'unavailable' ? 'Браузер не смог включить обработку скретча.'
          : 'Для скретча этого файла сначала проиграйте несколько секунд.');
      }
      change();
    });
    if (deck.nodes) deck.vinyl?.attach(context, deck.nodes.source, deck.nodes.trim, deck.audio);
    restoreCues(deck);
    updateEcho(deck, true);
    signal('dj-load', { id });
    change();
  }

  function toggle(id) {
    const deck = decks[id];
    if (!deck?.track) return;
    if (deck.scratch) { deck.scratch.resume = !deck.scratch.resume; change(); return; }
    if (deck.audio.paused) play(deck);
    else { ++deck.sequence; deck.audio.pause(); }
  }

  function beginScratch(id, {bufferedOnly = false} = {}) {
    const deck = decks[id];
    if (!deck?.track || !deck.vinyl || deck.scratch) return false;
    const vinyl = deck.vinyl;
    let time = position(deck);
    if (bufferedOnly && !vinyl.canScratchAt(time)) return false;
    if (vinyl.status === 'unavailable') {
      fail(id, 'Браузер не смог включить обработку скретча.');
      return false;
    }
    if (vinyl.status === 'history') {
      const history = vinyl.history;
      if (!history || time < history.from - .15 || time > history.to + .5) {
        fail(id, 'Для скретча большого файла сначала проиграйте несколько секунд в нужном месте.');
        return false;
      }
      time = clamp(time, history.from, history.to);
    }
    try {
      const ready = activate();
      const held = {time, resume: !deck.audio.paused && !deck.audio.ended};
      deck.scratch = held;
      ++deck.sequence;
      deck.audio.pause();
      vinyl.start(time);
      ready.catch(() => {
        if (deck.scratch !== held) return;
        held.resume = false;
        endScratch(id);
        fail(id, 'Не удалось открыть звук для скретча.');
      });
      change();
      return true;
    } catch (err) {
      fail(id, err.message);
      return false;
    }
  }

  function moveScratch(id, deltaSeconds) {
    const deck = decks[id];
    if (!deck?.scratch || !Number.isFinite(deltaSeconds)) return;
    const history = deck.vinyl.status === 'history' && deck.vinyl.history;
    const end = history ? history.to : duration(deck);
    deck.scratch.time = clamp(deck.scratch.time + deltaSeconds, history ? history.from : 0, end);
    deck.vinyl.move(deck.scratch.time);
    change();
  }

  function endScratch(id) {
    const deck = decks[id];
    if (!deck?.scratch) return;
    const {time, resume} = deck.scratch;
    deck.scratch = null;
    deck.vinyl.stop();
    if (deck.loopBeats && (time < deck.loopStart || time >= deck.loopEnd)) clearLoop(deck);
    move(deck, time);
    if (resume && time < duration(deck)) play(deck);
    change();
  }

  function seek(id, seconds) {
    const deck = decks[id];
    if (!deck?.track || !Number.isFinite(Number(seconds))) return;
    if (deck.scratch) endScratch(id);
    if (deck.loopBeats && (seconds < deck.loopStart || seconds >= deck.loopEnd)) clearLoop(deck);
    move(deck, seconds);
    change();
  }

  function setCue(id) {
    const deck = decks[id];
    if (!deck?.track) return;
    deck.cue = position(deck);
    saveCues(deck);
    change();
  }

  function cue(id) {
    const deck = decks[id];
    if (!deck?.track) return;
    if (deck.scratch) {
      const playing = deck.scratch.resume;
      deck.scratch.resume = false;
      endScratch(id);
      if (playing) { seek(id, deck.cue); return; }
    }
    if (deck.audio.paused) { setCue(id); return; }
    ++deck.sequence;
    deck.audio.pause();
    seek(id, deck.cue);
  }

  function hotCue(id, n, clear = false) {
    const deck = decks[id];
    if (!deck?.track || !Number.isInteger(n) || n < 1 || n > deck.hotCues.length) return;
    const index = n - 1;
    if (clear || deck.hotCues[index] == null) {
      deck.hotCues[index] = clear ? null : position(deck);
      saveCues(deck);
      change();
    } else {
      seek(id, deck.hotCues[index]);
      if (deck.audio.paused) play(deck);
    }
  }

  function configureLoop(id, beats, fallbackBPM, manual) {
    const deck = decks[id];
    if (!deck?.track) return false;
    if (beats === deck.loopBeats) return true;
    if (!beats) { clearLoop(deck); change(); return true; }
    const bpm = deck.baseBPM || fallbackBPM;
    if (!(bpm > 0) || !Number.isFinite(bpm)) {
      if (manual) fail(id, 'Для петли нужен BPM трека.');
      return false;
    }
    const beat = 60 / bpm;
    const offset = Number(deck.track.offset) || 0;
    const length = beat * beats;
    const total = duration(deck);
    if (!Number.isFinite(length) || (total && length > total)) {
      if (manual) fail(id, 'Трек короче выбранной петли.');
      return false;
    }
    const latest = total ? total - length : Infinity;
    const from = Math.min(latest, deck.loopStart ?? position(deck));
    const start = offset + Math.floor((from - offset) / beat + 1e-9) * beat;
    deck.loopStart = Math.max(0, start);
    deck.loopEnd = deck.loopStart + length;
    deck.loopBeats = beats;
    const elapsed = position(deck) - deck.loopStart;
    if (elapsed < 0 || elapsed >= length) {
      // Folding the playhead into a shorter loop keeps the beat phase during a roll.
      move(deck, deck.loopStart + (!manual && elapsed > 0 ? elapsed % length : 0));
    }
    updateLoopTimer();
    change();
    return true;
  }

  function loop(id, beats) {
    beats = Math.max(0, Number(beats) || 0);
    return configureLoop(id, beats === decks[id]?.loopBeats ? 0 : beats, 0, true);
  }

  function setLoop(id, beats, fallbackBPM = 0) {
    if (!Number.isFinite(beats) || beats < 0) return false;
    return configureLoop(id, beats, fallbackBPM, false);
  }

  function setTempo(id, percent) {
    const deck = decks[id];
    if (!deck) return;
    deck.tempo = clamp(percent, -50, 50);
    applyPlaybackRate(deck);
  }

  function setBend(id, percent) {
    const deck = decks[id];
    if (!deck) return;
    const bend = clamp(percent, -12, 12);
    if (bend === deck.bend) return;
    deck.bend = bend;
    applyPlaybackRate(deck);
  }

  function applyPlaybackRate(deck) {
    deck.audio.playbackRate = (1 + deck.tempo / 100) * (1 + deck.bend / 100);
    updateEcho(deck);
    change();
  }

  function sync(id) {
    const deck = decks[id];
    const other = decks[id === 'A' ? 'B' : 'A'];
    if (!deck?.baseBPM || !other.baseBPM) { fail(id, 'Для SYNC нужен BPM обеих дек.'); return; }
    const target = effectiveBPM(other);
    // Double- and half-time grids can be equivalent. Favor the least pitch travel
    // on a musical (logarithmic) scale, giving the literal BPM a half-semitone edge.
    let rate, bestDistance = Infinity;
    for (const multiple of [1, 2, 0.5]) {
      const candidate = target * multiple / deck.baseBPM;
      if (candidate < 0.5 || candidate > 1.5) continue;
      const distance = Math.abs(12 * Math.log2(candidate)) + (multiple === 1 ? 0 : 0.5);
      if (distance < bestDistance) { rate = candidate; bestDistance = distance; }
    }
    if (rate == null) { fail(id, 'Темпы треков вне диапазона питча.'); return; }
    setTempo(id, (rate - 1) * 100);
    const beat = 60 / deck.baseBPM;
    const otherElapsed = (position(other) - (Number(other.track.offset) || 0)) / other.audio.playbackRate;
    const phase = otherElapsed * effectiveBPM(deck) / 60;
    const current = (position(deck) - (Number(deck.track.offset) || 0)) / beat;
    const matched = phase + Math.round(current - phase);
    let targetTime = (Number(deck.track.offset) || 0) + matched * beat;
    if (targetTime < 0) targetTime += beat;
    if (deck.loopBeats) {
      const span = deck.loopEnd - deck.loopStart;
      targetTime = deck.loopStart + ((targetTime - deck.loopStart) % span + span) % span;
    }
    move(deck, targetTime);
    change();
  }

  function applyKeyLock(deck) {
    deck.audio.preservesPitch = deck.keyLock;
    if ('webkitPreservesPitch' in deck.audio) deck.audio.webkitPreservesPitch = deck.keyLock;
  }

  function setKeyLock(id, enabled) {
    const deck = decks[id];
    if (!deck) return;
    deck.keyLock = Boolean(enabled);
    applyKeyLock(deck);
    change();
  }

  function setEQ(id, band, db) {
    const deck = decks[id];
    if (!deck || !['low', 'mid', 'high'].includes(band)) return;
    deck.eq[band] = clamp(db, -36, 12);
    if (deck.nodes) setParam(deck.nodes[band].gain, deck.eq[band]);
    change();
  }

  function setChannel(id, volume) {
    const deck = decks[id];
    if (!deck) return;
    deck.channel = clamp(volume, 0, 1);
    if (deck.nodes) setParam(deck.nodes.channel.gain, deck.channel);
    change();
  }

  function setMaster(volume) {
    master = clamp(volume, 0, 1);
    if (output) setParam(output.master.gain, master);
    change();
  }

  function setCross(value) {
    cross = clamp(value, -1, 1);
    updateCross(false);
    change();
  }

  function setCrossCurve(sharp) {
    sharpCross = Boolean(sharp);
    updateCross(false);
    change();
  }

  function setCut(id, held) {
    if (!decks[id] || cutChannels.has(id) === held) return;
    if (held) cutChannels.add(id);
    else cutChannels.delete(id);
    updateCross(false, true, [id]);
    change();
  }

  const supportedRecorder = () => Boolean(window.MediaRecorder && AudioContextClass);
  const supportedMonitor = () => Boolean(AudioContextClass && navigator.mediaDevices?.enumerateDevices && 'setSinkId' in HTMLMediaElement.prototype);

  function resetMonitor() {
    if (monitorPlayer) {
      monitorPlayer.muted = true;
      monitorPlayer.pause();
      monitorPlayer.srcObject = null;
    }
    monitorDevice = '';
    monitorPlayer = null;
    for (const deck of Object.values(decks)) {
      deck.monitor = false;
      if (deck.nodes) deck.nodes.monitor.gain.value = 0;
    }
    change();
  }

  async function separateSink(id) {
    if (!id || id === 'default' || id === 'communications') return false;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
    const selected = devices.find(d => d.deviceId === id);
    if (!selected) return false;
    const main = devices.find(d => d.deviceId === 'default');
    if (main?.groupId && selected.groupId) return main.groupId !== selected.groupId;
    return devices.filter(d => d.deviceId && !['default', 'communications'].includes(d.deviceId)).length > 1;
  }

  async function setMonitorDevice(id) {
    const seq = ++routeSequence;
    resetMonitor();
    if (!id) return true;
    try {
      if (!supportedMonitor()) throw new Error('Этот браузер не поддерживает выбор выхода наушников.');
      if (!await separateSink(id)) throw new Error('Выберите выход наушников, отличный от основного выхода.');
      if (seq !== routeSequence) return false;
      await activate();
      if (seq !== routeSequence) return false;
      if (!monitorBus) {
        monitorBus = context.createMediaStreamDestination();
        const cueMix = context.createGain();
        for (const deck of Object.values(decks)) deck.nodes.monitor.connect(cueMix);
        connectPlayback(cueMix, monitorBus);
      }
      const player = new Audio();
      player.muted = true;
      await player.setSinkId(id);
      if (seq !== routeSequence) return false;
      if (player.sinkId !== id) throw new Error('Не удалось назначить выход наушников.');
      player.srcObject = monitorBus.stream;
      monitorDevice = id;
      monitorPlayer = player;
      change();
      return true;
    } catch (err) {
      if (seq === routeSequence) fail(null, err.message);
      return false;
    }
  }

  async function setMonitor(id, enabled) {
    const deck = decks[id];
    if (!deck) return false;
    if (enabled && !monitorPlayer) { fail(id, 'Сначала выберите отдельный выход для наушников.'); return false; }
    deck.monitor = Boolean(enabled);
    if (deck.nodes) setParam(deck.nodes.monitor.gain, deck.monitor ? 0.65 : 0);
    const player = monitorPlayer;
    const loadVersion = deck.loadVersion;
    try {
      if (player && Object.values(decks).some(d => d.monitor)) {
        player.muted = false;
        await Promise.all([activate(), player.play()]);
      } else player?.pause();
      change();
      return true;
    } catch (err) {
      if (player === monitorPlayer && loadVersion === deck.loadVersion && deck.monitor) {
        deck.monitor = false;
        deck.nodes.monitor.gain.value = 0;
        fail(id, 'Не удалось включить наушники. ' + err.message);
        change();
      }
      return false;
    }
  }

  navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
    const previous = monitorPlayer;
    if (!previous) return;
    previous.muted = true;
    let valid = false;
    try { valid = await separateSink(monitorDevice); } catch { /* Output permission may have changed. */ }
    if (previous !== monitorPlayer) return;
    if (valid && previous.sinkId === monitorDevice) previous.muted = false;
    else {
      ++routeSequence;
      resetMonitor();
      fail(null, 'Выход наушников изменился. Выберите его заново.');
    }
  });

  function toggleRecording() {
    if (recorder) {
      if (recorder.state === 'recording') recorder.stop();
      change();
      return;
    }
    if (!supportedRecorder()) { fail(null, 'Браузер не поддерживает запись микса.'); return; }
    let destination;
    try {
      const resumed = activate();
      let startFailure;
      resumed.catch(err => {
        startFailure = err;
        if (recorder && recorder.stream === destination?.stream && recorder.state !== 'inactive') recorder.stop();
        fail(null, err.message);
      });
      destination = context.createMediaStreamDestination();
      output.limiter.connect(destination);
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(destination.stream, mimeType ? { mimeType } : {});
      const chunks = [];
      active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      active.onerror = () => fail(null, 'Не удалось записать микс.');
      active.onstop = () => {
        output.limiter.disconnect(destination);
        destination.stream.getTracks().forEach(track => track.stop());
        recorder = null;
        if (startFailure) { change(); return; }
        if (chunks.length) {
          if (lastDownload) URL.revokeObjectURL(lastDownload);
          const blob = new Blob(chunks, { type: active.mimeType });
          const url = lastDownload = URL.createObjectURL(blob);
          const ext = active.mimeType.includes('mp4') ? 'm4a' : active.mimeType.includes('ogg') ? 'ogg' : 'webm';
          const filename = 'inteonmteca-mix-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.append(link);
          link.click();
          link.remove();
          signal('dj-recorded', { blob, url, filename });
        } else fail(null, 'В записи нет аудиоданных.');
        change();
      };
      active.start(1000);
      recorder = active;
      recordStart = performance.now();
    } catch (err) {
      if (destination) {
        output.limiter.disconnect(destination);
        destination.stream.getTracks().forEach(track => track.stop());
      }
      fail(null, 'Не удалось начать запись. ' + err.message);
    }
    change();
  }

  function deckSnapshot(deck) {
    return {
      track: deck.track, loadVersion: deck.loadVersion, playing: deck.scratch ? deck.scratch.resume : !deck.audio.paused && !deck.audio.ended,
      audioRunning: context?.state === 'running' && !deck.audio.paused && !deck.audio.seeking
        && !deck.audio.ended && deck.audio.readyState >= 3,
      ended: deck.audio.ended, audioFailed: Boolean(deck.audio.error),
      scratching: Boolean(deck.scratch), scratchStatus: deck.vinyl?.status || 'unavailable',
      time: position(deck), duration: duration(deck), bpm: effectiveBPM(deck),
      tempo: deck.tempo, bend: deck.bend, baseBPM: deck.baseBPM, keyLock: deck.keyLock,
      cue: deck.cue, hotCues: deck.hotCues.slice(), loopBeats: deck.loopBeats,
      loopStart: deck.loopStart, loopEnd: deck.loopEnd, eq: { ...deck.eq },
      filter: deck.filter, channel: deck.channel, echo: deck.echo, monitor: deck.monitor, level: readMeter(deck.nodes?.meter)
    };
  }

  function snapshot() {
    const recording = recorder?.state === 'recording';
    return {
      A: deckSnapshot(decks.A), B: deckSnapshot(decks.B), master, cross, sharpCross, recording,
      recordingSeconds: recording ? (performance.now() - recordStart) / 1000 : 0,
      canRecord: supportedRecorder(), canMonitor: supportedMonitor(), monitorDevice, sampleRate: context?.sampleRate || 0,
      outputLayout: speakerOutput?.layout || 'stereo',
      preferredLayout: speakerOutput?.preferredLayout || window.DJSpatial?.preferredLayout?.() || '7.1.4',
      maxOutputChannels: context?.destination.maxChannelCount || context?.destination.channelCount || 0,
      activeOutputChannels: speakerOutput?.channelCount || context?.destination.channelCount || 0,
      canSpatial: Boolean(context && window.DJSpatial?.createOutput),
      meters: { left: readMeter(stereoMeters?.[0]), right: readMeter(stereoMeters?.[1]) }
    };
  }

  window.DJEngine = {
    visuals, batch,
    beginScratch, moveScratch, endScratch,
    load, toggle, seek, cue, setCue, hotCue, loop, setLoop, sync, setTempo, setBend, setKeyLock,
    setChannel, setEQ, setMaster, setCross, setCrossCurve, setCut, setMonitorDevice, setMonitor, setOutputLayout, testOutputChannel, toggleRecording, snapshot,
    setBPM(id, bpm) {
      const deck = decks[id];
      if (!deck?.track || !Number.isFinite(bpm) || bpm <= 0) return;
      clearLoop(deck);
      deck.baseBPM = bpm;
      updateEcho(deck);
      change();
    },
    setFilter(id, value) {
      if (!decks[id]) return;
      decks[id].filter = clamp(value, -1, 1);
      updateFilter(decks[id]);
      change();
    },
    setEcho(id, value) {
      if (!decks[id]) return;
      decks[id].echo = clamp(value, 0, 1);
      updateEcho(decks[id]);
      change();
    }
  };
})();
