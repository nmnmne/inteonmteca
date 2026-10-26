/* Recursion: continuous contours expand behind the intact wordmark. */
(() => {
  const wrap = document.querySelector('#logo-wrap');
  if (!wrap) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let layer = null, frame = 0, started = 0, echoes = [], finish = null, deadline = 0;
  const mobile = matchMedia('(max-width: 800px), (pointer: coarse)');
  const motionNow = now => mobile.matches ? now : (window.inteonHomeEffects?.ambientNow(now) ?? now);
  const blocked = () => !layer || document.hidden || Boolean(window.inteonHomeEffects?.ambientBlocked || (!mobile.matches && window.inteonHomeEffects?.ambientPaused));
  const stop = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (deadline) clearTimeout(deadline); deadline = 0;
    layer?.remove(); layer = null; echoes = [];
    delete wrap.dataset.materialPreview;
    const resolve = finish; finish = null;
    window.inteonHomeEffects?.release('recursion');
    resolve?.();
  };
  const draw = now => {
    frame = 0;
    if (blocked()) return;
    window.inteonHomeEffects?.beat('logo-recursion');
    const t = (motionNow(now) - started) / 1000;
    if (t >= 6.5) { stop(); return; }
    echoes.forEach((contour, index) => {
      const phase = Math.max(0, Math.min(1, (t - index * .22) / (6.5 - index * .22)));
      const spread = 1 - Math.pow(1 - phase, 2);
      contour.setAttribute('transform', `translate(267 53.5) scale(${1 + spread * .35}) translate(-267 -53.5)`);
      contour.setAttribute('opacity', String(Math.pow(Math.sin(Math.PI * phase), 2) * .48));
    });
    frame = requestAnimationFrame(draw);
  };
  const sync = () => {
    if (blocked()) { cancelAnimationFrame(frame); frame = 0; }
    else if (!frame) frame = requestAnimationFrame(draw);
  };
  const run = name => {
    if (name !== 'recursion') return;
    stop();
    if (reduced.matches || document.hidden) return null;
    const surface = wrap.querySelector('.reactive-logo');
    if (!surface) return null;
    if (window.inteonHomeEffects && !window.inteonHomeEffects.claim('recursion')) return null;
    const completion = new Promise(resolve => { finish = resolve; });
    const ns = 'http://www.w3.org/2000/svg';
    const accent = `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-rgb')})`;
    const level = Math.min(mobile.matches ? 4 : 10, Number(document.documentElement.dataset.graphicsLevel) || 5);
    layer = document.createElementNS(ns, 'svg');
    layer.classList.add('logo-material-preview');
    layer.setAttribute('viewBox', '0 0 534 107');
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<defs>
      <mask id="recursion-word" maskUnits="userSpaceOnUse" x="0" y="0" width="534" height="107">
        <image href="assets/logo-wordmark.svg" width="534" height="107"/>
      </mask>
      <filter id="recursion-contour" x="-10%" y="-30%" width="120%" height="160%">
        <feMorphology in="SourceAlpha" operator="dilate" radius=".7" result="outer"/>
        <feComposite in="outer" in2="SourceAlpha" operator="out" result="rim"/>
        <feFlood flood-color="${accent}"/><feComposite in2="rim" operator="in"/>
      </filter>
    </defs>`;
    // Density is sampled once; the active scene never rebuilds on a quality change.
    echoes = Array.from({length: level <= 3 ? 2 : level <= 6 ? 3 : 5}, () => {
      const contour = document.createElementNS(ns, 'g');
      contour.setAttribute('filter', 'url(#recursion-contour)');
      contour.setAttribute('opacity', '0');
      contour.innerHTML = '<rect width="534" height="107" fill="white" mask="url(#recursion-word)"/>';
      layer.append(contour);
      return contour;
    });
    wrap.dataset.materialPreview = 'recursion';
    surface.append(layer);
    started = motionNow(performance.now());
    if (mobile.matches) deadline = setTimeout(stop, 6600);
    sync();
    return completion;
  };
  window.inteonLogoMaterials = {run, stop};
  window.addEventListener('inteon-ambient-change', sync);
  window.addEventListener('inteon-effects-change', () => {if (window.inteonHomeEffects?.suspended) stop(); else sync();});
  reduced.addEventListener('change', stop);
  window.inteonHomeEffects?.watch('logo-recursion', {blocked, restart: sync});
  document.addEventListener('visibilitychange', () => {if (document.hidden) stop();});
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
})();
