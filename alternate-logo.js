/* Occasionally overlays one of the selected original hand-drawn marks. */
(() => {
  const wrap = document.querySelector('#logo-wrap');
  if (!wrap || window.inteonAlternateLogo) return;

  const effects = window.inteonHomeEffects;
  if (!effects) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const variants = Object.freeze([1, 3, 5, 12, 13, 16, 17]);
  const compact = matchMedia('(max-width: 800px), (pointer: coarse)');
  const visibleMs = 4600;
  const randomDelay = () => 18000 + Math.floor(Math.random() * 12000);
  const motionTimeout = (callback, delay) => effects.setMotionTimeout
    ? effects.setMotionTimeout(callback, delay) : setTimeout(callback, delay);
  const clearMotionTimeout = id => {
    if (!id) return;
    if (effects.clearMotionTimeout) effects.clearMotionTimeout(id);
    else clearTimeout(id);
  };

  let activeVariant = null, nextTimer = 0, endTimer = 0, nextIndex = 0, stopped = false;
  const canShow = () => !stopped && !document.hidden && !reduced.matches
    && !effects.suspended && !effects.ambientPaused && !effects.active
    && !document.body.classList.contains('is-interlude')
    && !document.body.classList.contains('storm-priming')
    && !['is-acid', 'is-assembling', 'is-screen-scattered', 'is-rebuilding']
      .some(name => wrap.classList.contains(name));
  const publish = phase => window.dispatchEvent(new CustomEvent('inteon-alternate-logo-change', {
    detail: {phase, variant: activeVariant},
  }));
  const clearNext = () => { clearMotionTimeout(nextTimer); nextTimer = 0; };
  const schedule = delay => {
    clearNext();
    if (stopped || activeVariant !== null || reduced.matches) return;
    nextTimer = motionTimeout(attempt, delay);
  };
  const finish = (reschedule = true) => {
    clearMotionTimeout(endTimer); endTimer = 0;
    if (activeVariant === null) return;
    activeVariant = null;
    delete wrap.dataset.alternateLogo;
    if (!compact.matches) effects.release('alternate-logo');
    publish('old');
    if (reschedule) schedule(randomDelay());
  };
  const show = variant => {
    const selected = Number(variant);
    if (!variants.includes(selected) || activeVariant !== null || !canShow()) return false;
    clearNext();
    // Compact variants are a passive skin: foreground scenes always take priority.
    if (!compact.matches && !effects.claim('alternate-logo')) return false;
    activeVariant = selected;
    nextIndex = (variants.indexOf(selected) + 1) % variants.length;
    wrap.dataset.alternateLogo = String(selected);
    publish('alternate');
    endTimer = motionTimeout(() => finish(true), visibleMs);
    return true;
  };
  function attempt() {
    nextTimer = 0;
    if (activeVariant !== null || stopped) return;
    const variant = variants[nextIndex];
    if (!show(variant)) schedule(3200);
  }
  const start = (delay = randomDelay()) => {
    stopped = false;
    if (activeVariant === null) schedule(Math.max(0, Number(delay) || 0));
  };
  const stop = () => {
    stopped = true;
    clearNext();
    finish(false);
  };

  window.inteonAlternateLogo = Object.freeze({
    variants,
    start,
    stop,
    show,
    hide: () => finish(true),
    get activeVariant() { return activeVariant; },
  });
  window.addEventListener('inteon-effects-change', () => { if (compact.matches && effects.active && activeVariant !== null) finish(true); });
  compact.addEventListener('change', () => { effects.release('alternate-logo'); finish(true); });
  reduced.addEventListener('change', () => reduced.matches ? stop() : start());
  document.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => start());
  start();
})();
