/* Step through a quiet doorway into the yard; retain the existing homeward flight. */
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
    const wasYardArrival = root.dataset.portalArrival === 'yard';
    delete root.dataset.portalArrival; delete root.dataset.portalPhase;
    if (wasYardArrival) window.dispatchEvent(new Event('inteon-yard-entered'));
    root.style.removeProperty('--portal-holes');
    root.style.removeProperty('--portal-exit-fade');
  };
  const prepareArrival = () => {
    const data = read(), direction = inYard ? 'yard' : 'home';
    if (!data || data.to !== direction || Date.now() - data.at > 120000 || reduced.matches) return null;
    root.dataset.portalArrival = direction;
    if (direction === 'home') root.style.setProperty('--portal-aspect', Math.max(innerWidth / innerHeight, innerHeight / innerWidth));
    if (direction === 'yard') root.style.setProperty('--portal-exit-fade', `${Math.max(0, Math.min(1350, (data.deadline || Date.now() + 1350) - Date.now()))}ms`);
    if (direction === 'yard' && data.mask?.startsWith('data:image/png;base64,')) root.style.setProperty('--portal-holes', `url("${data.mask}")`);
    return data;
  };
  const arrival = prepareArrival();
  // Parser-blocking in both heads: this listener exists before first paint.
  window.addEventListener('pagereveal', event => {
    const data = prepareArrival();
    if (inYard && data?.poster) { event.viewTransition?.ready.catch(() => {}); event.viewTransition?.skipTransition(); return; }
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
    if (!('onpagereveal' in window) && !(inYard && arrival?.poster)) { clear(); cleanup(); }
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
  const delay = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  const posterUrl = () => {
    const ratio = innerWidth / innerHeight;
    const variant = ratio < .7 ? 'phone' : ratio < 1 ? 'tablet' : ratio > 1.95 ? 'landscape' : ratio > 1.7 ? 'hd' : 'wide';
    return new URL(`yard/assets/portal-${variant}.jpg`, new URL(inYard ? '../' : './', location.href)).href;
  };
  // Warm the actual module graph and one lighting texture, without executing a
  // second yard, consuming a walk, starting audio or rendering a live preview.
  const warmYard = async url => {
    const base = new URL(url, location.href), seen = new Set();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    const get = async url => { const r = await fetch(url, {signal:controller.signal}); if (!r.ok) throw Error(r.status); return r; };
    const module = async url => {
      if (seen.has(url)) return; seen.add(url);
      const source = await (await get(url)).text();
      const imports = [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)];
      await Promise.allSettled(imports.map(m => module(new URL(m[1],url).href)));
    };
    try {
      const html = await (await get(base)).text();
      const main = html.match(/src=["']([^"']*main\.js[^"']*)/);
      const shadowBase = new URL(`data/shadows/${matchMedia('(max-width:800px), (pointer:coarse)').matches?'mobile/':''}`,base);
      await Promise.allSettled([
        main ? module(new URL(main[1],base).href) : Promise.resolve(),
        ...[...html.matchAll(/href=["']([^"']+\.css[^"']*)/g)].map(m=>get(new URL(m[1],base))),
        (async()=>{
          const manifest = await (await get(new URL('manifest.json',shadowBase))).json();
          let next = 0; try { next = Number(localStorage.getItem('inteon.yard.lighting.next.v1')) || 0; } catch {}
          const preset = manifest.presets[next % manifest.presets.length];
          await get(new URL(preset.file,shadowBase)).then(r=>r.arrayBuffer());
        })()
      ]);
    } catch {} finally { clearTimeout(timeout); }
  };
  const makePoster = poster => {
    const node = document.createElement('div'); node.className='portal-doorway'; node.setAttribute('aria-hidden','true');
    node.style.backgroundImage = `url("${poster}")`; document.body.append(node); return node;
  };
  const finishArrival = async () => {
    if (!arrival?.poster || !inYard) return;
    busy = true; root.setAttribute('aria-busy','true'); root.dataset.portalPhase='loading-yard';
    layer = makePoster(arrival.poster);
    const began = performance.now();
    while ((!root.dataset.yardReady || window.__yard?.scene.userData.bakedLightingStatus === 'loading') && performance.now()-began < 12000 && !document.body.classList.contains('yard-unavailable')) await delay(60);
    // Keep the ready scene hidden until both the minimum duration and startup finish.
    await delay(1000 - (Date.now()-arrival.at));
    if (!root.dataset.yardReady) { clear(); cleanup(); return; }
    root.dataset.portalPhase='entering-yard';
    const fade = layer.animate([{opacity:1},{opacity:0}],{duration:200,easing:'ease-out',fill:'forwards'});
    objectFlights.push(fade); try { await fade.finished; } catch {}
    clear(); cleanup();
  };
  if (inYard && arrival?.poster) {
    root.style.setProperty('--portal-poster', `url("${arrival.poster}")`);
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',finishArrival,{once:true}); else finishArrival();
  }
  const exit = async url => {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true');
    window.inteonLogoStorm?.stop(); window.inteonLogoAcid?.stop(); window.inteonAtmosphere?.stop();
    if (reduced.matches) { navigate(url); return; }
    const at = Date.now(), poster = posterUrl(), loading = warmYard(url);
    const image = new Image(); image.src=poster;
    await Promise.race([image.decode().catch(()=>{}), delay(800)]);
    const button = document.querySelector('#street-link');
    const box = button.getBoundingClientRect();
    const inset = [box.top, innerWidth-box.right, innerHeight-box.bottom, box.left].map(n=>Math.max(0,n));
    layer = makePoster(poster);
    // A small blurred alpha mask feathers the reveal by roughly 90–150 CSS px.
    // Only this mask is rasterised; the yard picture is the existing static JPEG.
    const mask=document.createElement('canvas');
    const ratio=Math.min(1,384/Math.max(innerWidth,innerHeight));
    mask.width=Math.ceil(innerWidth*ratio);mask.height=Math.ceil(innerHeight*ratio);
    const ctx=mask.getContext('2d');
    const paintMask=scale=>{
      const finish=1-Math.min(1,scale/.12), feather=26*(1-finish*.7);
      const pad=finish*feather*4;
      ctx.clearRect(0,0,mask.width,mask.height);ctx.filter=`blur(${feather}px)`;ctx.fillStyle='#fff';
      ctx.beginPath();ctx.roundRect(inset[3]*scale*ratio-pad,inset[0]*scale*ratio-pad,
        (innerWidth-(inset[1]+inset[3])*scale)*ratio+pad*2,
        (innerHeight-(inset[0]+inset[2])*scale)*ratio+pad*2,Math.max(2,18*(1-scale)));ctx.fill();
      const url=`url("${mask.toDataURL()}")`;layer.style.maskImage=url;layer.style.webkitMaskImage=url;
    };
    const code=document.createElement('div');code.className='portal-code';layer.append(code);
    const alphabet='01アイウエカキクケコサシスセソ∴⊹';
    for(let i=0;i<(innerWidth<600?10:22);i++){
      const column=document.createElement('span');column.textContent=Array.from({length:15},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('\n');
      column.style.cssText=`left:${i*100/(innerWidth<600?10:22)}%;--rain-time:${1.2+Math.random()*1.3}s;--rain-delay:${-Math.random()*2}s`;code.append(column);
    }
    paintMask(1);
    document.body.classList.add('portal-leaving'); root.dataset.portalPhase='doorway';
    const run = (from,to,duration) => new Promise(resolve=>{
      const start=performance.now();let lastPaint=-Infinity;
      const tick=now=>{
        const t=Math.min(1,(now-start)/duration),ease=t*t*(3-2*t),scale=from+(to-from)*ease;
        if(now-lastPaint>=32 || t===1){paintMask(scale);lastPaint=now;code.style.opacity=String(Math.min(1,scale/.15)*.65);}
        if(t<1)frame=requestAnimationFrame(tick);else resolve();
      };
      frame=requestAnimationFrame(tick);
    });
    try {
      await run(1,.12,700);
      root.dataset.portalPhase='loading-resources';
      await loading;
      root.dataset.portalPhase='opening-yard';
      await run(.12,0,Math.max(300,1000-(Date.now()-at)));
    } catch { cleanup(); return; }
    layer.style.maskImage='none';layer.style.webkitMaskImage='none';
    save({to:'yard',at,poster}); navigate(url);
  };
  window.inteonPortal = { exit, returnHome, get busy() { return busy; } };
  document.addEventListener('click', event => {
    if (!inYard || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || new URL(link.href).pathname !== new URL('../index.html', location.href).pathname) return;
    event.preventDefault(); returnHome(link.href);
  });
})();
