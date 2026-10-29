/* Shared scene exclusivity; decoration keeps its 5s motion / 2s rest clock.
   Bounded mobile foreground scenes own wall-time completion independently. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, suspended = false, away = false, pageDeparted = false, claimedAt = 0, claimedMotionAt = 0;
  const scatteredSources = new Set(), motionTimers = new Map();
  const logoScenes = new Set(['acid', 'storm', 'recursion']);
  let nextMotionTimer = 0, recoveryTimer = 0;
  let ambientFrozen = false, ambientTimer = 0, ambientClockPaused = false, scheduleGeneration = 0;
  let ambientAt = performance.now(), ambientElapsed = ambientAt;
  const motionDurationMs = 5000, freezeDurationMs = 2000;
  const scheduleEpoch = ambientAt, schedulePeriod = motionDurationMs + freezeDurationMs;
  let freezeUntil = 0;
  const currentMode = () => scatteredSources.size ? 'scattered' : 'assembled';
  const ambientNow = (now = performance.now()) => ambientElapsed + (ambientClockPaused ? 0 : Math.max(0, now - ambientAt));
  const boundaryAfter = now => {
    const cycle = Math.max(0, Math.floor((now - scheduleEpoch) / schedulePeriod));
    const start = scheduleEpoch + cycle * schedulePeriod;
    if (now < start + motionDurationMs) return {at: start + motionDurationMs, freeze: true, end: start + schedulePeriod};
    return {at: start + schedulePeriod, freeze: false, end: start + schedulePeriod};
  };
  let nextBoundary = boundaryAfter(scheduleEpoch);
  const armMotionTimer = (id, entry) => {
    clearTimeout(entry.timer); entry.timer = 0;
    const token = ++entry.generation;
    if (ambientClockPaused) return;
    entry.timer = setTimeout(() => {
      if (entry.generation !== token) return;
      entry.timer = 0;
      if (ambientClockPaused || !motionTimers.has(id)) return;
      motionTimers.delete(id);
      entry.callback();
    }, Math.max(0, entry.at - ambientNow()));
  };
  const updateAmbient = (now, force = false) => {
    const wasPaused = ambientClockPaused;
    const previousMode = root.dataset.logoMotion;
    ambientElapsed = ambientNow(now);
    ambientAt = now;
    ambientFrozen = freezeUntil > now;
    ambientClockPaused = suspended || ambientFrozen;
    root.dataset.logoMotion = currentMode();
    root.dataset.ambientPhase = ambientClockPaused ? 'frozen' : 'running';
    if (wasPaused !== ambientClockPaused || force || previousMode !== currentMode()) {
      root.style?.setProperty('--ambient-freeze-duration', `${ambientFrozen ? freezeUntil - now : freezeDurationMs}ms`);
    }
    if (wasPaused !== ambientClockPaused || force) {
      for (const [id, entry] of motionTimers) armMotionTimer(id, entry);
      window.dispatchEvent(new Event('inteon-ambient-change'));
    }
  };
  const cancelSchedule = () => {
    clearTimeout(ambientTimer); ambientTimer = 0; scheduleGeneration++;
  };
  const armSchedule = () => {
    cancelSchedule();
    if (suspended) return;
    const token = scheduleGeneration;
    ambientTimer = setTimeout(() => {
      if (token !== scheduleGeneration) return;
      ambientTimer = 0;
      advanceSchedule(performance.now());
    }, Math.max(0, nextBoundary.at - performance.now()));
  };
  const advanceSchedule = now => {
    if (suspended) return;
    if (nextBoundary.at > now) { if (!ambientTimer) armSchedule(); return; }
    // A delayed visible task needs at most this cycle's boundaries. Hidden
    // re-entry takes a separate path and never accepts missed boundaries.
    const cycleStart = scheduleEpoch + Math.floor((now - scheduleEpoch) / schedulePeriod) * schedulePeriod;
    if (nextBoundary.at < cycleStart) {
      if (freezeUntil <= cycleStart) freezeUntil = 0;
      nextBoundary = boundaryAfter(cycleStart);
    }
    while (nextBoundary.at <= now) {
      const boundary = nextBoundary;
      freezeUntil = boundary.freeze && boundary.end > now ? boundary.end : 0;
      nextBoundary = boundaryAfter(boundary.at);
    }
    updateAmbient(now);
    armSchedule();
  };
  const syncAmbient = () => {
    cancelSchedule();
    const now = performance.now();
    if (freezeUntil <= now) freezeUntil = 0;
    nextBoundary = boundaryAfter(now);
    updateAmbient(now);
    armSchedule();
  };
  const renderers = new Map();
  const recover = () => {
    // Mobile browsers can restore a visible document without a second pageshow.
    if (!document.hidden && !document.body.classList.contains('portal-leaving')) away = false;
    sync();
    if (suspended) return;
    const now = performance.now();
    const limits = {theme: 6000, acid: 16000, storm: 90000, interlude: 65000, cloud: 85000, 'mobile-scatter': 6000, recursion: 8000};
    const claimedElapsed = logoScenes.has(active) ? ambientNow(now) - claimedMotionAt : now - claimedAt;
    if (active && claimedElapsed > (limits[active] || 90000)) {
      const stale = active;
      if (stale === 'acid') window.inteonLogoAcid?.stop();
      else if (stale === 'storm') window.inteonLogoStorm?.stop();
      else if (stale === 'interlude' || stale === 'cloud') window.inteonAtmosphere?.stop();
      else if (stale === 'theme') window.inteonThemeMorph?.finish();
      else if (stale === 'mobile-scatter') window.inteonMobileLogo?.stop();
      else if (stale === 'recursion') window.inteonLogoMaterials?.stop();
      if (active === stale) { active = null; publish(); }
    }
    for (const renderer of renderers.values()) {
      if (renderer.blocked()) { renderer.last = now; continue; }
      if (now - renderer.last < 2000) continue;
      renderer.last = now;
      renderer.restart();
    }
  };
  const publish = () => {
    if (active) root.dataset.homeEffect = active;
    else delete root.dataset.homeEffect;
    root.dataset.homeEffectsSuspended = String(suspended);
    window.dispatchEvent(new Event('inteon-effects-change'));
  };
  const sync = () => {
    const next = pageDeparted || away || document.hidden || document.body.classList.contains('portal-leaving');
    if (next === suspended) return;
    suspended = next;
    publish();
    syncAmbient();
    if (suspended) { clearInterval(recoveryTimer); recoveryTimer = 0; }
    else if (!recoveryTimer) recoveryTimer = setInterval(recover, 1000);
  };
  window.inteonHomeEffects = Object.freeze({
    claim(name) {
      const paletteAllowed = name === 'theme' && !pageDeparted && !away && !document.hidden && !reduced.matches && !document.body.classList.contains('portal-leaving');
      if (!name || active || (suspended && !paletteAllowed)) return false;
      active = name; claimedAt = performance.now(); claimedMotionAt = ambientNow(claimedAt);
      publish();
      return true;
    },
    release(name) {
      if (active !== name) return;
      active = null;
      publish();
    },
    get active() { return active; },
    get suspended() { return suspended; },
    get ambientBlocked() { return suspended; },
    get ambientPaused() { return suspended || ambientFrozen; },
    ambientNow,
    setLogoScattered(source, scattered) {
      if (typeof source !== 'string' || !source) return;
      const now = performance.now();
      // Logo changes never restart or cancel the common five-second cadence.
      advanceSchedule(now);
      const wasScattered = scatteredSources.size > 0;
      if (scattered) scatteredSources.add(source);
      else scatteredSources.delete(source);
      if (wasScattered !== (scatteredSources.size > 0)) {
        updateAmbient(now);
      }
    },
    setMotionTimeout(callback, delay) {
      const id = ++nextMotionTimer;
      const entry = {callback, at: ambientNow() + Math.max(0, Number(delay) || 0), timer: 0, generation: 0};
      motionTimers.set(id, entry);
      armMotionTimer(id, entry);
      return id;
    },
    clearMotionTimeout(id) {
      const entry = motionTimers.get(id);
      if (entry) clearTimeout(entry.timer);
      motionTimers.delete(id);
    },
    watch(name, {blocked, restart}) { renderers.set(name, {blocked, restart, last: performance.now()}); },
    beat(name) { const renderer = renderers.get(name); if (renderer) renderer.last = performance.now(); },
  });
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {attributes: true, attributeFilter: ['class', 'data-mobile-section']});
  document.querySelectorAll('#chat-panel, #theme-panel, #auth-panel').forEach(panel => observer.observe(panel, {attributes: true, attributeFilter: ['hidden', 'class']}));
  const returnToPage = () => { if (!document.hidden) pageDeparted = false; recover(); };
  document.addEventListener('visibilitychange', returnToPage);
  reduced.addEventListener('change', sync);
  window.addEventListener('focus', returnToPage);
  document.addEventListener('resume', returnToPage);
  window.addEventListener('pagehide', () => { pageDeparted = true; away = true; sync(); });
  window.addEventListener('pageshow', () => { pageDeparted = false; away = false; sync(); });
  sync();
  updateAmbient(performance.now(), true);
  armSchedule();
  if (!suspended && !recoveryTimer) recoveryTimer = setInterval(recover, 1000);
})();
