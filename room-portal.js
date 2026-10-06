/* Native page snapshots retain the actual canvas, text and glass. Only the
   shard-shaped alpha mask crosses documents; no screen-capture permission. */
(() => {
  const root = document.documentElement;
  const key = 'inteon-room-portal-v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const inYard = /\/yard(?:\/|$)/.test(location.pathname);
  let busy = false, frame = 0, layer = null, navigating = false;
  let objectFlights = [], overflowRestores = [];
  let playlistFlightLayer = null, hiddenTracks = [];
  const read = () => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  const save = value => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const clear = () => { try { sessionStorage.removeItem(key); } catch {} };
  const cleanup = () => {
    playlistFlightLayer?.remove(); playlistFlightLayer = null;
    hiddenTracks.forEach(([node, value, priority]) => value ? node.style.setProperty('visibility', value, priority) : node.style.removeProperty('visibility')); hiddenTracks = [];
    objectFlights.forEach(animation => animation.cancel()); objectFlights = [];
    overflowRestores.forEach(([element, value, priority]) => value ? element.style.setProperty('overflow', value, priority) : element.style.removeProperty('overflow')); overflowRestores = [];
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
    if (direction === 'home') root.style.setProperty('--portal-aspect', Math.max(innerWidth / innerHeight, innerHeight / innerWidth));
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
  const returnHome = async (url = '../index.html', replace = false) => {
    if (busy) return;
    busy = true;
    await window.__yard?.flyToSpawn?.();
    save({to: 'home', at: Date.now()});
    window.__yard?.renderSnapshot?.();
    navigate(url, replace);
  };
  const image = new Image();
  if (!inYard) image.src = new URL('assets/logo-wordmark.svg', location.href).href;
  const warmYard = url => {
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) return;
    if (HTMLScriptElement.supports?.('speculationrules')) {
      const rules = document.createElement('script'); rules.type = 'speculationrules';
      rules.textContent = JSON.stringify({prerender: [{source: 'list', urls: [target.href], eagerness: 'immediate'}]});
      document.head.append(rules);
    } else {
      const preload = document.createElement('link'); preload.rel = 'prefetch'; preload.href = target.href;
      document.head.append(preload);
    }
  };
  const scatterObjects = () => {
    const selectors = '.topline, .listening-intro, .catalog-heading, .track-item, #active-player, #chat-panel, .mobile-sections, .theme-hint, .theme-panel, .street-return, .auth-hint, .auth-panel, .room-resident, .mirage-layer, .visit-counter, .vr-reticle, .development-debug-toggle, .development-animation-menu, .text.matrix-text';
    const visible = [...document.querySelectorAll(selectors)].filter(element => {
      const box = element.getBoundingClientRect(), css = getComputedStyle(element);
      if (!box.width || !box.height || css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0 || box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) return false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
          const clip = parent.getBoundingClientRect();
          if (box.bottom <= clip.top || box.top >= clip.bottom) return false;
        }
      }
      return true;
    });
    // Freeze visible rows outside every scrolling/masking ancestor. Keep the real
    // infinite playlist in place so scrolling cannot expose unanimated copies.
    playlistFlightLayer = document.createElement('div');
    playlistFlightLayer.setAttribute('aria-hidden', 'true');
    playlistFlightLayer.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:999';
    document.body.append(playlistFlightLayer);
    visible.forEach((element, index) => {
      if (visible.some(parent => parent !== element && parent.contains(element))) return;
      const box = element.getBoundingClientRect();
      let target = element;
      if (element.matches('.track-item')) {
        target = element.cloneNode(true);
        const sources = [element, ...element.querySelectorAll('*')];
        const copies = [target, ...target.querySelectorAll('*')];
        sources.forEach((source, i) => {
          const style = getComputedStyle(source), copy = copies[i];
          copy.removeAttribute('id'); copy.removeAttribute('onclick');
          for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
          copy.style.setProperty('animation', 'none');
          copy.style.setProperty('transition', 'none');
        });
        Object.assign(target.style, {position:'fixed', left:`${box.left}px`, top:`${box.top}px`, width:`${box.width}px`, height:`${box.height}px`, margin:'0', transform:'none', translate:'none', rotate:'none', scale:'none'});
        target.dataset.portalTrack = 'true';
        playlistFlightLayer.append(target);
        hiddenTracks.push([element, element.style.getPropertyValue('visibility'), element.style.getPropertyPriority('visibility')]);
        element.style.setProperty('visibility', 'hidden', 'important');
      }
      const x = box.left + box.width / 2 - innerWidth / 2;
      const y = box.top + box.height / 2 - innerHeight / 2;
      const dx = (x < 0 ? -1 : 1) * (innerWidth * .25 + Math.random() * innerWidth * .35);
      const dy = (y < 0 ? -1 : 1) * (innerHeight * .2 + Math.random() * innerHeight * .3);
      objectFlights.push(target.animate([
        {translate: '0px 0px', rotate: '0deg', scale: '1', opacity: getComputedStyle(element).opacity},
        {translate: `${dx}px ${dy}px`, rotate: `${Math.random()*70-35}deg`, scale: '.65', opacity: 0}
      ], {duration: 1500, delay: (index % 4) * 500, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'forwards'}));
    });
  };
  const exit = async url => {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true');
    warmYard(url);
    const deadline = Date.now() + 4500;
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
      const cols = width < 600 ? 12 : 18, rows = width < 600 ? 4 : 6, shards = [];
      const order = Array.from({length: cols*rows}, (_, index) => index);
      for (let i=order.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const sw = source.width / cols, sh = source.height / rows;
        const piece = document.createElement('canvas'); piece.width = Math.ceil(sw); piece.height = Math.ceil(sh);
        const pc = piece.getContext('2d'); pc.drawImage(source, -col * sw, -row * sh);
        if (!pc.getImageData(0, 0, piece.width, piece.height).data.some((v, i) => i % 4 === 3 && v > 100)) continue;
        // Different staggered lanes from the storm's rectangular scatter field.
        const cell = order[row*cols+col], across = width < 600 ? 5 : 10;
        const lane = Math.floor(cell/across);
        const tx = (((cell%across)+.15+Math.random()*.55+(lane%2)*.4)/across*1.12-.06)*width;
        const ty = ((lane+.2+Math.random()*.6)/Math.ceil(order.length/across)*1.12-.06)*height;
        const depth = Math.min(1, Math.hypot(tx-box.left-col*box.width/cols,ty-box.top-row*box.height/rows)/Math.hypot(width,height));
        shards.push({piece, x: box.left + (col + .5) * box.width / cols, y: box.top + (row + .5) * box.height / rows,
          w: box.width / cols, h: box.height / rows, tx, ty,
          delay: (cell % 4) * 500,
          spin: (Math.random()*150-75)*Math.PI/180, depth: .85-depth*.5, opacity: .55-depth*.36});
      }
      layer = document.createElement('canvas'); layer.className = 'portal-shards'; layer.setAttribute('aria-hidden', 'true');
      layer.width = width * ratio; layer.height = height * ratio;
      const ctx = layer.getContext('2d'); ctx.scale(ratio, ratio);
      document.body.append(layer); document.body.classList.add('portal-leaving'); root.dataset.portalPhase = 'scattering';
      scatterObjects();
      const paint = (context, elapsed, holes = false) => {
        for (const s of shards) {
          const t = holes ? 1 : Math.max(0, Math.min(1, (elapsed - s.delay) / 1500));
          const progress = 1 - Math.pow(1 - t, 3);
          context.save();
          context.translate(s.x + (s.tx - s.x) * progress, s.y + (s.ty - s.y) * progress);
          context.rotate(s.spin * progress); context.scale(1 - progress * (1 - s.depth), 1 - progress * (1 - s.depth));
          context.globalAlpha = holes ? 1 : .9+progress*(s.opacity-.9);
          context.drawImage(s.piece, -s.w / 2, -s.h / 2, s.w, s.h); context.restore();
        }
      };
      const start = performance.now();
      const tick = now => {
        const elapsed = now - start;
        ctx.clearRect(0, 0, width, height); paint(ctx, elapsed);
        if (elapsed < 3000) { frame = requestAnimationFrame(tick); return; }
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
