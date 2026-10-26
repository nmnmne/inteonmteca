/* The desktop catalogue flows into a leftward analogue river. Real rows stay
   accessible and native; only cached glyph textures and grain cross its edges. */
(() => {
  const list = document.getElementById('track-list');
  const shell = document.getElementById('playlist-shell');
  if (!list || !shell) return;
  const desktop = matchMedia('(min-width: 801px) and (min-height: 541px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const sides = [];
  const textureRows = 6;
  let frame = 0, geometryDirty = true, paletteDirty = true, revision = 0, dirty = true, departed = false;
  let lastPaint = -Infinity;
  let width = 0, height = 0, rowHeight = 0, firstOffset = 0, depth = 0, ratio = 1, gutter = 0;
  let ellipseX = 0, ellipseY = 1, edgeAngle = 0, edgeCos = 1;
  let scrollOffset = list.scrollTop, orbitScroll = NaN;
  const orbitRows = new Set();
  let items = [], accent = '218, 243, 149', ink = '235, 239, 220';
  let titleFont = '600 18px Consolas, monospace', artistFont = '12px Consolas, monospace';
  let titleSize = 18, artistSize = 12;
  const enabled = () => desktop.matches && !document.hidden && !departed && !window.inteonHomeEffects?.suspended && !document.body.classList.contains('is-interlude');
  const moving = () => enabled() && !reduced.matches && !window.inteonHomeEffects?.ambientPaused;
  const level = () => Math.max(1, Math.min(10, Number(root.dataset.graphicsLevel) || 5));
  const paintRate = () => level() <= 3 ? 24 : level() <= 6 ? 36 : 48;
  const noise = seed => { const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return value - Math.floor(value); };
  const symbols = () => window.inteonTextMotion?.symbols || '01/\\|<>[]{}#$%&*+-=░▒:;';
  const signalText = (text, row, epoch) => {
    const alphabet = symbols();
    return Array.from(text).slice(0, 68).map((char, index) => /\s/.test(char) ? ' ' :
      alphabet[Math.floor(noise(row * 97 + index * 13 + epoch * 19) * alphabet.length)]).join('');
  };
  const invalidate = () => { revision++; for (const side of sides) side.start = NaN; };
  const create = () => {
    if (sides.length) return;
    for (const edge of ['top', 'bottom']) {
      const canvas = document.createElement('canvas');
      canvas.className = 'playlist-curve'; canvas.dataset.edge = edge;
      canvas.setAttribute('aria-hidden', 'true'); canvas.setAttribute('inert', '');
      const texture = document.createElement('canvas');
      const context = canvas.getContext('2d'), textureContext = texture.getContext('2d');
      if (!context || !textureContext) continue;
      shell.append(canvas);
      const particles = Array.from({length: 160}, (_, i) => ({
        phase: noise(i + (edge === 'top' ? 9 : 409)), lane: noise(i + 619),
        speed: .07 + noise(i + 317) * .12, length: noise(i + 219), weight: noise(i + 811),
      }));
      sides.push({canvas, context, texture, textureContext, edge, start: NaN, epoch: -1, draws: 0, particles});
    }
  };
  const readGeometry = () => {
    items = Array.from(list.children);
    const first = items[0];
    width = list.clientWidth; height = list.clientHeight;
    rowHeight = first?.getBoundingClientRect().height || 0;
    firstOffset = first?.offsetTop || 0;
    if (!rowHeight || !width || !height) return false;
    depth = Math.min(150, Math.max(44, innerHeight * .105));
    const bounds = shell.getBoundingClientRect();
    gutter = Math.max(0, bounds.left);
    ellipseY = height / 2 + depth;
    edgeAngle = Math.asin(height / (2 * ellipseY));
    edgeCos = Math.cos(edgeAngle);
    ellipseX = Math.min(48, width * .055) / (1 - edgeCos);
    scrollOffset = list.scrollTop; orbitScroll = NaN;
    // Texture resolution is intentionally bounded: it becomes a distorted
    // reflection, and never needs an additional full-resolution DOM snapshot.
    ratio = Math.min(1, 1100 / width);
    const style = getComputedStyle(first.querySelector('.track-title') || first);
    const artistStyle = getComputedStyle(first.querySelector('.track-artist') || first);
    titleFont = style.font || titleFont; artistFont = artistStyle.font || artistFont;
    titleSize = parseFloat(style.fontSize) || titleSize;
    artistSize = parseFloat(artistStyle.fontSize) || artistSize;
    shell.style.setProperty('--playlist-curve-depth', `${depth}px`);
    shell.style.setProperty('--playlist-curve-gutter', `${gutter}px`);
    // A longer river must not become a full-DPR viewport renderer. Keep the
    // existing four surfaces and cap the decorative backing width at 1440.
    const dpr = Math.min(devicePixelRatio || 1, level() <= 3 ? .75 : 1, 1440 / (width + gutter));
    for (const side of sides) {
      side.depth = Math.max(1, side.edge === 'top' ? bounds.top : innerHeight - bounds.bottom + 1);
      side.canvas.style.setProperty('--playlist-curve-depth', `${side.depth}px`);
      const targetWidth = Math.round((width + gutter) * dpr), targetHeight = Math.round(side.depth * dpr);
      if (side.canvas.width !== targetWidth) side.canvas.width = targetWidth;
      if (side.canvas.height !== targetHeight) side.canvas.height = targetHeight;
      side.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const textureWidth = Math.ceil(width * ratio), textureHeight = Math.ceil(rowHeight * textureRows * ratio);
      if (side.texture.width !== textureWidth) side.texture.width = textureWidth;
      if (side.texture.height !== textureHeight) side.texture.height = textureHeight;
      side.textureContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    geometryDirty = false; invalidate(); return true;
  };
  const updateOrbit = () => {
    if (orbitScroll === scrollOffset) return;
    orbitScroll = scrollOffset;
    const visibleRows = new Set();
    const begin = Math.max(0, Math.floor((scrollOffset - firstOffset) / rowHeight) - 1);
    const end = Math.min(items.length, Math.ceil((scrollOffset + height - firstOffset) / rowHeight) + 1);
    for (let index = begin; index < end; index++) {
      const row = items[index];
      const y = firstOffset + (index + .5) * rowHeight - scrollOffset - height / 2;
      const x = ellipseX * (Math.sqrt(Math.max(0, 1 - (y / ellipseY) ** 2)) - edgeCos);
      row.style.setProperty('--playlist-orbit-x', `${x.toFixed(2)}px`);
      visibleRows.add(row);
    }
    for (const row of orbitRows) if (!visibleRows.has(row)) row.style.removeProperty('--playlist-orbit-x');
    orbitRows.clear(); for (const row of visibleRows) orbitRows.add(row);
  };
  const clearOrbit = () => {
    for (const row of orbitRows) row.style.removeProperty('--playlist-orbit-x');
    orbitRows.clear(); orbitScroll = NaN;
  };
  const readPalette = () => {
    const style = getComputedStyle(root);
    accent = style.getPropertyValue('--interface-accent').trim() || accent;
    ink = style.getPropertyValue('--theme-text-rgb').trim() || ink;
    paletteDirty = false; invalidate();
  };
  const rounded = (ctx, x, y, w, h, radius) => {
    const r = Math.min(radius, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };
  const cacheRows = (side, start, epoch) => {
    if (side.start === start && side.epoch === epoch) return;
    side.start = start; side.epoch = epoch;
    const ctx = side.textureContext;
    ctx.clearRect(0, 0, width, rowHeight * textureRows);
    ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    for (let index = 0; index < textureRows; index++) {
      const item = items[((start + index) % items.length + items.length) % items.length];
      if (!item) continue;
      const y = index * rowHeight;
      rounded(ctx, 2, y + 2, width - 4, rowHeight - 4, 20);
      ctx.fillStyle = `rgba(${accent}, .045)`; ctx.fill();
      ctx.strokeStyle = `rgba(${ink}, .22)`; ctx.stroke();
      const cover = item.querySelector('.cover-image');
      const coverSize = Math.max(0, Math.min(48, rowHeight - 14) / 2);
      const titleY = y + rowHeight / 2 - artistSize * .6;
      let textX = 7;
      if (cover?.complete && cover.naturalWidth) {
        ctx.save(); rounded(ctx, 7, titleY - coverSize / 2, coverSize, coverSize, coverSize * .38); ctx.clip();
        ctx.drawImage(cover, 7, titleY - coverSize / 2, coverSize, coverSize); ctx.restore();
        textX += coverSize + 4;
      }
      const title = item.querySelector('.track-title');
      const artist = item.querySelector('.track-artist');
      ctx.font = titleFont; ctx.fillStyle = `rgba(${ink}, .88)`;
      const titleText = title?.dataset.originalText || item.dataset.trackTitle || title?.textContent || '';
      ctx.fillText(signalText(titleText, start + index, epoch), textX, titleY, width - textX - 16);
      ctx.font = artistFont; ctx.fillStyle = `rgba(${accent}, .65)`;
      const artistText = artist?.dataset.originalText || artist?.textContent || '';
      ctx.fillText(signalText(artistText, start + index + 611, epoch), 7, y + rowHeight / 2 + titleSize * .6, width - 23);
    }
  };
  const cubic = (a, b, c, t) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3 * c;
  const riverPoint = (side, p) => {
    const top = side.edge === 'top';
    const angle = edgeAngle + (Math.PI / 2 - edgeAngle) * p;
    // Retain the old near-edge fold, then let its tail continue to the viewport
    // instead of stopping after 10.5vh. Both banks share the row arc's tangent.
    const bend = ellipseY * Math.sin(angle) - height / 2;
    const y = bend + (side.depth - depth) * p * p;
    const t = Math.max(0, Math.min(1, y / side.depth));
    const tangent = -ellipseX / ellipseY * Math.tan(edgeAngle) * side.depth / 3;
    const left = top ? cubic(tangent, -innerWidth * .075, -innerWidth * .192, t)
      : cubic(tangent, -innerWidth * .75, -innerWidth * .66, t);
    const right = top ? cubic(tangent, -innerWidth * .14, -innerWidth * .192 - width * .16, t)
      : cubic(tangent, -innerWidth * .025, innerWidth * .10, t);
    return {x: gutter + 2 + left, y, width: width + right - left};
  };
  const paintSide = (side, scroll, time) => {
    const ctx = side.context, top = side.edge === 'top';
    const boundary = scroll + (top ? 0 : height);
    const sourceDepth = rowHeight * 3.6;
    const start = Math.floor((boundary - (top ? sourceDepth : 0) - firstOffset) / rowHeight);
    const epoch = Math.floor(time * 5), grainEpoch = Math.floor(time * 16);
    cacheRows(side, start, epoch);
    ctx.clearRect(0, 0, width + gutter, side.depth);
    const bands = 28 + level() * 4, bandSize = sourceDepth / bands;
    for (let band = 0; band < bands; band++) {
      const p = band / bands, end = (band + 1) / bands;
      const near = riverPoint(side, p), far = riverPoint(side, end);
      const shake = (noise(band + grainEpoch * 41) - .5) * (3 + level()) * p * p;
      const x = near.x + shake;
      const globalY = top ? boundary - (band + 1) * bandSize : boundary + band * bandSize;
      const sourceY = (globalY - firstOffset - start * rowHeight) * ratio;
      const dropout = p > .12 && noise(band * 7 + grainEpoch * 3) > .77 ? .24 : 1;
      ctx.globalAlpha = .76 * Math.pow(1 - p, 1.7) * dropout;
      ctx.drawImage(side.texture, 0, sourceY, width * ratio, bandSize * ratio,
        x, top ? side.depth - far.y : near.y, near.width, far.y - near.y + .45);
    }
    // Sparse rectangular grains, not a full-resolution noise bitmap. Their
    // outward/leftward trajectories use time, so detail changes keep the wind.
    const count = 20 + level() * 8;
    for (let index = 0; index < count; index++) {
      const seed = side.particles[Math.floor(index * side.particles.length / count)];
      const p = (seed.phase + time * seed.speed) % 1;
      const point = riverPoint(side, p);
      const x = point.x + seed.lane * point.width * .82 - width * p * .08;
      const y = top ? side.depth - point.y : point.y;
      const length = 1 + seed.length * (2 + p * 19);
      ctx.fillStyle = index % 4 ? `rgb(${accent})` : `rgb(${ink})`;
      ctx.globalAlpha = Math.sin(p * Math.PI) * (.13 + seed.weight * .45) * (1 - p * .6);
      ctx.fillRect(x, y, length, seed.weight > .87 ? 1.6 : .8);
      if (level() >= 5 && index % 9 === 0) {
        ctx.globalAlpha *= .23; ctx.fillRect(x + length + 2, y, length * 2.5, .65);
      }
    }
    // Two faint tracking tears move through the curled surface like tape noise.
    ctx.fillStyle = `rgb(${ink})`;
    for (let index = 0; index < 2; index++) {
      const p = (time * (.13 + index * .06) + index * .43) % 1;
      const point = riverPoint(side, p);
      ctx.globalAlpha = .065 * Math.sin(p * Math.PI);
      ctx.fillRect(point.x, top ? side.depth - point.y : point.y, point.width * (.5 + p * .2), .8);
    }
    ctx.globalAlpha = 1;
    side.canvas.dataset.scroll = scroll.toFixed(2);
    side.canvas.dataset.drawCount = String(++side.draws);
    side.canvas.dataset.revision = String(revision);
    side.canvas.dataset.direction = 'left';
    side.canvas.dataset.trajectory = 'river';
    side.canvas.dataset.depth = String(side.depth);
    side.canvas.dataset.windParticles = String(count);
    side.canvas.dataset.glyphRevision = String(epoch);
  };
  const paint = (now = performance.now()) => {
    frame = 0;
    if (!enabled()) return;
    const clock = window.inteonHomeEffects?.ambientNow(now) ?? now;
    if (!dirty && clock - lastPaint < 1000 / paintRate()) {
      if (moving()) schedule();
      return;
    }
    create();
    if (geometryDirty && !readGeometry()) return;
    if (!items.length) return;
    if (paletteDirty) readPalette();
    updateOrbit();
    const scroll = scrollOffset;
    const time = reduced.matches ? 0 : clock / 1000;
    for (const side of sides) paintSide(side, scroll, time);
    lastPaint = clock; dirty = false;
    window.inteonHomeEffects?.beat('playlist-curve');
    if (moving()) schedule();
  };
  const schedule = () => { if (enabled() && !frame) frame = requestAnimationFrame(paint); };
  const repaint = () => { dirty = true; schedule(); };
  const resize = () => { geometryDirty = true; repaint(); };
  list.addEventListener('scroll', () => {
    scrollOffset = list.scrollTop;
    // Interactive rows also follow the ellipse while decorative canvases sleep.
    if (desktop.matches && !geometryDirty && rowHeight) updateOrbit();
    repaint();
  }, {passive: true});
  list.addEventListener('inteon-catalog-fit', resize);
  new ResizeObserver(resize).observe(list);
  new MutationObserver(resize).observe(list, {childList: true});
  let wasEnabled = enabled();
  const syncMotion = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (enabled() && (dirty || moving())) schedule();
  };
  const stateChanged = () => {
    const active = enabled();
    if (!desktop.matches) clearOrbit();
    if ((!active || !moving()) && frame) { cancelAnimationFrame(frame); frame = 0; }
    if (active && !wasEnabled) resize();
    else if (moving()) schedule();
    wasEnabled = active;
  };
  new MutationObserver(stateChanged).observe(document.body, {attributes: true, attributeFilter: ['class']});
  document.addEventListener('visibilitychange', stateChanged);
  desktop.addEventListener('change', stateChanged);
  reduced.addEventListener('change', () => {dirty = true; syncMotion();});
  window.addEventListener('resize', resize, {passive: true});
  window.addEventListener('inteon-quality-change', resize);
  window.addEventListener('inteon-theme-frame', () => { paletteDirty = true; repaint(); });
  window.addEventListener('inteon-ambient-change', syncMotion);
  window.addEventListener('inteon-effects-change', stateChanged);
  window.inteonHomeEffects?.watch('playlist-curve', {blocked: () => !moving(), restart: syncMotion});
  window.addEventListener('pagehide', () => { departed = true; syncMotion(); });
  window.addEventListener('pageshow', () => { departed = false; resize(); });
  document.fonts?.ready.then(resize);
  schedule();
})();
