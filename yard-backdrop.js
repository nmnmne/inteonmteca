(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.dataset.yardLayer = '';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  layer.innerHTML = '<picture><source media="(max-width: 680px) and (orientation: portrait)" srcset="yard/assets/spawn-mobile.jpg"><img src="yard/assets/spawn-desktop.jpg" alt=""></picture>';
  const field = document.querySelector('.perception-field');
  if (field) field.after(layer);
  else document.body.prepend(layer);
  const consoleSurface = document.querySelector('.room-console');
  const reflection = consoleSurface ? document.createElement('canvas') : null;
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

  function reflect(source, now) {
    if (!reflectionContext || now < nextReflection) return;
    nextReflection = now + reflectionInterval - (nextReflection ? (now - nextReflection) % reflectionInterval : 0);
    const scale = Math.min(1, 320 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    if (reflection.width !== width || reflection.height !== height) {
      reflection.width = width;
      reflection.height = height;
    }
    // Sample the completed WebGL frame while its drawing buffer is available.
    reflectionContext.drawImage(source, 0, 0, width, height);
  }

  function stop() {
    controller?.abort();
    controller = null;
    layer.querySelector('canvas')?.remove();
    reflectionContext?.clearRect(0, 0, reflection.width, reflection.height);
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
      reflectionContext?.clearRect(0, 0, reflection.width, reflection.height);
      document.body.dataset.yardBackdrop = 'fallback';
    };
    try {
      const { startAmbientScene } = await import('./yard/ambient-scene.js?v=4');
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
