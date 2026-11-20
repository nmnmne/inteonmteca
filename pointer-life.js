/* A small pool of moving pigment for desktop pointers and contact rings for controls. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const MAX_RINGS = 4;
  const rings = new Set();
  let fluid, head, wake, code;
  let active = false, frame = 0, clock = 0, idleTimer = 0, lastFrame = 0;
  let anchorX = 0, anchorY = 0, offsetX = 0, offsetY = 0;
  let x = 0, y = 0, vx = 0, vy = 0, tailX = 0, tailY = 0;
  let axis = 1, turn = 1, halfSeconds = 0;

  const motionAllowed = () => !reduced.matches && !document.hidden;
  const lowTier = () => {
    const level = Number(root.dataset.graphicsLevel);
    return level ? level <= 3 : root.dataset.animationQuality === 'low';
  };

  const enabled = () => motionAllowed() && finePointer.matches;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const moveTo = (px, py) => `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
  const stretch = (ux, uy, amount) => {
    // Stretch only along the direction of travel, with a softer squeeze across it.
    const squeeze = 1 / (1 + amount * .3), gain = 1 + amount - squeeze;
    const xy = gain * ux * uy;
    return `matrix(${squeeze + gain * ux * ux}, ${xy}, ${xy}, ${squeeze + gain * uy * uy}, 0, 0)`;
  };
  const inViewX = value => clamp(value, 32, innerWidth - 32);
  const inViewY = value => clamp(value, 12, innerHeight - 12);

  const refreshCode = () => {
    const magnitude = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    code.textContent = '+' + magnitude;
  };
  const stop = (immediate = true) => {
    active = false;
    cancelAnimationFrame(frame);
    clearInterval(clock);
    clearTimeout(idleTimer);
    frame = clock = idleTimer = lastFrame = 0;
    if (!fluid) return;
    fluid.classList.remove('is-on');
    if (immediate) fluid.hidden = true;
  };
  const tick = () => {
    if (!enabled()) return stop();
    // Independent of the input rate. Occasional reversals avoid repeating one loop.
    if (Math.random() < .18) turn *= -1;
    axis = (axis + turn + 8) % 8;
    if (++halfSeconds % 2 === 0) refreshCode();
  };
  const start = (px, py) => {
    if (!fluid) {
      fluid = document.createElement('div');
      fluid.className = 'pointer-fluid';
      fluid.setAttribute('aria-hidden', 'true');
      for (const part of ['wake', 'head', 'code']) {
        const element = document.createElement('span');
        element.className = 'pointer-fluid-' + part;
        fluid.append(element);
      }
      [wake, head, code] = fluid.children;
      document.body.append(fluid);
    }
    active = true;
    anchorX = px;
    anchorY = py;
    x = tailX = inViewX(px + 21);
    y = tailY = inViewY(py + 17);
    vx = vy = offsetX = offsetY = 0;
    axis = 1;
    turn = Math.random() < .5 ? -1 : 1;
    halfSeconds = 0;
    head.style.transform = wake.style.transform = '';
    fluid.style.transform = moveTo(x, y);
    refreshCode();
    fluid.hidden = false;
    fluid.classList.toggle('is-light', lowTier());
    fluid.classList.add('is-on');
    clock = setInterval(tick, 500);
  };
  const step = now => {
    frame = 0;
    if (!enabled()) return stop();
    const dt = Math.min((now - (lastFrame || now - 16.67)) / 1000, .034);
    lastFrame = now;
    const drift = Math.exp(-dt * 3.3);
    offsetX *= drift;
    offsetY *= drift;
    const dx = inViewX(anchorX + 21 + offsetX) - x;
    const dy = inViewY(anchorY + 17 + offsetY) - y;
    const damping = Math.exp(-dt * 15);
    vx = (vx + dx * 116 * dt) * damping;
    vy = (vy + dy * 116 * dt) * damping;
    x = inViewX(x + vx * dt);
    y = inViewY(y + vy * dt);
    const catchUp = 1 - Math.exp(-dt * 5.8);
    tailX += (x - tailX) * catchUp;
    tailY += (y - tailY) * catchUp;

    const trail = Math.hypot(x - tailX, y - tailY);
    fluid.style.transform = moveTo(x, y);
    if (!fluid.classList.contains('is-light')) {
      const length = Math.min(94, trail);
      const ux = (x - tailX) / (trail || 1), uy = (y - tailY) / (trail || 1);
      head.style.transform = stretch(ux, uy, length / 230);
      wake.style.transform = moveTo(-ux * length / 2, -uy * length / 2) + ' ' + stretch(ux, uy, length / 73);
    }

    if (Math.hypot(dx, dy, offsetX, offsetY, trail) > .35 || Math.hypot(vx, vy) > 2) {
      frame = requestAnimationFrame(step);
    } else {
      lastFrame = 0;
    }
  };

  const onMove = event => {
    if (event.pointerType === 'touch') return stop();
    if (!enabled() || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
    const px = event.clientX, py = event.clientY;
    const dx = px - anchorX, dy = py - anchorY;
    if (fluid && !fluid.hidden && dx * dx + dy * dy < 36) return;
    if (!active) {
      start(px, py);
    } else {
      anchorX = px;
      anchorY = py;
      // Turn the impulse, then relax the displacement towards the pointer.
      // The bound keeps the ink on screen after a jump across the viewport.
      const angle = axis * Math.PI / 4;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      offsetX += (dx * cos - dy * sin - dx) * .9;
      offsetY += (dx * sin + dy * cos - dy) * .9;
      const scale = Math.min(1, 105 / (Math.hypot(offsetX, offsetY) || 1));
      offsetX *= scale;
      offsetY *= scale;
      if (!frame) frame = requestAnimationFrame(step);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stop(false), 3500);
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
  root.addEventListener('pointerleave', () => stop());
  window.addEventListener('blur', () => stop());
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('pointercancel', () => stop());
  window.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') stop(); }, {passive: true});
  const checkMode = () => { if (!enabled()) stop(); };
  document.addEventListener('visibilitychange', checkMode);
  window.addEventListener('inteon-quality-change', () => {
    fluid?.classList.toggle('is-light', lowTier());
    if (active && !frame) frame = requestAnimationFrame(step);
  });
  finePointer.addEventListener('change', checkMode);
  reduced.addEventListener('change', checkMode);
  window.inteonPointerLife = Object.freeze({ ring, get aura() { return fluid ?? null; } });
})();
