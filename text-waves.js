/* Spatial successor to the original matrix-text symbol cycle (eeb6abc).
   Decoration never replaces the underlying text, names, or live player values. */
(() => {
  const createTextAudioMotion = (minimumSymbolRate = 44) => {
    let lastAt = null, mid = 0, bassSlow = 0, previousBass = 0;
    let burstAt = -Infinity, burstPower = 0, nextBurstAt = 0, serial = 0;
    const state = {symbolRate: minimumSymbolRate, mid: 0, bass: 0, burst: 0, playing: false, due: false, serial: 0, motionTime: 0};
    const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
    return {
      update(now, input) {
        const first = lastAt === null;
        const elapsed = first ? 0 : Math.max(0, Math.min(100, now - lastAt));
        lastAt = now;
        const playing = Boolean(input?.playing);
        const targetMid = playing ? clamp(input.mid) : 0;
        const bass = playing ? clamp(input.bass) : 0;
        const silent = !playing || (targetMid < .002 && bass < .002);
        if (silent) {
          mid = 0; bassSlow = 0; previousBass = 0; burstPower = 0;
        } else {
          const smoothing = 1 - Math.exp(-elapsed / (targetMid > mid ? 60 : 240));
          mid += (targetMid - mid) * smoothing;
          if (Math.abs(targetMid - mid) < .0001) mid = targetMid;
          if (first) bassSlow = bass;
          const rise = (bass - previousBass) * 16.667 / Math.max(8, elapsed);
          if (!first && elapsed && bass > .12 && rise > .025 && bass - bassSlow > .08 && now >= nextBurstAt) {
            burstAt = now; burstPower = Math.min(1, rise / .12); nextBurstAt = now + 450;
          }
          bassSlow += (bass - bassSlow) * (1 - Math.exp(-elapsed / 220));
          previousBass = bass;
        }
        const burst = burstPower * Math.pow(Math.max(0, 1 - (now - burstAt) / 200), 1.5);
        const base = minimumSymbolRate + (144 - minimumSymbolRate) * Math.pow(mid, .8);
        const symbolRate = Math.min(144, Math.max(minimumSymbolRate, base + (144 - base) * burst));
        // Wave travel follows elapsed time, independently of delivered frames
        // or graphics detail. Bass adds a brief, smooth acceleration.
        state.motionTime += elapsed * (1 + mid * .6 + burst * 1.4);
        // Music controls symbol lifetime and wave speed, never frame delivery.
        const due = !first && elapsed > 0;
        if (due) serial++;
        Object.assign(state, {symbolRate, mid, bass, burst, playing, due, serial});
        return state;
      },
      reset() {
        lastAt = null; mid = 0; bassSlow = 0; previousBass = 0;
        burstAt = -Infinity; burstPower = 0; nextBurstAt = 0;
        Object.assign(state, {symbolRate: minimumSymbolRate, mid: 0, bass: 0, burst: 0, playing: false, due: false, motionTime: 0});
      },
      get state() { return state; },
    };
  };
  // Reserve a predictable slice for live text; quality changes density, not time.
  const textWorkBudget = (mobile, level) => {
    const detail = Math.max(0, Math.min(9, (Number(level) || 3) - 1));
    return mobile ? {candidates: 32 + Math.round(detail * 3.5), writes: 12 + Math.round(detail * 1.3)}
      : {candidates: 128, writes: 24};
  };
  const glyphAdmissionCredit = (credit, elapsed, writes) =>
    Math.min(writes / 2, credit + writes * 30 * elapsed / 1000);
  // Retire visible symbols before admitting new ones. A crowded catalogue must
  // reduce simultaneous noise, not strand a letter until the full list cycles.
  const createGlyphQueue = apply => {
    const active = new Set();
    const paint = (char, glyph = '', expiresAt = 0) => {
      if (char.glyph === glyph) return false;
      char.glyph = glyph;
      char.expiresAt = expiresAt;
      if (glyph) active.add(char); else active.delete(char);
      apply(char, glyph);
      return true;
    };
    return {
      paint,
      get size() { return active.size; },
      expire(now, limit) {
        let writes = 0;
        for (const char of active) {
          if (!char.el.isConnected) { active.delete(char); continue; }
          if (char.expiresAt <= now && writes < limit) {
            if (paint(char)) writes++;
          }
        }
        return writes;
      },
    };
  };
  const audioMotion = createTextAudioMotion(matchMedia('(pointer: coarse), (max-width: 800px)').matches ? 60 : 44);
  let glyphUpdates = 0;
  // Symbol rate is musical activity, not an FPS cap; updates count RAF work.
  window.inteonTextMotion = Object.freeze({
    get symbolRate() { return audioMotion.state.symbolRate; },
    get mid() { return audioMotion.state.mid; },
    get bass() { return audioMotion.state.bass; },
    get burst() { return audioMotion.state.burst; },
    get updates() { return glyphUpdates; },
    get motionTime() { return audioMotion.state.motionTime; },
    get symbols() { return symbols; },
  });
  const selector = [
    '.matrix-text', '.listening-intro h1', '.catalog-heading h2', '.track-title', '.track-artist',
    '.track-art', '.now-playing-title', '.active-track-artist', '.player-caption', '.volume-control label',
    '.transport-time', '.playback-status', '.auth-hint', '.street-link', '.theme-hint', '.chat-hint',
    '.auth-kicker', '.auth-label', '.auth-submit', '.auth-close', '.auth-logout', '.chat-close',
    '.theme-kicker', '.theme-label', '.theme-action', '.theme-duration-output', '.theme-status',
    '.room-console .page-title h2', '.room-console .section-heading h2', '.room-console .meter-copy span:first-child',
    '.room-console .console-nav button', '.room-console .controller-tabs button', '.room-console #keys-footer', '.room-console #record-text', '.room-console #audio-status',
    '.room-console .dd-deck-state', '.room-console .dd-track-text h2', '.room-console .dd-artist',
    '.room-console .dd-key', '.room-console .dd-bpm', '.room-console .dd-bpm-unit', '.room-console .dd-browse-title', '.room-console .dd-browse-artist',
    '.room-console .dd-browse-count', '.room-console .dd-browse-bpm', '.room-console .dd-browse-load span',
    '.room-console .dd-lock span', '.room-console .dd-wheel-modes button', '.room-console .dd-sync span', '.room-console .dd-cue',
    '.room-console .dd-loop span', '.room-console .dd-pad-label', '.room-console .dd-pitch-title', '.room-console .dd-pitch-value',
    '.room-console .strip-tag', '.room-console .dial-name', '.room-console .vol-label', '.room-console .center-cross',
    '.room-console .cross-title label', '.room-console .master-control label',
  ].join(',');
  const studio = document.querySelector('.room-console');
  const projection = studio && window.createStudioHolograms?.(studio);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse), (max-width: 800px)');
  const directGlyph = Boolean(window.CSS?.supports('content', 'attr(data-glyph) / ""'));
  const symbols = '01/\\|<>[]{}#$%&*+-=░▒:;';
  const pointer = {x: 0, y: 0, active: false, until: Infinity};
  const modes = [
    {name: 'rhythm', duration: 16000, gap: 900, strength: .72, speed: .56, width: 115},
    {name: 'quiet', duration: 3500, gap: 1200, strength: .32, speed: .44, width: 80},
    {name: 'surge', duration: 9500, gap: 550, strength: .97, speed: .84, width: 165},
    {name: 'drift', duration: 10500, gap: 1100, strength: .48, speed: .48, width: 120},
  ];
  let chars = [], visibleChars = [], waves = [], frameId = 0, serial = 0, needsScan = true, dirty = true;
  let selected = false, focusTarget = null;
  let glyphCursor = 0, glyphCredit = 0, glyphStartCredit = 0, glyphAt = 0, calmDirty = false;
  let fullScan = true;
  let geometryRevision = 0;
  const pendingOwners = new Set();
  const rowSelector = '.track-item, .dd-browse-row';
  const observedRows = new Set(), nearbyRows = new Set(), pendingRows = new Set();
  // Only a small window of the three repeated playlist cycles needs glyph DOM.
  // IntersectionObserver supplies clipping bounds without measuring every row.
  const rowObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const row = entry.target;
      if (entry.isIntersecting) nearbyRows.add(row);
      else nearbyRows.delete(row);
      pendingRows.add(row);
      row.querySelectorAll(selector).forEach(owner => pendingOwners.add(owner));
    }
    needsScan = true; dirty = true;
  }, {rootMargin: '72px 0px', threshold: 0});
  const observeRows = scope => {
    const rows = scope.matches?.(rowSelector) ? [scope] : scope.querySelectorAll?.(rowSelector) || [];
    for (const row of rows) {
      if (observedRows.has(row)) continue;
      observedRows.add(row); rowObserver.observe(row);
    }
  };
  let modeIndex = 0, modeUntil = 0, nextWave = 0, measuredAt = -Infinity, lastGlyphFrame = -1;
  const hash = n => { let value = Math.imul(n | 0, 374761393); value = Math.imul(value ^ (value >>> 13), 1274126177); return ((value ^ (value >>> 16)) >>> 0) / 4294967296; };
  const glyphQueue = createGlyphQueue((char, glyph) => {
    char.el.classList.toggle('is-wave-noisy', Boolean(glyph));
    char.mask.dataset.glyph = glyph;
  });
  const paint = glyphQueue.paint;
  const restore = () => chars.forEach(char => paint(char));
  const observerOptions = {subtree: true, childList: true, characterData: true, attributeOldValue: true, attributeFilter: ['hidden', 'aria-hidden', 'data-panel']};
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!element || element.closest('.text-wave-char, .studio-projection')) continue;
      if (record.type === 'attributes') {
        if (element.getAttribute(record.attributeName) !== record.oldValue) { fullScan = true; needsScan = true; }
        continue;
      }
      const owner = element?.closest(selector);
      if (owner) { pendingOwners.add(owner); needsScan = true; }
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        observeRows(node);
        if (node.matches(selector)) pendingOwners.add(node);
        node.querySelectorAll(selector).forEach(el => pendingOwners.add(el));
      }
      // An audio meter may write the same text every frame. Only removal of
      // actual text-wave DOM or playlist rows invalidates measured geometry.
      if (!needsScan && Array.from(record.removedNodes).some(node => node.nodeType === Node.ELEMENT_NODE &&
          (node.matches('.text-wave-run,' + rowSelector) || node.querySelector('.text-wave-run,' + rowSelector)))) needsScan = true;
      if (pendingOwners.size) needsScan = true;
    }
  });
  const scan = () => {
    observer.disconnect();
    if (fullScan) observeRows(document);
    for (const row of observedRows) if (!row.isConnected) {
      rowObserver.unobserve(row); observedRows.delete(row); nearbyRows.delete(row);
    }
    const owners = [...(fullScan ? document.querySelectorAll(selector) : pendingOwners)].filter(owner => {
      if (!owner.isConnected || owner.closest('[hidden]')) return false;
      const row = owner.closest(rowSelector);
      return (!row || nearbyRows.has(row)) && owner.getClientRects().length;
    });
    fullScan = false; pendingOwners.clear();
    let changed = false;
    const selection = selected ? getSelection() : null;
    // Do not replace an image, a title container, or a user's selected text.
    // A run's textContent is still the original text; glyphs live only in CSS.
    for (const row of pendingRows) {
      if (nearbyRows.has(row) || (selection && (row.contains(selection.anchorNode) || row.contains(selection.focusNode)))) continue;
      row.querySelectorAll('.text-wave-run').forEach(run => {
        run.replaceWith(document.createTextNode(run.textContent)); changed = true;
      });
    }
    pendingRows.clear();
    owners.forEach(owner => {
      const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent.trim() || node.parentElement.closest('.text-wave-run, .visually-hidden, input, textarea, select, [contenteditable], svg')) return NodeFilter.FILTER_REJECT;
          const hidden = node.parentElement.closest('[aria-hidden="true"]');
          if (hidden && !hidden.classList.contains('heading-letter')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const studioLabel = studio && studio.contains(owner);
        const run = document.createElement('span'); run.className = 'text-wave-run';
        // Each word wraps at the native text boundary. Glyph kerning must never
        // push the second word of a track title onto a different line.
        const parts = studioLabel ? node.textContent.split(/(\s+)/) : [node.textContent];
        for (const part of parts) {
          if (!part) continue;
          if (studioLabel && /^\s+$/.test(part)) { run.append(document.createTextNode(part)); continue; }
          let ink = run;
          if (studioLabel) {
            const word = document.createElement('span'); word.className = 'studio-wave-word';
            const source = document.createElement('span'); source.className = 'studio-wave-source'; source.textContent = part;
            ink = document.createElement('span'); ink.className = 'studio-wave-ink'; ink.setAttribute('aria-hidden', 'true');
            word.append(source, ink); run.append(word);
          }
          for (const letter of part) {
            if (/\s/.test(letter)) { ink.append(document.createTextNode(letter)); continue; }
            const el = document.createElement('span'); el.className = 'text-wave-char';
            if (studioLabel) el.dataset.letter = letter;
            else el.textContent = letter;
            let mask = el;
            if (directGlyph) el.classList.add('direct-wave-char');
            else {
              mask = document.createElement('span'); mask.className = 'text-wave-mask'; mask.setAttribute('aria-hidden', 'true');
              el.append(mask);
            }
            ink.append(el);
            chars.push({el, mask, owner, seed: ++serial, glyph: '', x: 0, y: 0, visible: false});
          }
        }
        node.replaceWith(run);
        changed = true;
      });
    });
    chars = chars.filter(char => char.el.isConnected);
    visibleChars = visibleChars.filter(char => char.el.isConnected);
    if (changed) geometryRevision++;
    observer.observe(document.body, observerOptions);
    needsScan = false; dirty = true; focusTarget = null;
    return changed;
  };
  const measure = now => {
    const bounds = new Map();
    const lists = new Map();
    visibleChars = [];
    // Finish every layout read before restoring ink; writes here used to force a
    // second layout for the next character, including clipped playlist rows.
    chars.forEach(char => {
      if (!bounds.has(char.owner)) {
        const list = char.owner.closest('.track-list, .dd-browse-list');
        if (list && !lists.has(list)) lists.set(list, list.getBoundingClientRect());
        bounds.set(char.owner, {rect: char.owner.getBoundingClientRect(), clip: lists.get(list)});
      }
      const {rect: owner, clip} = bounds.get(char.owner);
      char.visible = false;
      if (!owner.width || !owner.height || owner.bottom < 0 || owner.top > innerHeight ||
          (clip && (owner.bottom < clip.top || owner.top > clip.bottom))) return;
      // Scrolling changes the owner's position, not every glyph's local box.
      // Measure glyph geometry only after content/font/size changes.
      if (char.geometryRevision !== geometryRevision || char.ownerWidth !== owner.width || char.ownerHeight !== owner.height) {
        const rect = char.el.getBoundingClientRect();
        char.offsetX = rect.left + rect.width / 2 - owner.left;
        char.offsetY = rect.top + rect.height / 2 - owner.top;
        char.width = rect.width;
        char.ownerWidth = owner.width; char.ownerHeight = owner.height;
        char.geometryRevision = geometryRevision;
      }
      char.x = owner.left + char.offsetX; char.y = owner.top + char.offsetY;
      char.visible = char.width > 0 && char.x >= 0 && char.x <= innerWidth && char.y >= 0 && char.y <= innerHeight &&
        char.x <= owner.right && char.y <= owner.bottom && (!clip || (char.y >= clip.top && char.y <= clip.bottom));
      if (char.visible) visibleChars.push(char);
    });
    chars.forEach(char => { if (!char.visible) paint(char); });
    dirty = false; measuredAt = now;
  };
  let studioVisible = true;
  const blocked = () => document.hidden || window.inteonHomeEffects?.ambientBlocked || (studio && (reduced.matches || !studioVisible));
  const tick = now => {
    window.inteonHomeEffects?.beat('text');
    frameId = 0;
    if (blocked()) { resume(); return; }
    frameId = requestAnimationFrame(tick);
    const cadence = audioMotion.update(now, window.inteonAudioBands?.read());
    if (!reduced.matches && !cadence.due) return;
    const frame = reduced.matches ? Math.floor(now / 180) : cadence.serial;
    if (frame === lastGlyphFrame) return;
    lastGlyphFrame = frame;
    glyphUpdates++;
    const budget = textWorkBudget(coarse.matches, document.documentElement.dataset.graphicsLevel);
    // Let the browser lay out newly wrapped rows before reading glyph bounds.
    // Still retire old ink on scan frames; it cannot wait for geometry work.
    if (needsScan && scan()) { glyphQueue.expire(now, budget.writes); return; }
    if ((dirty && (!coarse.matches || now - measuredAt >= 100)) || now - measuredAt > 1200) measure(now);
    let writes = glyphQueue.expire(now, budget.writes);
    if (!modeUntil) { modeUntil = now + modes[0].duration; nextWave = now + 100; }
    if (now >= modeUntil) {
      modeIndex = (modeIndex + 1) % modes.length;
      modeUntil = now + modes[modeIndex].duration * (.85 + Math.random() * .3);
    }
    const baseMode = modes[modeIndex];
    const mode = coarse.matches ? {...baseMode, gap: Math.min(baseMode.gap, 1600), strength: Math.max(baseMode.strength, .24)} : baseMode;
    if (document.documentElement.dataset.textWaveMode !== mode.name) document.documentElement.dataset.textWaveMode = mode.name;
    if (now >= nextWave) {
      const origin = studio && visibleChars[Math.floor(Math.random() * visibleChars.length)];
      const x = origin ? origin.x : innerWidth * (.12 + Math.random() * .76);
      const y = origin ? origin.y : innerHeight * (.1 + Math.random() * .65);
      if (origin && !selected && !origin.focused && (!pointer.active || now > pointer.until || Math.hypot(x - pointer.x, y - pointer.y) > 110)) {
        paint(origin, '·', now + 220);
        projection?.seed(cadence.motionTime, x, y);
      }
      waves.push({at: cadence.motionTime + (origin ? 120 : 0), x, y, ...mode});
      nextWave = now + mode.gap * (mode.name === 'rhythm' ? 1 : .75 + Math.random() * .5);
    }
    projection?.draw(cadence.motionTime, coarse.matches);
    waves = waves.filter(wave => (cadence.motionTime - wave.at) * wave.speed < Math.hypot(innerWidth, innerHeight) + wave.width * 2);
    const focus = document.activeElement;
    if (focus !== focusTarget) {
      focusTarget = focus;
      // :focus-visible can flush style. Read it once before any ink writes,
      // never once per glyph (especially when focus is simply the body).
      const meaningful = focus && focus !== document.body && focus !== document.documentElement;
      const focusVisible = meaningful && focus.matches(':focus-visible');
      chars.forEach(char => {
        char.focused = meaningful && (char.owner.contains(focus) || (focusVisible && focus.contains(char.el)));
        if (char.focused) paint(char);
      });
    }
    const calmRadius = coarse.matches ? 70 : 175;
    if (calmDirty) {
      calmDirty = false;
      for (const char of visibleChars) if (char.glyph && Math.hypot(char.x - pointer.x, char.y - pointer.y) < calmRadius * .65) paint(char);
    }
    // Advance the wave every display frame, spreading glyph replacements over
    // that cadence. A dense wave cannot force hundreds of DOM edits at once.
    const elapsed = Math.min(120, Math.max(0, now - (glyphAt || now - 16.7)));
    glyphAt = now;
    const renewalMs = reduced.matches ? 180 : Math.max(32, 80 * 44 / cadence.symbolRate);
    glyphCredit = Math.min(visibleChars.length, glyphCredit + visibleChars.length * elapsed / renewalMs);
    // Admit a steady stream instead of filling the active pool in a few frames
    // then waiting for it all to expire. Leave room for retiring old ink.
    glyphStartCredit = glyphAdmissionCredit(glyphStartCredit, elapsed, budget.writes);
    const candidates = Math.min(budget.candidates, visibleChars.length, Math.floor(glyphCredit));
    for (let i = 0; i < candidates && writes < budget.writes; i++) {
      glyphCredit -= 1;
      const char = visibleChars[glyphCursor++ % visibleChars.length];
      if (selected || char.focused) { if (paint(char)) writes++; continue; }
      if (char.glyph || glyphStartCredit < 1 || glyphQueue.size >= budget.writes * 3) continue;
      let intensity = 0;
      for (const wave of waves) {
        const distance = Math.hypot(char.x - wave.x, char.y - wave.y);
        const age = cadence.motionTime - wave.at;
        const band = (distance - age * wave.speed) / wave.width;
        const onset = studio ? Math.max(0, Math.min(1, age / 320)) : 1;
        intensity = Math.max(intensity, Math.exp(-band * band * 2) * wave.strength * onset);
      }
      if (pointer.active && now < pointer.until) {
        const distance = Math.hypot(char.x - pointer.x, char.y - pointer.y);
        const edge = Math.max(0, Math.min(1, (distance - calmRadius * .65) / (calmRadius * .65)));
        intensity *= edge * edge * (3 - 2 * edge);
        // Rare single-character twitches, while the readable core stays calm.
        if (distance < calmRadius * .65 && Math.floor(now / 110) % 47 === 0) intensity = .012;
      }
      const noisy = hash(char.seed * 37 + frame * 213) < intensity;
      const glyph = studio && intensity < .18 ? '·' : symbols[Math.floor(hash(char.seed + frame * 73) * symbols.length)];
      if (noisy && paint(char, glyph, now + renewalMs)) {
        writes++; glyphStartCredit--;
      }
    }
  };
  const calm = event => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
    calmDirty = true;
    pointer.until = event.pointerType === 'touch' ? performance.now() + 700 : Infinity;
    // Coalesce high-rate mouse events into the next display frame.
  };
  window.addEventListener('pointermove', calm, {passive: true});
  window.addEventListener('pointerdown', calm, {passive: true});
  document.documentElement.addEventListener('pointerleave', event => {
    // Touch sends pointerleave as soon as the finger lifts; keep its calm area
    // briefly after a tap, while mouse leave restores normal waves.
    if (event.pointerType !== 'touch') pointer.active = false;
  });
  document.addEventListener('scroll', () => { dirty = true; }, {capture: true, passive: true});
  window.addEventListener('resize', () => { geometryRevision++; dirty = true; });
  const resume = () => { cancelAnimationFrame(frameId); frameId = 0; waves = []; modeUntil = 0; lastGlyphFrame = -1; glyphAt = 0; glyphCredit = 0; glyphStartCredit = 0; audioMotion.reset(); projection?.clear(); dirty = true; focusTarget = null; restore(); if (!blocked()) frameId = requestAnimationFrame(tick); };
  if (studio) new IntersectionObserver(entries => {
    const visible = entries[0].isIntersecting;
    if (visible !== studioVisible) { studioVisible = visible; resume(); }
  }).observe(studio);
  window.inteonHomeEffects?.watch('text', {blocked, restart: resume});
  document.addEventListener('visibilitychange', resume);
  reduced.addEventListener('change', resume);
  document.addEventListener('selectionchange', () => {
    selected = !getSelection()?.isCollapsed;
    if (selected) restore();
    else {
      for (const row of observedRows) if (!nearbyRows.has(row)) pendingRows.add(row);
      if (pendingRows.size) needsScan = true;
    }
  });
  const suspended = () => document.hidden || window.inteonHomeEffects?.ambientBlocked;
  let wasBlocked = suspended();
  window.addEventListener('inteon-effects-change', () => {
    const next = suspended();
    if (next === wasBlocked) return;
    wasBlocked = next;
    resume();
  });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); frameId = 0; projection?.clear(); restore(); });
  window.addEventListener('pageshow', resume);
  document.fonts?.ready.then(() => { geometryRevision++; dirty = true; });
  resume();
})();
