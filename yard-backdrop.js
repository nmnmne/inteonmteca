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
  const reflection = consoleSurface ? document.createElement('canvas') : null;
  let lenses;
  let reflectionContext;
  const reflectionInterval = 1000 / 15;
  let nextReflection = 0;
  if (reflection) {
    reflection.className = 'console-reflection';
    reflection.setAttribute('aria-hidden', 'true');
    consoleSurface.prepend(reflection);
    reflectionContext = reflection.getContext('2d');
  }
  let controller = null;

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
  poster.addEventListener('load', () => {
    if (reflection) reflection.style.backgroundImage = 'url("' + poster.currentSrc + '")';
  });
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
    if (!reflectionContext || now < nextReflection) return;
    nextReflection = now + reflectionInterval - (nextReflection ? (now - nextReflection) % reflectionInterval : 0);
    const scale = Math.min(1, 640 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    if (reflection.width !== width || reflection.height !== height) {
      reflection.width = width;
      reflection.height = height;
    }
    // Sample the completed WebGL frame while its drawing buffer is available.
    reflectionContext.drawImage(source, 0, 0, width, height);

    // The curved shoulder of each jog refracts the part of the courtyard
    // directly behind it. The flat centre transmits the original scene.
    if (!lenses) {
      const wheels = consoleSurface.querySelectorAll('.dd-jog');
      if (!wheels.length) return;
      lenses = Array.from(wheels, wheel => {
        const lens = document.createElement('canvas');
        lens.className = 'jog-refraction';
        lens.setAttribute('aria-hidden', 'true');
        wheel.prepend(lens);
        return lens.getContext('2d');
      }).filter(Boolean);
    }
    const view = source.getBoundingClientRect();
    if (!view.width || !view.height) return;
    for (const lens of lenses) {
      const canvas = lens.canvas, ring = canvas.getBoundingClientRect();
      if (!ring.width || ring.bottom <= 0 || ring.top >= view.bottom) continue;
      const size = Math.min(240, Math.ceil(ring.width));
      if (canvas.width !== size) canvas.width = canvas.height = size;
      const sx = width / view.width, sy = height / view.height;
      // Looking into a convex rim enlarges the scene and bends it slightly
      // towards the lit upper edge. CSS limits this sample to the curved band.
      const x = (ring.left - view.left + .035 * ring.width) * sx;
      const y = (ring.top - view.top + .018 * ring.height) * sy;
      lens.clearRect(0, 0, size, size);
      lens.drawImage(reflection, x, y, ring.width * sx * .93, ring.height * sy * .93, 0, 0, size, size);
    }
  }

  function clearReflections() {
    reflectionContext?.clearRect(0, 0, reflection.width, reflection.height);
    for (const lens of lenses || []) lens.clearRect(0, 0, lens.canvas.width, lens.canvas.height);
  }

  function stop() {
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
    const fallback = () => {
      if (run.signal.aborted) return;
      clearReflections();
      document.body.dataset.yardBackdrop = 'fallback';
    };
    try {
      const { startAmbientScene } = await import('./yard/ambient-scene.js?v=courtyard-weather-1');
      if (run.signal.aborted) return;
      await startAmbientScene(canvas, {
        signal: run.signal,
        clearView: Boolean(consoleSurface),
        onFrame: reflectionContext ? reflect : undefined,
        onReady() { if (!run.signal.aborted) document.body.dataset.yardBackdrop = 'live'; },
        onError: fallback,
      });
    } catch { fallback(); }
  }

  document.body.dataset.yardBackdrop = 'still';
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void start(); });
  motion.addEventListener('change', () => { if (motion.matches) stop(); else void start(); });
  // Paint the poster and the mixer before compiling the courtyard's WebGL scene.
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 900 });
  else requestAnimationFrame(start);
})();
