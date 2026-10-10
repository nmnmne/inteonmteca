/* Spatial successor to the original matrix-text symbol cycle (eeb6abc).
   Decoration never replaces the underlying text, names, or live player values. */
(() => {
  const selector = [
    '.matrix-text', '.listening-intro h1', '.catalog-heading h2', '.track-title', '.track-artist',
    '.track-art', '.now-playing-title', '.active-track-artist', '.player-caption', '.volume-control label',
    '.transport-time', '.playback-status', '.auth-hint', '.street-link', '.theme-hint', '.chat-hint',
    '.auth-kicker', '.auth-label', '.auth-submit', '.auth-close', '.auth-logout', '.chat-close',
    '.theme-kicker', '.theme-label', '.theme-action', '.theme-duration-output', '.theme-status',
  ].join(',');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const symbols = '01/\\|<>[]{}#$%&*+-=░▒:;';
  const pointer = {x: 0, y: 0, active: false, until: Infinity};
  const modes = [
    {name: 'rhythm', duration: 16000, gap: 1450, strength: .72, speed: .28, width: 115},
    {name: 'quiet', duration: 7500, gap: 3300, strength: .06, speed: .16, width: 80},
    {name: 'surge', duration: 9500, gap: 650, strength: .97, speed: .42, width: 165},
    {name: 'drift', duration: 10500, gap: 2250, strength: .4, speed: .21, width: 120},
  ];
  let chars = [], visibleChars = [], waves = [], frameId = 0, serial = 0, needsScan = true, dirty = true;
  let selected = false, focusTarget = null;
  let modeIndex = 0, modeUntil = 0, nextWave = 0, measuredAt = -Infinity, lastGlyphFrame = -1;
  const hash = n => { let value = Math.imul(n | 0, 374761393); value = Math.imul(value ^ (value >>> 13), 1274126177); return ((value ^ (value >>> 16)) >>> 0) / 4294967296; };
  const paint = (char, glyph = '') => {
    if (char.glyph === glyph) return;
    char.glyph = glyph;
    char.el.classList.toggle('is-wave-noisy', Boolean(glyph));
    char.mask.dataset.glyph = glyph;
  };
  const restore = () => chars.forEach(char => paint(char));
  const observerOptions = {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden']};
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (element?.closest('.text-wave-char')) continue;
      if (record.type === 'attributes' || element?.closest(selector) || [...record.addedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)))) {
        needsScan = true; break;
      }
    }
  });
  const scan = () => {
    observer.disconnect();
    chars = chars.filter(char => char.el.isConnected);
    const owners = [...document.querySelectorAll(selector)].filter(owner => owner.getClientRects().length && !owner.closest('[hidden]'));
    owners.forEach(owner => {
      const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent.trim() || node.parentElement.closest('.text-wave-char, .visually-hidden, input, textarea, select, [contenteditable], svg')) return NodeFilter.FILTER_REJECT;
          const hidden = node.parentElement.closest('[aria-hidden="true"]');
          if (hidden && !hidden.classList.contains('heading-letter')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const fragment = document.createDocumentFragment();
        for (const letter of node.textContent) {
          if (/\s/.test(letter)) { fragment.append(document.createTextNode(letter)); continue; }
          const el = document.createElement('span'); el.className = 'text-wave-char'; el.textContent = letter;
          const mask = document.createElement('span'); mask.className = 'text-wave-mask'; mask.setAttribute('aria-hidden', 'true');
          el.append(mask); fragment.append(el);
          chars.push({el, mask, owner, seed: ++serial, glyph: '', x: 0, y: 0, visible: false});
        }
        // Keep a text run as one flex item (navigation buttons and small labels).
        const run = document.createElement('span'); run.className = 'text-wave-run'; run.append(fragment);
        node.replaceWith(run);
      });
    });
    observer.observe(document.body, observerOptions);
    needsScan = false; dirty = true; focusTarget = null;
  };
  const measure = now => {
    const bounds = new Map();
    const list = document.querySelector('.track-list')?.getBoundingClientRect();
    visibleChars = [];
    // Finish every layout read before restoring ink; writes here used to force a
    // second layout for the next character, including clipped playlist rows.
    chars.forEach(char => {
      if (!bounds.has(char.owner)) bounds.set(char.owner, {
        rect: char.owner.getBoundingClientRect(), clip: char.owner.closest('.track-list') && list,
      });
      const {rect: owner, clip} = bounds.get(char.owner);
      char.visible = false;
      if (!owner.width || !owner.height || owner.bottom < 0 || owner.top > innerHeight ||
          (clip && (owner.bottom < clip.top || owner.top > clip.bottom))) return;
      const rect = char.el.getBoundingClientRect();
      char.x = rect.left + rect.width / 2; char.y = rect.top + rect.height / 2;
      char.visible = rect.width > 0 && char.x >= 0 && char.x <= innerWidth && char.y >= 0 && char.y <= innerHeight &&
        char.x <= owner.right && char.y <= owner.bottom && (!clip || (char.y >= clip.top && char.y <= clip.bottom));
      if (char.visible) visibleChars.push(char);
    });
    chars.forEach(char => { if (!char.visible) paint(char); });
    dirty = false; measuredAt = now;
  };
  const blocked = () => document.hidden || reduced.matches || window.inteonHomeEffects?.ambientBlocked || document.body.classList.contains('is-interlude');
  const tick = now => {
    window.inteonHomeEffects?.beat('text');
    frameId = 0;
    if (blocked()) { restore(); return; }
    frameId = requestAnimationFrame(tick);
    if (needsScan) scan();
    if (dirty || now - measuredAt > 1200) measure(now);
    // Glyphs are discrete: keep RAF in sync with the display but only evaluate
    // a new symbol state when its normal-speed or brief-burst time bucket changes.
    const burst = now % 19000 > 18250;
    const frame = Math.floor(now / (burst ? (coarse.matches ? 28 : 20) : (coarse.matches ? 105 : 60)));
    if (frame === lastGlyphFrame) return;
    lastGlyphFrame = frame;
    if (!modeUntil) { modeUntil = now + modes[0].duration; nextWave = now + 650; }
    if (now >= modeUntil) {
      modeIndex = (modeIndex + 1) % modes.length;
      modeUntil = now + modes[modeIndex].duration * (.85 + Math.random() * .3);
      // Let silence arrive without the tail of a previous storm.
      if (modes[modeIndex].name === 'quiet') waves = [];
    }
    const mode = modes[modeIndex];
    if (document.documentElement.dataset.textWaveMode !== mode.name) document.documentElement.dataset.textWaveMode = mode.name;
    if (now >= nextWave) {
      waves.push({at: now, x: innerWidth * (.12 + Math.random() * .76), y: innerHeight * (.1 + Math.random() * .65), ...mode});
      nextWave = now + mode.gap * (mode.name === 'rhythm' ? 1 : .75 + Math.random() * .5);
    }
    waves = waves.filter(wave => (now - wave.at) * wave.speed < Math.hypot(innerWidth, innerHeight) + wave.width * 2);
    const focus = document.activeElement;
    if (focus !== focusTarget) {
      focusTarget = focus;
      chars.forEach(char => { char.focused = char.owner.contains(focus) || (focus?.matches(':focus-visible') && focus.contains(char.el)); });
    }
    const calmRadius = coarse.matches ? 150 : 175;
    visibleChars.forEach(char => {
      if (selected || char.focused) { paint(char); return; }
      let intensity = 0;
      for (const wave of waves) {
        const distance = Math.hypot(char.x - wave.x, char.y - wave.y);
        const band = (distance - (now - wave.at) * wave.speed) / wave.width;
        intensity = Math.max(intensity, Math.exp(-band * band * 2) * wave.strength);
      }
      if (pointer.active && now < pointer.until) {
        const distance = Math.hypot(char.x - pointer.x, char.y - pointer.y);
        const edge = Math.max(0, Math.min(1, (distance - calmRadius * .65) / (calmRadius * .65)));
        intensity *= edge * edge * (3 - 2 * edge);
        // Rare single-character twitches, while the readable core stays calm.
        if (distance < calmRadius * .65 && Math.floor(now / 110) % 47 === 0) intensity = .012;
      }
      const noisy = hash(char.seed * 37 + frame * 213) < intensity;
      paint(char, noisy ? symbols[Math.floor(hash(char.seed + frame * 73) * symbols.length)] : '');
    });
  };
  const calm = event => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
    pointer.until = event.pointerType === 'touch' ? performance.now() + 5000 : Infinity;
    // Coalesce high-rate mouse events into the next display frame.
  };
  window.addEventListener('pointermove', calm, {passive: true});
  window.addEventListener('pointerdown', calm, {passive: true});
  document.documentElement.addEventListener('pointerleave', event => {
    // Touch sends pointerleave as soon as the finger lifts; keep its calm area
    // for the promised five seconds, while mouse leave restores normal waves.
    if (event.pointerType !== 'touch') pointer.active = false;
  });
  document.addEventListener('scroll', () => { dirty = true; }, {capture: true, passive: true});
  window.addEventListener('resize', () => { dirty = true; });
  const resume = () => { cancelAnimationFrame(frameId); frameId = 0; waves = []; modeUntil = 0; lastGlyphFrame = -1; dirty = true; focusTarget = null; restore(); if (!blocked()) frameId = requestAnimationFrame(tick); };
  window.inteonHomeEffects?.watch('text', {blocked, restart: resume});
  document.addEventListener('visibilitychange', resume);
  reduced.addEventListener('change', resume);
  document.addEventListener('selectionchange', () => { selected = !getSelection()?.isCollapsed; if (selected) restore(); });
  window.addEventListener('inteon-effects-change', resume);
  window.addEventListener('inteon-interlude', resume);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); frameId = 0; restore(); });
  window.addEventListener('pageshow', resume);
  document.fonts?.ready.then(() => { dirty = true; });
  resume();
})();
