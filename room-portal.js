/* Native page snapshots retain the actual canvas, text and glass. Only the
   shard-shaped alpha mask crosses documents; no screen-capture permission. */
(() => {
  const root = document.documentElement;
  const key = 'inteon-room-portal-v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const inYard = /\/yard(?:\/|$)/.test(location.pathname);
  let busy = false, frame = 0, layer = null, navigating = false;
  const read = () => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  const save = value => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const clear = () => { try { sessionStorage.removeItem(key); } catch {} };
  const cleanup = () => {
    cancelAnimationFrame(frame); layer?.remove(); layer = null; busy = false; navigating = false;
    document.body?.classList.remove('portal-leaving'); root.removeAttribute('aria-busy');
    delete root.dataset.portalArrival; delete root.dataset.portalPhase;
    root.style.removeProperty('--portal-holes');
    root.style.removeProperty('--portal-exit-fade');
  };
  const prepareArrival = () => {
    const data = read(), direction = inYard ? 'yard' : 'home';
    if (!data || data.to !== direction || Date.now() - data.at > 15000 || reduced.matches) return null;
    root.dataset.portalArrival = direction;
    if (direction === 'yard') root.style.setProperty('--portal-exit-fade', `${Math.max(0, Math.min(1350, (data.deadline || Date.now() + 1350) - Date.now()))}ms`);
    if (direction === 'yard' && data.mask?.startsWith('data:image/png;base64,')) root.style.setProperty('--portal-holes', `url("${data.mask}")`);
    return data;
  };
  prepareArrival();
  // Parser-blocking in both heads: this listener exists before first paint.
  window.addEventListener('pagereveal', event => {
    const data = prepareArrival();
    clear();
    if (!data || !event.viewTransition || reduced.matches) {
      event.viewTransition?.ready.catch(() => {});
      event.viewTransition?.skipTransition(); cleanup(); return;
    }
    root.dataset.portalPhase = 'revealing';
    event.viewTransition.ready.then(() => { root.dataset.portalPhase = 'snapshot'; }).catch(() => {});
    event.viewTransition.finished.then(cleanup);
  });
  window.addEventListener('pageswap', () => {
    // WebGL's drawing buffer is transient. Render in the snapshot turn itself.
    if (inYard) window.__yard?.renderSnapshot?.();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) cleanup();
    if (!('onpagereveal' in window)) { clear(); cleanup(); }
  });
  window.navigation?.addEventListener('navigateerror', () => { clear(); cleanup(); });
  const navigate = (url, replace = false) => {
    if (navigating) return;
    navigating = true;
    if (replace) location.replace(url); else location.assign(url);
  };
  const returnHome = (url = '../index.html', replace = false) => {
    if (busy) return;
    busy = true;
    save({to: 'home', at: Date.now()});
    window.__yard?.renderSnapshot?.();
    navigate(url, replace);
  };
  const image = new Image();
  if (!inYard) image.src = new URL('assets/logo-wordmark.svg', location.href).href;
  const exit = async url => {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true');
    const deadline = Date.now() + 2000;
    if (reduced.matches || !('onpagereveal' in window)) { navigate(url); return; }
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('wordmark timeout')), 800))]);
      const box = document.querySelector('#logo-wrap').getBoundingClientRect();
      const width = innerWidth, height = innerHeight, ratio = Math.min(devicePixelRatio, 1.5);
      const source = document.createElement('canvas'); source.width = 1068; source.height = 214;
      const ink = source.getContext('2d'); ink.drawImage(image, 0, 0, 1068, 214);
      ink.globalCompositeOperation = 'source-in';
      const palette = getComputedStyle(root), color = palette.getPropertyValue('--interface-ink').trim() || '230, 232, 209';
      const tint = ink.createLinearGradient(0, 0, 1068, 214);
      tint.addColorStop(0, `rgb(${color})`); tint.addColorStop(.55, `rgb(${palette.getPropertyValue('--interface-peach').trim() || color})`); tint.addColorStop(1, `rgb(${color})`);
      ink.fillStyle = tint; ink.fillRect(0, 0, 1068, 214);
      const cols = width < 700 ? 12 : 18, rows = 3, shards = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) for (let half = 0; half < 2; half++) {
        const sw = source.width / cols, sh = source.height / rows;
        const piece = document.createElement('canvas'); piece.width = Math.ceil(sw); piece.height = Math.ceil(sh);
        const pc = piece.getContext('2d'); pc.beginPath();
        if (half) { pc.moveTo(sw, 0); pc.lineTo(sw, sh); pc.lineTo(0, sh); }
        else { pc.moveTo(0, 0); pc.lineTo(sw, 0); pc.lineTo(0, sh); }
        pc.closePath(); pc.clip(); pc.drawImage(source, -col * sw, -row * sh);
        if (!pc.getImageData(0, 0, piece.width, piece.height).data.some((v, i) => i % 4 === 3 && v > 100)) continue;
        const n = shards.length, angle = n * 2.399963;
        const radius = .3 + (n % 11) / 11 * .6;
        shards.push({piece, x: box.left + (col + .5) * box.width / cols, y: box.top + (row + .5) * box.height / rows,
          w: box.width / cols, h: box.height / rows, tx: width * (.5 + Math.cos(angle) * radius), ty: height * (.5 + Math.sin(angle) * radius),
          spin: (Math.random() - .5) * 4.4, depth: .5 + Math.random() * .5});
      }
      layer = document.createElement('canvas'); layer.className = 'portal-shards'; layer.setAttribute('aria-hidden', 'true');
      layer.width = width * ratio; layer.height = height * ratio;
      const ctx = layer.getContext('2d'); ctx.scale(ratio, ratio);
      document.body.append(layer); document.body.classList.add('portal-leaving'); root.dataset.portalPhase = 'scattering';
      const paint = (context, progress, holes = false) => {
        for (const s of shards) {
          context.save();
          context.translate(s.x + (s.tx - s.x) * progress, s.y + (s.ty - s.y) * progress);
          context.rotate(s.spin * progress); context.scale(1 - progress * (1 - s.depth), 1 - progress * (1 - s.depth));
          context.globalAlpha = holes ? 1 : 1 - progress * .34;
          context.drawImage(s.piece, -s.w / 2, -s.h / 2, s.w, s.h); context.restore();
        }
      };
      const start = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - start) / 650), progress = 1 - Math.pow(1 - t, 3);
        ctx.clearRect(0, 0, width, height); paint(ctx, progress);
        if (t < 1) { frame = requestAnimationFrame(tick); return; }
        const mask = document.createElement('canvas'); mask.width = Math.round(width); mask.height = Math.round(height);
        const mc = mask.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, width, height);
        mc.globalCompositeOperation = 'destination-out'; paint(mc, 1, true);
        save({to: 'yard', at: Date.now(), deadline, mask: mask.toDataURL('image/png')});
        root.dataset.portalPhase = 'frozen';
        // One full frame displays the dispersed fragments before the browser captures it.
        frame = requestAnimationFrame(() => requestAnimationFrame(() => navigate(url)));
      };
      frame = requestAnimationFrame(tick);
    } catch { save({to: 'yard', at: Date.now(), deadline}); navigate(url); }
  };
  window.inteonPortal = { exit, returnHome, get busy() { return busy; } };
  document.addEventListener('click', event => {
    if (!inYard || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || new URL(link.href).pathname !== new URL('../index.html', location.href).pathname) return;
    event.preventDefault(); returnHome(link.href);
  });
})();
