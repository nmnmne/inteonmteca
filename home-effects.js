/* One complex scene at a time. Ambient renderers sleep while it owns the room. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 800px), (pointer: coarse)');
  let active = null, suspended = false, away = false;
  const publish = () => {
    if (active) root.dataset.homeEffect = active;
    else delete root.dataset.homeEffect;
    root.dataset.homeEffectsSuspended = String(suspended);
    window.dispatchEvent(new Event('inteon-effects-change'));
  };
  const sync = () => {
    const panelOpen = compact.matches && (document.body.dataset.mobileSection === 'chat' ||
      [...document.querySelectorAll('#chat-panel:not(.chat-inline), #theme-panel, #auth-panel')].some(panel => !panel.hidden));
    const next = away || document.hidden || reduced.matches || document.body.classList.contains('portal-leaving') || panelOpen;
    if (next === suspended) return;
    suspended = next;
    publish();
  };
  window.inteonHomeEffects = Object.freeze({
    claim(name) {
      if (!name || active || suspended) return false;
      active = name;
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
    get ambientBlocked() { return suspended || Boolean(active); },
  });
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {attributes: true, attributeFilter: ['class', 'data-mobile-section']});
  document.querySelectorAll('#chat-panel, #theme-panel, #auth-panel').forEach(panel => observer.observe(panel, {attributes: true, attributeFilter: ['hidden', 'class']}));
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  compact.addEventListener('change', sync);
  window.addEventListener('pagehide', () => { away = true; sync(); });
  window.addEventListener('pageshow', () => { away = false; sync(); });
  sync();
})();
