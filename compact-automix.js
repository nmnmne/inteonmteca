(() => {
  'use strict';

  const opposite = id => id === 'A' ? 'B' : 'A';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ramp = (value, start, end) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };

  function create(engine, library, {onDeckChange, onStatus}) {
    const auto = new Set();
    const played = new Set();
    let mix = null, timer = null, period = 0, sequence = 0, retryAfter = 0;
    let directLoad = false;

    function schedule() {
      const nextPeriod = mix ? 70 : auto.size ? 400 : 0;
      if (nextPeriod === period) return;
      if (timer !== null) clearInterval(timer);
      period = nextPeriod;
      timer = period ? setInterval(sync, period) : null;
    }

    function setAuto(id, enabled) {
      if (enabled) auto.add(id);
      else {
        auto.delete(id);
        if (mix?.automatic && mix.from === id) cancel();
      }
      schedule();
    }

    function restoreTone(id, saved) {
      engine.setEQ(id, 'low', saved.eq.low);
      engine.setEQ(id, 'mid', saved.eq.mid);
      engine.setFilter(id, saved.filter);
      engine.setEcho(id, saved.echo);
      engine.setChannel(id, saved.channel);
    }

    function close(completed, message = '') {
      const job = mix;
      if (!job) return;
      mix = null;
      const {from, to, source, incoming} = job;
      const state = engine.snapshot();
      engine.batch(() => {
        if (state[from].loadVersion === source.loadVersion) {
          if (job.scratch && state[from].scratching) engine.endScratch(from);
          if (completed && engine.snapshot()[from].playing) engine.toggle(from);
          engine.setLoop(from, source.loopBeats, job.bpm);
          if (incoming) restoreTone(from, source);
        }
        if (incoming && state[to].loadVersion === incoming.loadVersion) {
          if (!completed && state[to].playing) engine.toggle(to);
          engine.setLoop(to, 0);
          restoreTone(to, incoming);
          if (completed) engine.setChannel(to, source.channel);
        }
        if (incoming) {
          engine.setCrossCurve(job.sharpCross);
          engine.setCross(completed ? -job.cross : job.cross);
        }
      });
      if (completed) {
        if (auto.delete(from)) auto.add(to);
        onDeckChange(to);
      }
      onStatus(message);
      schedule();
    }

    function cancel() {
      ++sequence;
      const interrupted = Boolean(mix);
      directLoad = false;
      close(false);
      return interrupted;
    }

    function fail(job) {
      if (mix !== job) return;
      retryAfter = performance.now() + 6000;
      close(false, 'Не удалось свести трек');
    }

    function setUsableLoop(id, desired, bpm) {
      for (let beats = desired; beats >= 0.25; beats /= 2) {
        if (engine.setLoop(id, beats, bpm)) return beats;
      }
      return 0;
    }

    async function choose(id, selection, automatic = false, resume = false) {
      cancel();
      const request = sequence;
      const state = engine.snapshot();
      const from = state[id].playing ? id : opposite(id);
      const to = opposite(from);
      const source = state[from];
      if (!source.playing) {
        directLoad = true;
        try {
          const key = typeof selection === 'function' ? await selection() : selection;
          const isCurrent = () => request === sequence;
          if (!key || !isCurrent() || !await library.load(id, key, isCurrent) || !isCurrent()) return false;
          if (resume && auto.has(id) && !engine.snapshot()[id].playing) engine.toggle(id);
          onStatus('');
          return true;
        } catch {
          if (request === sequence) onStatus('Не удалось загрузить трек');
          return false;
        } finally {
          if (request === sequence) directLoad = false;
        }
      }
      if (state[to].playing || source.scratching || state[to].scratching) {
        onStatus('Для сведения нужна свободная дека');
        return false;
      }
      const bpm = source.bpm || 120;
      const job = {from, to, source, automatic, bpm, cross: state.cross, sharpCross: state.sharpCross,
        stage: 'load', incoming: null, scratch: false, loopStep: 0, elapsed: 0};
      mix = job;
      job.beats = setUsableLoop(from, source.loopBeats || 8, bpm);
      schedule();
      onStatus('Подготовка трека');
      try {
        const key = typeof selection === 'function' ? await selection() : selection;
        if (mix !== job) return false;
        job.loadStarted = performance.now();
        const isCurrent = () => mix === job && !engine.snapshot()[to].playing;
        if (!key || !await library.load(to, key, isCurrent)) { fail(job); return false; }
        if (mix !== job) return false;
        const latest = engine.snapshot();
        if (!latest[from].playing || latest[from].loadVersion !== source.loadVersion || latest[to].track?.id !== key) {
          close(false); return false;
        }
        const incoming = job.incoming = latest[to];
        const open = (1 + (from === 'A' ? -job.cross : job.cross)) / 2;
        const gain = job.sharpCross ? Math.min(1, open / .04) : Math.sin(open * Math.PI / 2);
        engine.batch(() => {
          engine.setChannel(from, source.channel * gain);
          engine.setChannel(to, source.channel * gain);
          engine.setCrossCurve(false);
          engine.setCross(from === 'A' ? -1 : 1);
          engine.setEQ(to, 'low', -24);
          engine.setEQ(to, 'mid', -7);
          engine.setFilter(to, -.30);
          engine.seek(to, incoming.cue || Math.max(0, Number(incoming.track.offset) || 0));
          setUsableLoop(to, 8, bpm);
          if (source.baseBPM && incoming.baseBPM) engine.sync(to);
          engine.toggle(to);
        });
        job.stage = 'ready';
        job.last = job.waitSince = performance.now();
        return true;
      } catch {
        fail(job);
        return false;
      }
    }

    function applyFade(job, p, time) {
      const {from, to, source, incoming} = job;
      engine.setCross((from === 'A' ? 1 : -1) * (2 * ramp(p, 0, 1) - 1));
      engine.setEQ(to, 'low', -24 * (1 - ramp(p, .38, .72)));
      engine.setEQ(from, 'low', source.eq.low + (-24 - source.eq.low) * ramp(p, .22, .57));
      engine.setEQ(to, 'mid', -7 * (1 - ramp(p, 0, .6)));
      engine.setEQ(from, 'mid', source.eq.mid + (-9 - source.eq.mid) * ramp(p, .48, 1));
      engine.setFilter(to, incoming.filter - .30 * (1 - ramp(p, 0, .65)));
      engine.setFilter(from, source.filter + (.52 - source.filter) * ramp(p, .38, .97));
      engine.setEcho(from, source.echo + (.34 - source.echo) * ramp(p, .53, .9));
      const step = p >= .84 ? 3 : p >= .66 ? 2 : p >= .44 ? 1 : 0;
      if (!job.scratch && step > job.loopStep && job.beats) {
        engine.setLoop(from, Math.max(.5, job.beats / (2 ** step)), job.bpm);
        job.loopStep = step;
      }
      // One short baby scratch on the outgoing beat. The incoming deck carries the rhythm.
      if (p >= .63 && p < .72 && !job.triedScratch) {
        job.triedScratch = true;
        if (engine.beginScratch(from, {bufferedOnly:true})) {
          job.scratch = true;
          job.scratchStart = time;
          const held = engine.snapshot()[from];
          job.backRoom = Math.max(0, held.time - (held.loopStart ?? 0));
          job.forwardRoom = Math.max(0, (held.loopEnd ?? held.duration) - held.time - .002);
          job.stroke = 0;
        }
      }
      if (job.scratch) {
        const fraction = clamp((time - job.scratchStart) / Math.min(360, 42000 / job.bpm));
        const gesture = .09 * Math.sin(fraction * 2 * Math.PI);
        const position = Math.max(-job.backRoom, Math.min(job.forwardRoom, gesture));
        engine.moveScratch(from, position - job.stroke);
        job.stroke = position;
        if (fraction >= 1) { engine.endScratch(from); job.scratch = false; }
      }
    }

    function advance(job, state, time) {
      const source = state[job.from], incoming = state[job.to];
      if (!source.playing || source.loadVersion !== job.source.loadVersion) { close(false); return; }
      if (!job.incoming) {
        if (job.loadStarted !== undefined && time - job.loadStarted > 20000) fail(job);
        return;
      }
      if (incoming.loadVersion !== job.incoming.loadVersion || incoming.audioFailed) { fail(job); return; }
      const dt = Math.max(0, time - job.last);
      job.last = time;
      if (!incoming.audioRunning) {
        // A stalled incoming stream cannot carry the programme late in a blend.
        if (time - job.waitSince > (job.elapsed > 0 ? 900 : 12000)) fail(job);
        return;
      }
      job.waitSince = time;
      if (job.stage === 'ready') {
        // Correct the phase once the incoming decoder is running, still behind a closed fader.
        if (source.baseBPM && incoming.baseBPM) engine.sync(job.to);
        job.stage = 'fade';
        onStatus('Сведение ' + job.from + ' → ' + job.to);
        return;
      }
      job.elapsed += dt;
      const progress = clamp(job.elapsed * job.bpm / (60000 * 16));
      engine.batch(() => applyFade(job, progress, time));
      if (progress === 1) close(true);
    }

    function pick(current) {
      played.add(current);
      const others = library.list().filter(track => track.id !== current);
      let choices = others.filter(track => !played.has(track.id));
      if (!choices.length) {
        played.clear();
        choices = others;
      }
      const id = choices[Math.floor(Math.random() * choices.length)]?.id;
      if (id) played.add(id);
      return id;
    }

    function sync() {
      const time = performance.now();
      const state = engine.snapshot();
      if (mix) { advance(mix, state, time); return; }
      if (directLoad || time < retryAfter) return;
      for (const id of auto) {
        const deck = state[id];
        if (!deck.playing || deck.loopBeats || deck.scratching || state[opposite(id)].playing || !deck.duration) continue;
        const rate = (1 + deck.tempo / 100) * (1 + deck.bend / 100);
        const remaining = (deck.duration - deck.time) / rate;
        if (remaining > Math.max(8, 24 * 60 / (deck.bpm || 120))) continue;
        const key = pick(deck.track.id);
        if (key) { void choose(id, key, true); return; }
      }
    }

    function ended(id) {
      if (mix || directLoad || !auto.has(id)) return;
      const state = engine.snapshot()[id];
      const key = pick(state.track?.id) || state.track?.id;
      if (key) void choose(id, key, true, true);
    }

    return {choose, setAuto, isAuto: id => auto.has(id), cancel, manual: cancel, ended, sync};
  }

  window.DJCompactMix = {create};
})();
