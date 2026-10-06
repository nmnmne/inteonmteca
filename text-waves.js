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
  let chars = [], waves = [], timer = 0, serial = 0, needsScan = true, dirty = true;
  let modeIndex = 0, modeUntil = 0, nextWave = 0, measuredAt = -Infinity;
  const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
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
    document.querySelectorAll(selector).forEach(owner => {
      if (!owner.getClientRects().length || owner.closest('[hidden]')) return;
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
    needsScan = false; dirty = true;
  };
  const measure = now => {
    const bounds = new Map();
    const list = document.querySelector('.track-list')?.getBoundingClientRect();
    chars.forEach(char => {
      if (!bounds.has(char.owner)) bounds.set(char.owner, char.owner.getBoundingClientRect());
      const owner = bounds.get(char.owner);
      const clip = char.owner.closest('.track-list') && list;
      if (!owner.width || !owner.height || owner.bottom < 0 || owner.top > innerHeight ||
          (clip && (owner.bottom < clip.top || owner.top > clip.bottom))) {
        char.visible = false; paint(char); return;
      }
      const rect = char.el.getBoundingClientRect();
      char.x = rect.left + rect.width / 2; char.y = rect.top + rect.height / 2;
      char.visible = rect.width > 0 && char.x >= 0 && char.x <= innerWidth && char.y >= 0 && char.y <= innerHeight &&
        char.x <= owner.right && char.y <= owner.bottom && (!clip || (char.y >= clip.top && char.y <= clip.bottom));
      if (!char.visible) paint(char);
    });
    dirty = false; measuredAt = now;
  };
  const tick = () => {
    if (document.hidden || reduced.matches) { restore(); return; }
    if (document.body.classList.contains('is-interlude')) { restore(); timer = setTimeout(tick, 300); return; }
    const now = performance.now();
    if (needsScan) scan();
    if (dirty || now - measuredAt > 1200) measure(now);
    if (!modeUntil) { modeUntil = now + modes[0].duration; nextWave = now + 650; }
    if (now >= modeUntil) {
      modeIndex = (modeIndex + 1) % modes.length;
      modeUntil = now + modes[modeIndex].duration * (.85 + Math.random() * .3);
      // Let silence arrive without the tail of a previous storm.
      if (modes[modeIndex].name === 'quiet') waves = [];
    }
    const mode = modes[modeIndex];
    document.documentElement.dataset.textWaveMode = mode.name;
    if (now >= nextWave) {
      waves.push({at: now, x: innerWidth * (.12 + Math.random() * .76), y: innerHeight * (.1 + Math.random() * .65), ...mode});
      nextWave = now + mode.gap * (mode.name === 'rhythm' ? 1 : .75 + Math.random() * .5);
    }
    waves = waves.filter(wave => (now - wave.at) * wave.speed < Math.hypot(innerWidth, innerHeight) + wave.width * 2);
    const selected = !getSelection()?.isCollapsed;
    const frame = Math.floor(now / (mode.name === 'surge' ? 60 : 105));
    const calmRadius = coarse.matches ? 150 : 175;
    chars.forEach(char => {
      if (!char.visible || selected || char.owner.contains(document.activeElement) || char.el.closest(':focus-visible')) { paint(char); return; }
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
      const noisy = hash(char.seed * 3.71 + frame * 2.13) < intensity;
      paint(char, noisy ? symbols[Math.floor(hash(char.seed + frame * 7.3) * symbols.length)] : '');
    });
    timer = setTimeout(tick, coarse.matches ? 70 : 45);
  };
  const calm = event => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
    pointer.until = event.pointerType === 'touch' ? performance.now() + 5000 : Infinity;
    chars.forEach(char => { if (Math.hypot(char.x - pointer.x, char.y - pointer.y) < 175) paint(char); });
  };
  window.addEventListener('pointermove', calm, {passive: true});
  window.addEventListener('pointerdown', calm, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
  document.addEventListener('scroll', () => { dirty = true; }, {capture: true, passive: true});
  window.addEventListener('resize', () => { dirty = true; });
  const resume = () => { clearTimeout(timer); waves = []; modeUntil = 0; dirty = true; restore(); tick(); };
  document.addEventListener('visibilitychange', resume);
  reduced.addEventListener('change', resume);
  document.addEventListener('selectionchange', () => { if (!getSelection()?.isCollapsed) restore(); });
  document.fonts?.ready.then(() => { dirty = true; });
  tick();
})();
