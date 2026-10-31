/* One active floating surface; inline chat deliberately remains a page region. */
(() => {
  let active = null;
  const controls = panel => [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
    .filter(el => el.checkVisibility({checkVisibilityCSS: true}) && !el.closest('[inert]'));
  const heading = document.querySelector('.listening-intro h1');
  const positionHeading = panel => {
    if (!heading) return;
    heading.style.translate = '';
    if (!['auth-panel', 'theme-panel'].includes(panel.id)) return;
    const rect = heading.getBoundingClientRect();
    const logo = document.querySelector('#logo-wrap')?.getBoundingClientRect();
    if (!logo) return;
    let limit = logo.top - 6;
    const list = document.querySelector('.playlist-shell')?.getBoundingClientRect();
    if (list && rect.left < list.right && rect.right > list.left) limit = Math.min(limit, list.top - 12);
    heading.style.translate = `0 ${Math.max(0, limit - rect.bottom)}px`;
  };
  const place = () => {
    if (!active) return;
    const {panel, trigger} = active;
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const sharedDock = ['auth-panel', 'theme-panel'].includes(panel.id)
      ? document.getElementById('auth-hint') : trigger;
    const anchor = (sharedDock || trigger).getBoundingClientRect();
    const top = Math.min(y + Math.max(10, height - 160), Math.max(y + 10, anchor.bottom + 4));
    panel.style.setProperty('--popup-top', `${top}px`);
    panel.style.setProperty('--popup-left', `${Math.max(x + 10, Math.min(anchor.left, x + width - Math.min(360, width - 20) - 10))}px`);
    panel.style.setProperty('--popup-width', `${Math.min(360, width - 20)}px`);
    panel.style.setProperty('--popup-height', `${Math.max(80, y + height - top - 10)}px`);
    positionHeading(panel);
  };
  const release = panel => { if (active?.panel === panel) active = null; if (!active && heading) heading.style.translate = ''; };
  const dismiss = (focus = true) => {
    if (!active) return;
    const previous = active; active = null;
    previous.close();
    if (focus && previous.trigger.isConnected) previous.trigger.focus({preventScroll: true});
  };
  window.inteonPopups = {
    open(panel, trigger, close) {
      if (!panel || !trigger) return;
      if (active?.panel !== panel) dismiss(false);
      active = {panel, trigger, close}; panel.classList.add('coordinated-popup');
      place(); controls(panel)[0]?.focus({preventScroll: true});
    }, release, dismiss,
  };
  // Bubble phase lets a nested palette handle its own Escape first.
  window.addEventListener('keydown', event => {
    if (!active || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    const items = controls(active.panel), first = items[0], last = items.at(-1);
    if (!items.length) { event.preventDefault(); return; }
    if (!active.panel.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (active && !active.panel.contains(event.target) && !active.trigger.contains(event.target)) dismiss(false);
  });
  window.addEventListener('resize', place, {passive: true});
  window.visualViewport?.addEventListener('resize', place, {passive: true});
  window.addEventListener('pageshow', () => dismiss(false));
})();
