/* Pointer life: a soft aura that follows the mouse (desktop only) and tap rings
   on controls and when a track starts. Event-driven by design: no timer or
   animation frame is scheduled while the visitor is idle. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const MAX_RINGS = 4;
  const rings = new Set();
  let aura = null, frame = 0, idleTimer = 0;
  let targetX = 0, targetY = 0, x = 0, y = 0;

  const motionAllowed = () => !reduced.matches && !document.hidden;
  const lowTier = () => {
    const level = Number(root.dataset.graphicsLevel);
    return root.dataset.animationQuality === 'low' || (level > 0 && level <= 3);
  };

  const place = () => { aura.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`; };
  const step = () => {
    frame = 0;
    if (!aura) return;
    x += (targetX - x) * .16; y += (targetY - y) * .16;
    place();
    if (Math.abs(targetX - x) > .4 || Math.abs(targetY - y) > .4) frame = requestAnimationFrame(step);
  };
  const fadeAura = () => { clearTimeout(idleTimer); idleTimer = 0; aura?.classList.remove('is-on'); };

  const onMove = event => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (!motionAllowed() || !finePointer.matches || lowTier()) return;
    targetX = event.clientX; targetY = event.clientY;
    if (!aura) {
      aura = document.createElement('div');
      aura.className = 'pointer-aura';
      aura.setAttribute('aria-hidden', 'true');
      document.body.appendChild(aura);
      x = targetX; y = targetY; place();
    }
    aura.classList.add('is-on');
    if (!frame) frame = requestAnimationFrame(step);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(fadeAura, 3500);
  };

  const ring = (cx, cy, big = false) => {
    if (!motionAllowed() || rings.size >= MAX_RINGS) return;
    const el = document.createElement('span');
    el.className = big ? 'pointer-ring is-big' : 'pointer-ring';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--ring-x', `${Math.round(cx)}px`);
    el.style.setProperty('--ring-y', `${Math.round(cy)}px`);
    if (big) el.style.setProperty('--ring-scale', '16');
    const done = () => { rings.delete(el); el.remove(); };
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1600);
    rings.add(el);
    document.body.appendChild(el);
  };

  const tappable = '.track-select, .transport button, #studio button, [data-sound-open], #auth-hint, #theme-hint, .street-link, .chat-send, .mobile-chat-toggle';
  document.addEventListener('pointerdown', event => {
    if (event.button > 0 || !event.target.closest?.(tappable)) return;
    ring(event.clientX, event.clientY, false);
  }, { passive: true, capture: true });

  function playRing(button) {
    const rect = button?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    ring(cx, cy, true);
    setTimeout(() => ring(cx, cy, false), 180);
  }
  if (window.DJEngine?.visuals) {
    window.DJEngine.visuals.addEventListener('play', event =>
      playRing(document.querySelector('#deck-' + event.detail.deck.toLowerCase() + ' .dd-play')));
  } else {
    document.getElementById('album-player')?.addEventListener('play', () =>
      playRing(document.getElementById('immersive-play')));
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('mouseleave', fadeAura);
  document.addEventListener('visibilitychange', () => { if (document.hidden) fadeAura(); });
  reduced.addEventListener?.('change', () => { if (reduced.matches) fadeAura(); });
  window.inteonPointerLife = Object.freeze({ ring, get aura() { return aura; } });
})();
