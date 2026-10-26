/* Fade between palettes without recalculating the entire page on every frame. */
(() => {
  const root = document.documentElement;
  const panel = document.querySelector('#theme-panel');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 4000;
  let target = null, metadata = null, active = false, frame = 0, generation = 0, deadline = 0;
  let pending = null, retry = 0;
  let nativeTransition = null;
  let notifiedGeneration = -1;
  const transitionStyle = document.createElement('style');
  transitionStyle.textContent = `
    html.is-theme-native::view-transition { pointer-events: none; }
    html.is-theme-native::view-transition-group(root) { animation: none; }
    html.is-theme-native::view-transition-image-pair(root) { isolation: isolate; }
    html.is-theme-native::view-transition-old(root) {
      z-index: 2; mix-blend-mode: normal;
      animation: palette-snapshot-out ${duration}ms cubic-bezier(.22,.61,.36,1) both;
    }
    html.is-theme-native::view-transition-new(root) { z-index: 1; animation: none; mix-blend-mode: normal; }
    @keyframes palette-snapshot-out { from { opacity: 1; } to { opacity: 0; } }
  `;
  document.head.append(transitionStyle);
  const clearPending = () => { clearTimeout(retry); retry = 0; pending = null; };
  const flushPending = () => {
    clearTimeout(retry); retry = 0;
    if (!pending) return;
    const controller = window.inteonHomeEffects;
    if (controller?.active && controller.active !== 'theme') {
      retry = setTimeout(flushPending, 100);
      return;
    }
    const request = pending;
    pending = null;
    window.inteonThemeMorph.apply(request.tokens, request.mood, request.animate, request.options);
  };
  const pinned = new Map();
  const pinPanel = () => {
    if (!panel || pinned.size) return;
    const styles = getComputedStyle(panel);
    for (const property of Object.keys(target)) {
      pinned.set(property, [panel.style.getPropertyValue(property), panel.style.getPropertyPriority(property)]);
      panel.style.setProperty(property, styles.getPropertyValue(property));
    }
    panel.classList.add('is-palette-pinned');
  };
  const unpinPanel = () => {
    if (!panel) return;
    for (const [property, [value, priority]] of pinned) {
      if (value) panel.style.setProperty(property, value, priority);
      else panel.style.removeProperty(property);
    }
    pinned.clear(); panel.classList.remove('is-palette-pinned');
  };
  const commit = () => {
    if (target) for (const [property, value] of Object.entries(target)) {
      if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
    }
    if (metadata?.name) { root.dataset.theme = metadata.name; root.dataset.themeMood = metadata.mood; }
    if (notifiedGeneration !== generation) {
      notifiedGeneration = generation;
      window.dispatchEvent(new Event('inteon-theme-frame'));
    }
  };
  const complete = token => {
    if (token !== generation) return;
    clearTimeout(deadline); deadline = 0;
    cancelAnimationFrame(frame); frame = 0; active = false;
    nativeTransition?.skipTransition(); nativeTransition = null;
    commit(); unpinPanel();
    root.classList.remove('is-theme-crossfading', 'is-theme-shifting', 'is-theme-native');
    window.inteonHomeEffects?.release('theme');
  };
  const finish = () => { clearPending(); if (active) complete(generation); };
  const interpolate = (from, to) => {
    const hex = value => /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).match(/../g).map(v => parseInt(v, 16)) : null;
    const a = hex(from), b = hex(to);
    if (a && b) return t => '#' + a.map((v,i) => Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');
    const number = /-?\d*\.?\d+/g;
    const x = from.match(number)?.map(Number), y = to.match(number)?.map(Number);
    if (x && y && x.length === y.length && from.replace(number,'#') === to.replace(number,'#')) {
      return t => { let i=0; return to.replace(number, () => {const n=x[i]+(y[i]-x[i])*t;i++;return n.toFixed(3);}); };
    }
    return t => t < 1 ? from : to;
  };
  window.inteonThemeMorph = {
    duration,
    apply(tokens, mood, animate, options = {}) {
      const controller = window.inteonHomeEffects;
      // A busy logo scene must defer the palette, never turn a smooth change
      // into a one-frame dark/light flash. Keep only the newest request.
      if (animate && !reduced.matches && !document.hidden && controller?.active && controller.active !== 'theme') {
        pending = {tokens, mood, animate, options};
        clearTimeout(retry);
        retry = setTimeout(flushPending, 100);
        return;
      }
      clearPending();
      const token = ++generation;
      clearTimeout(deadline); deadline = 0;
      cancelAnimationFrame(frame); frame = 0;
      nativeTransition?.skipTransition(); nativeTransition = null;
      const light = mood === 'light';
      target = {...tokens,
        '--interface-ink':tokens['--interface-ink'] || (light?'12, 15, 17':'249, 244, 233'),
        '--interface-muted':tokens['--interface-muted'] || (light?'38, 42, 43':'202, 196, 178'),
        '--interface-accent':tokens['--interface-accent'] || (light?'12, 15, 17':'218, 243, 149'),
        '--interface-peach':tokens['--interface-peach'] || (light?'12, 15, 17':'232, 178, 125'),
        '--interface-sage':tokens['--interface-sage'] || (light?'12, 15, 17':'191, 211, 151'),
        '--interface-glass':light?'250, 248, 239':'12, 14, 14',
        '--interface-control':light?'12, 15, 17':'230, 237, 232',
        '--interface-on-control':light?'251, 250, 245':'12, 15, 17',
        '--logo-brightness':light?'0':'1.45',
        '--field-opacity':light?'.19':'.27',
        '--field-strength':mood==='dark'?'.07':'.17',
      };
      metadata = {name: options.name, mood};
      const immediate = !animate || reduced.matches || document.hidden ||
        (controller && controller.active !== 'theme' && !controller.claim('theme'));
      if (immediate) { complete(token); return; }
      pinPanel();
      // Capture the old palette once. The new live page keeps animating while
      // the compositor fades its old image, without rewriting every CSS token.
      if (typeof document.startViewTransition === 'function') {
        active = true;
        root.classList.add('is-theme-native');
        deadline = setTimeout(() => complete(token), duration + 500);
        try {
          nativeTransition = document.startViewTransition(() => {
            if (token === generation) commit();
          });
          nativeTransition.ready.catch(() => {});
          nativeTransition.finished.then(() => complete(token), () => complete(token));
          return;
        } catch {
          clearTimeout(deadline); deadline = 0;
          root.classList.remove('is-theme-native');
        }
      }
      const styles = getComputedStyle(root);
      const tweens = Object.entries(target).map(([property,value]) => {
        const initial = styles.getPropertyValue(property).trim();
        return {property, tween: interpolate(initial, value), previous: initial, changed: initial !== value};
      }).filter(item => item.changed);
      active = true;
      if (metadata?.name) { root.dataset.theme = metadata.name; root.dataset.themeMood = metadata.mood; }
      // Browser frame throttling must never retain the foreground effect lock.
      deadline = setTimeout(() => complete(token), duration + 250);
      const start = performance.now();
      let lastPaint = -Infinity;
      const tick = now => {
        if (token !== generation) return;
        const elapsed = Math.min(1, (now-start)/duration);
        if (elapsed < 1 && now - lastPaint < 1000 / 30) { frame = requestAnimationFrame(tick); return; }
        lastPaint = now;
        // Ease out immediately: visible color movement in the first frames, then a soft landing.
        const blend = 1 - Math.pow(1 - elapsed, 3);
        for (const item of tweens) {
          const value = item.tween(blend);
          if (value !== item.previous) { root.style.setProperty(item.property, value); item.previous = value; }
        }
        if (elapsed < 1) frame = requestAnimationFrame(tick);
        else complete(token);
      };
      frame = requestAnimationFrame(tick);
    },
    finish,
    get active() { return active; },
    get pending() { return Boolean(pending); },
  };
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  window.addEventListener('pagehide', finish);
  // Reveal live controls immediately when the user interacts during a fade.
  const revealLivePage = () => { if (nativeTransition) finish(); };
  document.addEventListener('pointerdown', revealLivePage, {capture: true, passive: true});
  document.addEventListener('keydown', revealLivePage, {capture: true});
  document.addEventListener('wheel', revealLivePage, {capture: true, passive: true});
  window.addEventListener('inteon-effects-change', () => {
    if (document.body.classList.contains('portal-leaving')) finish();
    else if (pending && !window.inteonHomeEffects?.active) flushPending();
  });
})();
