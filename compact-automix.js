(() => {
  'use strict';

  const preMs = 10_000, blendMs = 20_000, postMs = 10_000;
  const handoffMs = preMs + blendMs;

  const opposite = id => id === 'A' ? 'B' : 'A';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ramp = (value, start, end) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };

  const towards = (value, target, amount) => value + (target - value) * amount;

  function create(engine, library, {onDeckChange, onStatus}) {
    const auto = new Set();
    const played = new Set();
    const nextPaused = new Map();
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
      if (enabled !== auto.has(id)) nextPaused.delete(id);
      if (enabled) auto.add(id);
      else {
        auto.delete(id);
        if (mix?.automatic && (mix.stage === 'post' ? mix.to : mix.from) === id) cancel();
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
      const {from, to, source, incoming} = job;
      const state = engine.snapshot();
      if (job.stage === 'post') {
        mix = null;
        if (state[to].loadVersion === incoming.loadVersion) engine.batch(() => {
          engine.setFilter(to, incoming.filter);
          engine.setEcho(to, incoming.echo);
          if (state[to].tempo !== incoming.tempo) engine.setTempo(to, incoming.tempo);
          if (job.holdTailLoop) engine.setLoop(to, 0);
        });
        onStatus(message);
        schedule();
        return;
      }
      if (completed) {
        job.stage = 'post';
        const deck = state[to];
        const rate = (1 + Math.max(deck.tempo, incoming.tempo) / 100) * (1 + deck.bend / 100);
        // Keep a short auto track audible until it can stage its successor.
        job.holdTailLoop = auto.has(from) && deck.duration > 0
          && (deck.duration - deck.time) / rate <= postMs / 1000 + 1;
      } else mix = null;
      engine.batch(() => {
        if (state[from].loadVersion === source.loadVersion) {
          if (job.scratch && state[from].scratching) engine.endScratch(from);
          if (completed && engine.snapshot()[from].playing) engine.toggle(from);
          engine.setLoop(from, source.loopBeats, job.bpm);
          if (incoming) restoreTone(from, source);
        }
        if (incoming && state[to].loadVersion === incoming.loadVersion) {
          if (!completed && state[to].playing) engine.toggle(to);
          if (!job.holdTailLoop) engine.setLoop(to, 0);
          if (completed) engine.setChannel(to, source.channel);
          else {
            restoreTone(to, incoming);
            if (state[to].tempo !== incoming.tempo) engine.setTempo(to, incoming.tempo);
          }
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
      onStatus(completed ? 'Эффекты после перехода' : message);
      schedule();
    }

    function cancel() {
      ++sequence;
      nextPaused.clear();
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

    function loopSource(job) {
      if (!job.beats) job.beats = setUsableLoop(job.from, 8, job.bpm);
    }

    function guardEnding(job, deck, untilBlend) {
      if (job.beats || !deck.duration) return;
      const rate = (1 + deck.tempo / 100) * (1 + deck.bend / 100);
      const remaining = (deck.duration - deck.time) / rate;
      // The pre-effect normally plays over the uninterrupted original. Hold
      // only its last two seconds if the incoming decoder or prelude needs longer.
      if (remaining <= Math.min(2, untilBlend / 1000 + .35)) loopSource(job);
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
        stage: 'load', incoming: null, scratch: false, loopStep: 0,
        requestedAt:performance.now(), beats:source.loopBeats};
      mix = job;
      guardEnding(job, source, preMs);
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
        job.waitSince = performance.now();
        return true;
      } catch {
        fail(job);
        return false;
      }
    }

    function applyLead(job, progress) {
      const amount = ramp(progress, 0, 1);
      engine.setFilter(job.from, towards(job.source.filter, 1, .14 * amount));
      engine.setEcho(job.from, towards(job.source.echo, 1, .16 * amount));
    }

    function applyTail(job, progress) {
      const remaining = 1 - ramp(progress, 0, 1);
      if (job.syncedTempo !== job.incoming.tempo) {
        engine.setTempo(job.to, towards(job.incoming.tempo, job.syncedTempo, remaining));
      }
      engine.setFilter(job.to, towards(job.incoming.filter, 1, .12 * remaining));
      engine.setEcho(job.to, towards(job.incoming.echo, 1, .19 * remaining));
    }

    function applyFade(job, p, time) {
      const {from, to, source, incoming} = job;
      engine.setCross((from === 'A' ? 1 : -1) * (2 * ramp(p, 0, 1) - 1));
      engine.setEQ(to, 'low', towards(-24, incoming.eq.low, ramp(p, .38, .72)));
      engine.setEQ(from, 'low', towards(source.eq.low, -24, ramp(p, .22, .57)));
      engine.setEQ(to, 'mid', towards(-7, incoming.eq.mid, ramp(p, 0, .6)));
      engine.setEQ(from, 'mid', towards(source.eq.mid, -9, ramp(p, .48, 1)));
      engine.setFilter(to, towards(-.30, incoming.filter, ramp(p, 0, .65))
        + (1 - incoming.filter) * .12 * ramp(p, .65, 1));
      engine.setEcho(to, towards(incoming.echo, 1, .19 * ramp(p, .65, 1)));
      engine.setFilter(from, towards(towards(source.filter, 1, .14), .52, ramp(p, .38, .97)));
      engine.setEcho(from, towards(towards(source.echo, 1, .16), .34, ramp(p, .53, .9)));
      const step = p >= .84 ? 3 : p >= .66 ? 2 : p >= .44 ? 1 : 0;
      if (!job.scratch && step > job.loopStep && job.beats) {
        engine.setLoop(from, Math.max(Math.min(.5, job.beats), job.beats / (2 ** step)), job.bpm);
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
      // After handoff the old deck is free and may already have a different track.
      if (job.stage !== 'post' && (!source.playing || source.loadVersion !== job.source.loadVersion)) {
        close(false); return;
      }
      if (job.stage === 'load' || job.stage === 'ready' || job.stage === 'pre') {
        const untilBlend = job.startedAt === undefined ? preMs : Math.max(0, preMs - (time - job.startedAt));
        guardEnding(job, source, untilBlend);
      }
      if (!job.incoming) {
        if (job.loadStarted === undefined ? time - job.requestedAt > 120000 : time - job.loadStarted > 20000) fail(job);
        return;
      }
      if (incoming.loadVersion !== job.incoming.loadVersion || incoming.audioFailed) { fail(job); return; }
      if (job.stage !== 'post') {
        if (!incoming.audioRunning) {
          // A stalled incoming stream cannot carry the programme late in a blend.
          if (time - job.waitSince > (job.stage === 'fade' ? 900 : 12000)) fail(job);
          return;
        }
        job.waitSince = time;
        if (job.stage === 'ready') {
          if (source.baseBPM && incoming.baseBPM) engine.sync(job.to);
          job.syncedTempo = engine.snapshot()[job.to].tempo;
          job.startedAt = time;
          job.stage = 'pre';
          onStatus('Эффекты перед переходом');
        }
      }
      // Phase boundaries all use the same monotonic clock, independent of the
      // beat grid, callback jitter and the device's render frame rate.
      const elapsed = time - job.startedAt;
      if (elapsed < preMs) {
        engine.batch(() => applyLead(job, elapsed / preMs));
        return;
      }
      if (job.stage === 'pre') {
        loopSource(job);
        job.stage = 'fade';
        onStatus('Сведение ' + job.from + ' → ' + job.to);
      }
      if (job.stage === 'fade') {
        engine.batch(() => applyFade(job, clamp((elapsed - preMs) / blendMs), time));
        if (elapsed < handoffMs) return;
        close(true);
      }
      if (elapsed >= handoffMs + postMs || !incoming.playing) close(false);
      else engine.batch(() => applyTail(job, (elapsed - handoffMs) / postMs));
    }

    function pick(current, attempted) {
      played.add(current);
      const others = library.list().filter(track => track.id !== current && !attempted?.has(track.id));
      if (!others.length) return;
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
        if (remaining > Math.min(handoffMs / 1000, deck.duration / rate / 2)) continue;
        const key = pick(deck.track.id);
        if (key) { void choose(id, key, true); return; }
      }
    }

    async function ended(id, loadVersion) {
      const deck = engine.snapshot()[id];
      if (!deck?.ended || !deck.track || deck.loadVersion !== loadVersion || deck.loopBeats) return;
      if (mix?.stage === 'post' && mix.to === id) close(false);
      if (mix || directLoad || nextPaused.has(id)) return;
      if (auto.has(id)) {
        const key = pick(deck.track.id) || deck.track.id;
        return choose(id, key, true, true);
      }

      // A standby load owns only this deck. A playing second deck keeps its transport.
      const attempted = new Set();
      nextPaused.set(id, attempted);
      const isCurrent = () => {
        const current = engine.snapshot()[id];
        return nextPaused.get(id) === attempted && current.loadVersion === loadVersion && current.ended;
      };
      try {
        while (isCurrent()) {
          const key = pick(deck.track.id, attempted);
          if (!key) break;
          attempted.add(key);
          try {
            if (await library.load(id, key, isCurrent)) return;
          } catch { /* Try another entry if a stored import cannot be opened. */ }
        }
      } finally {
        if (nextPaused.get(id) === attempted) nextPaused.delete(id);
      }
    }

    return {choose, setAuto, isAuto: id => auto.has(id), cancel, manual: cancel, ended, sync};
  }

  window.DJCompactMix = {create};
})();
