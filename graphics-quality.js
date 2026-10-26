/* Bounded frame-pacing feedback chooses detail, never the animation cadence. */
(() => {
  'use strict';
  const root = document.documentElement;
  const mobile = matchMedia('(max-width: 800px), (pointer: coarse)').matches;
  const sampleMs = 4000, initialWaitMs = mobile ? 1000 : 4000, manualMs = 60000, maximumWaitMs = 30000;
  let level = mobile ? 3 : 5, fps = null, baselineFps = null, activeFps = null;
  let lowerTailFps = null, p95FrameMs = null, cadencePeriod = null;
  let missedFrames = 0, missedFrameRatio = 0, activeSampleMs = 0, lightSampleMs = 0;
  let cadenceCandidate = null, cadenceCandidateCount = 0, needsRecalibration = false;
  let cleanSamples = 0, trial = null, reference = null, reason = 'initial';
  let state = 'loading', waitMs = initialWaitMs, nextSampleAt = null, manualUntil = 0;
  let timer = 0, frame = 0, generation = 0, started = false, departed = false;
  let phaseGeneration = 0;
  let sampleFrames = 0, sampleDurationMs = 0;
  root.dataset.graphicsLevel = String(level);

  const snapshot = () => Object.freeze({
    level, fps, baselineFps, state, waitMs, nextSampleAt, manualUntil,
    mode: manualUntil > performance.now() ? 'manual' : 'auto',
    sampleFrames, sampleDurationMs, activeFps, lowerTailFps, p95FrameMs,
    cadenceFps: cadencePeriod === null ? null : 1000 / cadencePeriod,
    missedFrames, missedFrameRatio, activeSampleMs, lightSampleMs, reason,
  });
  const publish = () => window.dispatchEvent(new CustomEvent('inteon-quality-state', {detail: snapshot()}));
  const changeLevel = next => {
    if (level === next) return false;
    level = next;
    root.dataset.graphicsLevel = String(level);
    window.dispatchEvent(new CustomEvent('inteon-quality-change', {detail: snapshot()}));
    return true;
  };
  const visible = () => started && !departed && !document.hidden;
  const heavy = () => (mobile && ['mobile-scatter', 'acid', 'recursion'].includes(window.inteonHomeEffects?.active))
    || root.dataset.ambientPhase !== 'frozen' && !window.inteonHomeEffects?.ambientPaused;
  const cancelWork = () => {
    clearTimeout(timer); cancelAnimationFrame(frame);
    timer = frame = 0; generation++;
    nextSampleAt = null;
  };
  const suspend = () => {
    cancelWork();
    if (state !== 'suspended') { state = 'suspended'; publish(); }
  };
  const arm = (delay, callback) => {
    nextSampleAt = performance.now() + delay;
    timer = setTimeout(() => { timer = 0; nextSampleAt = null; callback(); }, delay);
  };
  const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return {count: values.length, duration: values.reduce((sum, value) => sum + value, 0),
      fast: percentile(sorted, .2), p90: percentile(sorted, .9), p95: percentile(sorted, .95),
      max: sorted.at(-1)};
  };
  const updateCadence = (active, light) => {
    // Light periods are a reference, never evidence that richer heavy work fits.
    const calibration = light.count >= 12 && (!active.count || light.fast <= active.fast) ? light : active;
    if (!calibration.count) return false;
    const candidate = Math.min(1000 / 30, calibration.fast);
    if (cadencePeriod === null || candidate < cadencePeriod * .92) {
      cadencePeriod = candidate; cadenceCandidate = null; cadenceCandidateCount = 0;
      needsRecalibration = false; cleanSamples = 0;
      return false;
    }
    const slower = candidate > cadencePeriod * 1.18;
    const regular = calibration.p90 <= calibration.fast * 1.12;
    // A constant half-rate heavy scene alone cannot redefine a known faster
    // display. A light reference, or an explicit display/lifecycle change, can.
    if (slower && regular && (light.count >= 12 || needsRecalibration) && !trial) {
      cadenceCandidateCount = cadenceCandidate !== null && Math.abs(candidate - cadenceCandidate) < candidate * .08
        ? cadenceCandidateCount + 1 : 1;
      cadenceCandidate = candidate; cleanSamples = 0;
      if (cadenceCandidateCount >= 3) {
        cadencePeriod = candidate; cadenceCandidate = null; cadenceCandidateCount = 0;
        needsRecalibration = false;
      }
      return true;
    }
    cadenceCandidate = null; cadenceCandidateCount = 0;
    if (!slower) needsRecalibration = false;
    return false;
  };
  const finishSample = (intervals, activeIntervals, lightIntervals, elapsed) => {
    const active = summarize(activeIntervals), light = summarize(lightIntervals);
    const recalibrating = updateCadence(active, light);
    fps = intervals.length * 1000 / elapsed;
    if (baselineFps === null) baselineFps = fps;
    sampleFrames = intervals.length; sampleDurationMs = elapsed;
    activeSampleMs = active.duration; lightSampleMs = light.duration;
    activeFps = active.duration ? active.count * 1000 / active.duration : null;
    p95FrameMs = active.p95 ?? null;
    lowerTailFps = active.p95 ? 1000 / active.p95 : null;
    const period = cadencePeriod || 1000 / 60;
    const slots = activeIntervals.reduce((sum, interval) => sum + Math.max(1, Math.round(interval / period)), 0);
    missedFrames = Math.max(0, slots - active.count);
    missedFrameRatio = slots ? missedFrames / slots : 0;
    let next = level;
    const enough = active.duration >= 1000 && (active.count >= 15 || active.duration >= 3000 && active.count >= 3);
    const severe = enough && (active.p95 > period * 2.5 || missedFrameRatio > .22 || active.max >= 250);
    const struggling = enough && (active.p90 > period * 1.35 || active.p95 > period * 1.6 || missedFrameRatio > .07);
    const clean = enough && active.p90 <= period * 1.15 && active.p95 <= period * 1.3
      && missedFrameRatio < .025 && active.max < Math.max(100, period * 4);
    const trialRegressed = enough && trial && (lowerTailFps < trial.tail * .85 || missedFrameRatio > trial.missed + .035);
    if (!enough) reason = 'insufficient-active';
    else if (recalibrating) reason = 'cadence-recalibration';
    else if (severe || struggling || trialRegressed) {
      next = Math.max(1, level - (severe ? 2 : 1));
      if (trial) next = Math.min(next, trial.from);
      reason = trial ? 'trial-rollback' : severe ? 'overload-severe' : 'overload';
      cleanSamples = 0; trial = null;
    } else if (clean) {
      cleanSamples++;
      reason = 'stable';
      if (cleanSamples >= 3 && level < 10) {
        trial = {from: level, tail: lowerTailFps, missed: missedFrameRatio};
        next = level + 1; cleanSamples = 0; reason = 'quality-trial';
      }
    } else { cleanSamples = 0; reason = 'uneven-frames'; }

    const stable = enough && !recalibrating && next === level && reference?.level === level
      && Math.abs(activeFps - reference.fps) <= Math.max(2, reference.fps * .05)
      && Math.abs(active.p95 - reference.p95) <= reference.p95 * .1;
    waitMs = stable && (reason === 'stable' || level === 1)
      ? Math.min(maximumWaitMs, waitMs * 2) : initialWaitMs;
    reference = enough && !recalibrating ? {level: next, fps: activeFps, p95: active.p95} : null;
    state = 'waiting';
    arm(waitMs, beginSample);
    changeLevel(next);
    publish();
  };
  function beginSample() {
    if (!visible()) { suspend(); return; }
    cancelWork(); manualUntil = 0; state = 'sampling';
    const token = generation, intervals = [], activeIntervals = [], lightIntervals = [];
    let first = null, previous = null, previousHeavy = null, previousPhase = phaseGeneration;
    const sample = now => {
      frame = 0;
      if (token !== generation) return;
      if (!visible()) { suspend(); return; }
      const isHeavy = heavy();
      if (first === null) first = now;
      if (previous !== null && now > previous) {
        const interval = now - previous;
        intervals.push(interval);
        // Exclude the interval straddling a work/freeze boundary.
        if (isHeavy === previousHeavy && previousPhase === phaseGeneration) (isHeavy ? activeIntervals : lightIntervals).push(interval);
      }
      previous = now; previousHeavy = isHeavy; previousPhase = phaseGeneration;
      const elapsed = now - first;
      if (elapsed >= sampleMs) { finishSample(intervals, activeIntervals, lightIntervals, elapsed); return; }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    publish();
  }
  const warmup = () => {
    if (!visible()) { suspend(); return; }
    cancelWork();
    const remainingManual = Math.max(0, manualUntil - performance.now());
    state = remainingManual ? 'manual' : 'warming';
    arm(Math.max(initialWaitMs, remainingManual), beginSample);
    publish();
  };
  const recalibrate = (cause = 'environment') => {
    needsRecalibration = true; cadenceCandidate = null; cadenceCandidateCount = 0;
    cleanSamples = 0; trial = null; reference = null; waitMs = initialWaitMs;
    reason = typeof cause === 'string' ? cause : 'environment';
    if (visible()) warmup();
  };
  const setManualLevel = value => {
    if (!Number.isInteger(value) || value < 1 || value > 10) return false;
    cancelWork(); manualUntil = performance.now() + manualMs;
    waitMs = initialWaitMs; reference = null; cleanSamples = 0; trial = null; reason = 'manual';
    state = visible() ? 'manual' : started ? 'suspended' : 'loading';
    if (visible()) arm(manualMs, beginSample);
    changeLevel(value); publish(); return true;
  };
  window.inteonGraphicsQuality = Object.freeze({
    get level() { return level; }, get fps() { return fps; }, get baselineFps() { return baselineFps; },
    get activeFps() { return activeFps; }, get lowerTailFps() { return lowerTailFps; },
    get p95FrameMs() { return p95FrameMs; }, get cadenceFps() { return cadencePeriod === null ? null : 1000 / cadencePeriod; },
    get missedFrames() { return missedFrames; }, get missedFrameRatio() { return missedFrameRatio; },
    get activeSampleMs() { return activeSampleMs; }, get lightSampleMs() { return lightSampleMs; }, get reason() { return reason; },
    get state() { return state; }, get mode() { return manualUntil > performance.now() ? 'manual' : 'auto'; },
    get manualUntil() { return manualUntil; }, get nextSampleAt() { return nextSampleAt; }, get waitMs() { return waitMs; },
    snapshot, setManualLevel, recalibrate,
  });
  const start = () => { if (!started) { started = true; warmup(); } };
  window.addEventListener('inteon-ambient-change', () => { phaseGeneration++; });
  let currentScene = window.inteonHomeEffects?.active ?? null;
  window.addEventListener('inteon-effects-change', () => {
    const scene = window.inteonHomeEffects?.active ?? null;
    if (scene === currentScene) return;
    currentScene = scene;
    // A new heavy scene must not inherit a quiet scene's thirty-second wait.
    // Preserve the user's explicit one-minute manual choice and the full sample.
    if (!visible() || baselineFps === null || manualUntil > performance.now()) return;
    reference = null; cleanSamples = 0; trial = null; waitMs = initialWaitMs;
    reason = 'scene-change';
    beginSample();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else if (started) recalibrate('visibility');
  });
  window.addEventListener('resize', () => recalibrate('resize'));
  window.addEventListener('focus', () => recalibrate('focus'));
  window.addEventListener('pagehide', () => { departed = true; suspend(); });
  window.addEventListener('pageshow', () => {
    const returning = departed; departed = false;
    if (returning && started) recalibrate('pageshow');
    else if (!started && document.readyState === 'complete') start();
  });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, {once: true});
})();
