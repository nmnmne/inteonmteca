/* Scene ownership is exclusive; ambient motion remains independent and recoverable. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, suspended = false, away = false, claimedAt = 0;
  const renderers = new Map();
  const recover = () => {
    // Mobile browsers can restore a visible document without a second pageshow.
    if (!document.hidden && !document.body.classList.contains('portal-leaving')) away = false;
    sync();
    if (suspended) return;
    const now = performance.now();
    const limits = {theme: 6000, acid: 16000, storm: 90000, interlude: 65000, cloud: 85000, 'mobile-scatter': 6000};
    if (active && now - claimedAt > (limits[active] || 90000)) {
      const stale = active;
      if (stale === 'acid') window.inteonLogoAcid?.stop();
      else if (stale === 'storm') window.inteonLogoStorm?.stop();
      else if (stale === 'interlude' || stale === 'cloud') window.inteonAtmosphere?.stop();
      else if (stale === 'theme') window.inteonThemeMorph?.finish();
      else if (stale === 'mobile-scatter') window.inteonMobileLogo?.stop();
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
    const next = away || document.hidden || document.body.classList.contains('portal-leaving');
    if (next === suspended) return;
    suspended = next;
    publish();
  };
  window.inteonHomeEffects = Object.freeze({
    claim(name) {
      const paletteAllowed = name === 'theme' && !away && !document.hidden && !reduced.matches && !document.body.classList.contains('portal-leaving');
      if (!name || active || (suspended && !paletteAllowed)) return false;
      active = name; claimedAt = performance.now();
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
    watch(name, {blocked, restart}) { renderers.set(name, {blocked, restart, last: performance.now()}); },
    beat(name) { const renderer = renderers.get(name); if (renderer) renderer.last = performance.now(); },
  });
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {attributes: true, attributeFilter: ['class', 'data-mobile-section']});
  document.querySelectorAll('#chat-panel, #theme-panel, #auth-panel').forEach(panel => observer.observe(panel, {attributes: true, attributeFilter: ['hidden', 'class']}));
  document.addEventListener('visibilitychange', recover);
  reduced.addEventListener('change', sync);
  window.addEventListener('focus', recover);
  document.addEventListener('resume', recover);
  setInterval(recover, 1000);
  window.addEventListener('pagehide', () => { away = true; sync(); });
  window.addEventListener('pageshow', () => { away = false; sync(); });
  sync();
})();
