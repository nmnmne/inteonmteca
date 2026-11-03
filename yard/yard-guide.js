/* First-visit guidance follows scene readiness and never captures movement. */
(() => {
  const guide = document.getElementById('yard-guide');
  const dismiss = document.getElementById('yard-guide-dismiss');
  const canvas = document.getElementById('yard-view');
  if (!guide || !dismiss || !canvas || location.protocol === 'file:' ||
      new URLSearchParams(location.search).has('portal-preview')) return;
  const key = 'inteon-yard-guide-seen-v1';
  let acknowledged = false;
  let ready = false;
  try { acknowledged = localStorage.getItem(key) === '1'; } catch {}
  const hide = () => {
    guide.hidden = true;
  };
  const acknowledge = () => {
    acknowledged = true;
    try { localStorage.setItem(key, '1'); } catch {}
    hide();
  };
  const show = () => {
    if (!ready || acknowledged || document.prerendering ||
        document.body.classList.contains('yard-unavailable')) return;
    guide.hidden = false;
  };
  dismiss.addEventListener('click', acknowledge);
  document.addEventListener('pointerlockchange', () => {
    if (!guide.hidden && document.pointerLockElement === canvas) acknowledge();
  });
  window.addEventListener('inteon-yard-entered', () => { ready = true; show(); }, { once: true });
  document.addEventListener('prerenderingchange', show, { once: true });
})();
