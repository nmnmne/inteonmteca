/* Animate live palette tokens while the theme controls retain their old colors. */
(() => {
  const root = document.documentElement;
  const panel = document.querySelector('#theme-panel');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 4000;
  let target = null, metadata = null, active = false, frame = 0, generation = 0, deadline = 0;
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
    if (target) for (const [property, value] of Object.entries(target)) root.style.setProperty(property, value);
    if (metadata?.name) { root.dataset.theme = metadata.name; root.dataset.themeMood = metadata.mood; }
    window.dispatchEvent(new Event('inteon-theme-frame'));
  };
  const complete = token => {
    if (token !== generation) return;
    clearTimeout(deadline); deadline = 0;
    cancelAnimationFrame(frame); frame = 0; active = false;
    commit(); unpinPanel();
    root.classList.remove('is-theme-crossfading', 'is-theme-shifting');
    window.inteonHomeEffects?.release('theme');
  };
  const finish = () => complete(generation);
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
      const token = ++generation;
      clearTimeout(deadline); deadline = 0;
      cancelAnimationFrame(frame); frame = 0;
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
      const controller = window.inteonHomeEffects;
      const immediate = !animate || reduced.matches || document.hidden ||
        (controller && controller.active !== 'theme' && !controller.claim('theme'));
      if (immediate) { complete(token); return; }
      pinPanel();
      const styles = getComputedStyle(root);
      const tweens = Object.entries(target).map(([property,value]) => [property, interpolate(styles.getPropertyValue(property).trim(), value)]);
      active = true;
      if (metadata?.name) { root.dataset.theme = metadata.name; root.dataset.themeMood = metadata.mood; }
      // Browser frame throttling must never retain the foreground effect lock.
      deadline = setTimeout(() => complete(token), duration + 250);
      const start = performance.now();
      const tick = now => {
        if (token !== generation) return;
        const elapsed = Math.min(1, (now-start)/duration);
        // Ease out immediately: visible color movement in the first frames, then a soft landing.
        const blend = 1 - Math.pow(1 - elapsed, 3);
        for (const [property, tween] of tweens) root.style.setProperty(property, tween(blend));
        if (elapsed < 1) frame = requestAnimationFrame(tick);
        else complete(token);
      };
      frame = requestAnimationFrame(tick);
    },
    finish,
    get active() { return active; },
  };
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) finish(); });
  window.addEventListener('pagehide', finish);
  window.addEventListener('inteon-effects-change', () => {
    if (active && document.body.classList.contains('portal-leaving')) finish();
  });
})();
