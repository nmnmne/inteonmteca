(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.dataset.yardLayer = '';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  layer.innerHTML = '<picture><source media="(max-width: 680px) and (orientation: portrait)"><img alt=""></picture>';
  const field = document.querySelector('.perception-field');
  if (field) field.after(layer);
  else document.body.prepend(layer);
  const consoleSurface = document.querySelector('.room-console');
  let lenses, lensResize, view;
  let lensLayoutDirty = true;
  let nextReflection = 0;
  let controller = null;
  let retryTimer = 0, lastRetry = -Infinity;

  const poster = layer.querySelector('img');
  const mobilePoster = layer.querySelector('source');
  let clock;
  function updatePoster() {
    if (document.hidden || (clock === undefined && location.protocol !== 'file:')) return;
    const sun = clock?.sunForLocation(clock.COURTYARD_ORIGIN, Date.now());
    let phase = 'day';
    if (sun && sun.elevationDeg < -6) phase = 'night';
    else if (sun && sun.elevationDeg < 8) phase = sun.direction[0] > 0 ? 'dawn' : 'dusk';
    if (layer.dataset.solarPhase === phase) return;
    const suffix = phase === 'day' ? '' : '-' + phase;
    mobilePoster.srcset = 'yard/assets/spawn-mobile' + suffix + '.jpg';
    poster.src = 'yard/assets/spawn-desktop' + suffix + '.jpg';
    layer.dataset.solarPhase = phase;
  }
  if (location.protocol === 'file:') updatePoster();
  else import('./yard/solar-clock.js').then(module => { clock = module; updatePoster(); }, () => { clock = null; updatePoster(); });
  let posterTimer;
  function schedulePoster() {
    clearInterval(posterTimer);
    if (document.hidden) return;
    updatePoster();
    posterTimer = setInterval(updatePoster, 180000);
  }
  window.addEventListener('pagehide', () => clearInterval(posterTimer));
  window.addEventListener('pageshow', schedulePoster);
  document.addEventListener('visibilitychange', schedulePoster);

  function reflect(source, now) {
    if (document.body.dataset.djMode === 'compact') return;
    if (document.body.dataset.yardWindow && document.body.dataset.yardWindow !== 'dj') return;
    if (now < nextReflection) return;
    const level = Number(document.documentElement.dataset.graphicsLevel) || 3;
    nextReflection = now + 1000 / (level <= 2 ? 6 : 12);
    if (!lenses) {
      const wheels = consoleSurface.querySelectorAll('.dd-jog');
      if (!wheels.length) return;
      lensResize = new ResizeObserver(invalidateLenses);
      lensResize.observe(source);
      lensResize.observe(consoleSurface);
      lenses = Array.from(wheels, wheel => {
        const lens = document.createElement('canvas');
        lens.className = 'jog-refraction';
        lens.setAttribute('aria-hidden', 'true');
        wheel.prepend(lens);
        const ctx = lens.getContext('2d');
        lensResize.observe(wheel);
        return ctx ? {wheel,ctx,lens,ring:null} : null;
      }).filter(Boolean);
      window.addEventListener('scroll', invalidateLenses, {capture:true,passive:true});
      window.addEventListener('resize', invalidateLenses);
    }
    if (lensLayoutDirty) {
      view = source.getBoundingClientRect();
      for (const item of lenses) item.ring = item.wheel.getBoundingClientRect();
      lensLayoutDirty = false;
    }
    if (!view.width || !view.height) return;
    const sx = source.width / view.width, sy = source.height / view.height;
    for (const {lens,ctx,ring} of lenses) {
      if (!ring.width || ring.bottom <= view.top || ring.top >= view.bottom || ring.right <= view.left || ring.left >= view.right) continue;
      const size = Math.min(level <= 2 ? 112 : 200, Math.ceil(ring.width));
      if (lens.width !== size) lens.width = lens.height = size;
      // Sample only the visible jog from the live GPU frame. The main faceplate
      // has no backing image or reflection buffer.
      const x = (ring.left - view.left + .035 * ring.width) * sx;
      const y = (ring.top - view.top + .018 * ring.height) * sy;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(source, x, y, ring.width * sx * .93, ring.height * sy * .93, 0, 0, size, size);
    }
  }
  function invalidateLenses() { lensLayoutDirty = true; }
  window.addEventListener('yard-app-visibility', invalidateLenses);
  window.addEventListener('yard-dj-mode', invalidateLenses);
  function clearReflections() {
    lensResize?.disconnect();
    window.removeEventListener('scroll', invalidateLenses, true);
    window.removeEventListener('resize', invalidateLenses);
    for (const {lens} of lenses || []) lens.remove();
    lensResize = lenses = view = null;
    lensLayoutDirty = true;
  }

  function stop() {
    clearTimeout(retryTimer);
    controller?.abort();
    controller = null;
    layer.querySelector('canvas')?.remove();
    clearReflections();
    nextReflection = 0;
    document.body.dataset.yardBackdrop = 'still';
  }

  async function start() {
    if (controller || document.hidden || motion.matches || location.protocol === 'file:') return;
    const run = new AbortController();
    controller = run;
    const canvas = document.createElement('canvas');
    layer.append(canvas);
    document.body.dataset.yardBackdrop = 'loading';
    const fallback = error => {
      if (run.signal.aborted || controller !== run) return;
      stop();
      document.body.dataset.yardBackdrop = 'fallback';
      // A lost context or interrupted download can recover while the deck keeps
      // playing. A device without WebGL simply uses its time-of-day poster.
      const now = performance.now();
      if (navigator.onLine && !/creating WebGL context/i.test(error?.message || '') && now - lastRetry > 60000) {
        lastRetry = now;
        retryTimer = setTimeout(start, 2200);
      }
    };
    try {
      const { startAmbientScene } = await import('./yard/ambient-scene.js?v=crow-flock-1');
      if (run.signal.aborted) return;
      await startAmbientScene(canvas, {
        signal: run.signal,
        clearView: Boolean(consoleSurface),
        onFrame: consoleSurface ? reflect : undefined,
        onReady() { if (!run.signal.aborted) document.body.dataset.yardBackdrop = 'live'; },
        onError: fallback,
      });
    } catch (error) { fallback(error); }
  }

  document.body.dataset.yardBackdrop = 'still';
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  window.addEventListener('online', start);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void start(); });
  motion.addEventListener('change', () => { if (motion.matches) stop(); else void start(); });
  // Paint the poster and the mixer before compiling the courtyard's WebGL scene.
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 900 });
  else requestAnimationFrame(start);
})();
