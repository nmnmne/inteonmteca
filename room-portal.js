/* Enter the yard immediately; retain the existing homeward flight. */
(() => {
  const root = document.documentElement;
  const key = 'inteon-room-portal-v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const inYard = /\/yard(?:\/|$)/.test(location.pathname);
  let busy = false, navigating = false;
  const read = () => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  const save = value => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const clear = () => { try { sessionStorage.removeItem(key); } catch {} };
  const cleanup = () => {
    busy = false; navigating = false;
    document.body?.classList.remove('portal-leaving'); root.removeAttribute('aria-busy');
    delete root.dataset.portalArrival; delete root.dataset.portalPhase;
  };
  const prepareArrival = () => {
    // Discard posters left by older versions before the yard's first paint.
    if (inYard) { clear(); return null; }
    const data = read();
    if (!data || data.to !== 'home' || Date.now() - data.at > 120000 || reduced.matches) return null;
    root.dataset.portalArrival = 'home';
    root.style.setProperty('--portal-aspect', Math.max(innerWidth / innerHeight, innerHeight / innerWidth));
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
  // Fetch code and layout on intent, without running a second scene or loading
  // textures. Navigation never waits for this optional cache warm-up.
  const warmed = new Set();
  const warmYard = async url => {
    const base = new URL(url, location.href);
    if (warmed.has(base.href)) return;
    warmed.add(base.href);
    const seen = new Set(), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    const get = async url => {
      const response = await fetch(url, { signal: controller.signal, priority: 'low' });
      if (!response.ok) throw Error(response.status);
      return response;
    };
    const module = async url => {
      if (seen.has(url)) return;
      seen.add(url);
      const source = await (await get(url)).text();
      const imports = [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)];
      const layouts = [...source.matchAll(/["'](\.\/data\/site-layout\.json[^"']*)["']/g)];
      await Promise.allSettled([
        ...imports.map(match => module(new URL(match[1], url).href)),
        ...layouts.map(match => get(new URL(match[1], url)).then(response => response.arrayBuffer())),
      ]);
    };
    try {
      const html = await (await get(base)).text();
      const main = html.match(/src=["']([^"']*main\.js[^"']*)/);
      if (main) await module(new URL(main[1], base).href);
    } catch {} finally { clearTimeout(timeout); }
  };
  const exit = url => {
    if (busy) return;
    busy = true;
    clear();
    document.body?.classList.add('portal-leaving');
    window.inteonStreet?.prepareExit();
    navigate(url);
  };
  window.inteonPortal = { exit, returnHome, get busy() { return busy; } };
  if (!inYard) {
    const warmOnIntent = event => {
      const link = event.target.closest?.('#street-link');
      if (link?.href) void warmYard(link.href);
    };
    document.addEventListener('pointerover', warmOnIntent, { passive: true });
    document.addEventListener('focusin', warmOnIntent);
    document.addEventListener('touchstart', warmOnIntent, { passive: true });
  }
  document.addEventListener('click', event => {
    if (!inYard || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || new URL(link.href).pathname !== new URL('../index.html', location.href).pathname) return;
    event.preventDefault(); returnHome(link.href);
  });
})();