(() => {
  const states = new Map();
  const slots = new Map();
  const visible = new Set();
  const near = new Set();
  const preloads = new Map();
  const queue = [];
  let loading = 0, upgradeTimer = 0;
  const connection = navigator.connection;
  const constrained = () => connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')
    || (window.inteonGraphicsQuality?.level || 3) < 3;
  const pump = () => {
    if (document.hidden) return;
    while (loading < 2 && queue.length) {
      const job = queue.shift(); loading++;
      const done = async ok => {
        if (ok) { try { await job.image.decode?.(); } catch {} }
        job.ready = ok; loading--; job.resolve(ok); pump();
      };
      job.image.onload = () => done(true);
      job.image.onerror = () => {preloads.delete(job.url); done(false);};
      job.image.src = job.url;
    }
  };
  const preload = (url, urgent = false) => {
    if (preloads.has(url)) return preloads.get(url);
    const image = new Image(); image.decoding = 'async';
    image.fetchPriority = urgent ? 'auto' : 'low';
    const job = {url, image, ready: false};
    job.promise = new Promise(resolve => {job.resolve = resolve;});
    preloads.set(url, job); urgent ? queue.unshift(job) : queue.push(job); pump();
    return job;
  };
  const upgradeDelay = () => constrained() ? 8000 : 1200;
  const upgradeVisible = () => {
    upgradeTimer = 0;
    if (document.hidden) return;
    for (const host of near) {const slot = slots.get(host); if (slot) paint(host, slot, true);}
  };
  const scheduleUpgrade = () => { if (!upgradeTimer) upgradeTimer = setTimeout(upgradeVisible, upgradeDelay()); };

  // Titles still own cap-height typography. Also observe host size: this catches
  // responsive cap changes without doing layout reads on the rotation timer.
  const titleHosts = new Map();
  const titleObserver = new ResizeObserver(entries => {
    for (const { target } of entries) {
      const host = titleHosts.get(target);
      if (host?.isConnected) {
        host.parentElement.style.setProperty('--cover-font', getComputedStyle(target).font);
      }
      const artwork = host || target;
      const slot = slots.get(artwork);
      if (slot) paint(artwork, slot);
    }
  });
  // Near-visible rows receive src explicitly; hidden active-player artwork never
  // gets an eager request. Intersection thresholds govern viewing time separately.
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        near.add(entry.target);
        const title = slots.get(entry.target)?.title;
        if (title) {titleHosts.set(title, entry.target); titleObserver.observe(title);}
        titleObserver.observe(entry.target);
        const slot = slots.get(entry.target);
        if (slot) paint(entry.target, slot);
      } else {
        near.delete(entry.target); titleObserver.unobserve(entry.target);
        const title = slots.get(entry.target)?.title;
        if (title) {titleObserver.unobserve(title); titleHosts.delete(title);}
      }
    }
  }, { rootMargin: '120px', threshold: 0 });
  const viewingObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= .65) visible.add(entry.target);
      else visible.delete(entry.target);
    }
  }, { threshold: [0, .65] });
  let previous = performance.now();
  let timer = 0;

  const resource = (slot, index) => {
    const original = slot.state.covers[index];
    const candidates = slot.renditions[original];
    if (!candidates?.length) return original; // Compatibility for external/old manifests.
    const pixels = slot.pixels || 16;
    return (candidates.find(candidate => candidate.width >= pixels) || candidates[candidates.length - 1]).url;
  };
  const paint = (host, slot, upgrade = false) => {
    if (!near.has(host) || document.hidden) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    slot.pixels = Math.ceil(Math.max(rect.width, rect.height) * (window.devicePixelRatio || 1));
    const index = slot.state.index, original = slot.state.covers[index];
    const low = slot.renditions[original]?.[0]?.url || resource(slot, index);
    const final = resource(slot, index);
    const url = upgrade || slot.displayIndex === index && slot.high ? final : low;
    if (slot.url === url && slot.image.getAttribute('src') === url) return;
    slot.url = url;
    preload(url, !upgrade).promise.then(ok => {
      if (!ok || slot.url !== url || !host.isConnected || !near.has(host)) return;
      // Decode off-DOM, retain the old image until the replacement is ready.
      slot.image.src = url; slot.displayIndex = index; slot.high = url === final;
      host.dataset.coverIndex = String(index);
      host.dataset.coverStage = slot.high ? 'sharp' : 'preview';
      if (!slot.high) scheduleUpgrade();
    });
  };
  const preloadNext = slot => {
    const index = (slot.state.index + 1) % slot.state.covers.length;
    const original = slot.state.covers[index];
    return preload(slot.renditions[original]?.[0]?.url || resource(slot, index));
  };
  const detach = host => {
    const title = slots.get(host)?.title;
    if (title) { titleObserver.unobserve(title); titleHosts.delete(title); }
    titleObserver.unobserve(host);
    observer.unobserve(host);
    viewingObserver.unobserve(host);
    visible.delete(host);
    near.delete(host);
    slots.delete(host);
  };
  const tick = () => {
    const now = performance.now();
    // Never fast-forward artwork after background throttling or a sleeping device.
    const elapsed = Math.min(500, now - previous);
    previous = now;
    const viewing = new Map();
    for (const host of visible) {
      const slot = slots.get(host);
      if (!slot) continue;
      if (!host.isConnected) { detach(host); continue; }
      if (!document.hidden && visible.has(host) && slot.image.complete && slot.image.naturalWidth) {
        if (!viewing.has(slot.state)) viewing.set(slot.state, []);
        viewing.get(slot.state).push(slot);
      }
    }
    for (const [state, viewers] of viewing) {
      if (state.covers.length < 2) continue;
      const nextImages = viewers.map(preloadNext);
      state.elapsed += elapsed;
      if (state.elapsed >= state.dwell && nextImages.every(job => job.ready)) {
        state.index = (state.index + 1) % state.covers.length;
        state.elapsed = 0;
        for (const host of near) {const slot = slots.get(host); if (slot?.state === state) paint(host, slot);}
        viewers.forEach(preloadNext);
      }
    }
    if (!slots.size) { clearInterval(timer); timer = 0; }
  };
  const attach = (host, track, title) => {
    if (!host) return false;
    if (slots.has(host)) detach(host);
    const covers = [...new Set((track?.covers?.length ? track.covers : [track?.cover])
      .filter(url => typeof url === 'string' && url.startsWith('assets/')))];
    if (!covers.length) return false;
    const key = JSON.stringify(covers);
    if (!states.has(key)) states.set(key, {
      covers, index: 0, elapsed: 0,
      // All variants get a turn in roughly a minute of actual viewing.
      dwell: Math.max(3500, Math.min(7000, 56000 / covers.length)),
    });
    const image = document.createElement('img');
    image.className = 'cover-image';
    image.alt = '';
    image.width = image.height = 16;
    // IO is the single loading gate (native lazy loading can delay near rows).
    image.decoding = 'async';
    host.replaceChildren(image);
    host.classList.add('has-cover');
    const slot = { image, state: states.get(key), title, renditions: track.coverRenditions || {} };
    slots.set(host, slot);
    observer.observe(host);
    viewingObserver.observe(host);
    if (!timer && !document.hidden) { previous = performance.now(); timer = setInterval(tick, 250); }
    return true;
  };
  const select = track => {
    const copy = document.querySelector('#active-player .active-track-copy');
    if (!copy) return;
    let host = copy.querySelector('.active-cover');
    if (host) { detach(host); host.remove(); }
    copy.classList.remove('has-active-cover');
    if (!track?.cover && !track?.covers?.length) return;
    host = document.createElement('span');
    host.className = 'active-cover';
    host.setAttribute('aria-hidden', 'true');
    copy.prepend(host);
    if (attach(host, track, copy.querySelector('.now-playing-title'))) copy.classList.add('has-active-cover');
    else host.remove();
  };
  const refresh = () => { for (const host of near) {const slot = slots.get(host); if (slot) paint(host, slot);} scheduleUpgrade(); };
  window.addEventListener?.('resize', refresh);
  // DPR can change when moving between monitors without changing CSS geometry.
  const watchDpr = () => {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener?.('change', () => { refresh(); watchDpr(); }, { once: true });
  };
  watchDpr();
  document.addEventListener('visibilitychange', () => {
    previous = performance.now(); clearInterval(timer); timer = 0;
    clearTimeout(upgradeTimer); upgradeTimer = 0;
    if (!document.hidden) {pump(); refresh(); if (slots.size) timer = setInterval(tick, 250);}
  });
  window.inteonCovers = { attach, select };
})();
