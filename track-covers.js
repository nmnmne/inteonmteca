(() => {
  const states = new Map();
  const slots = new Map();
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= .65) visible.add(entry.target);
      else visible.delete(entry.target);
    }
  }, { threshold: [0, .65] });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let previous = performance.now();
  let timer = 0;

  const paint = (host, slot) => {
    const url = slot.state.covers[slot.state.index];
    if (slot.url === url) return;
    slot.url = url;
    slot.image.src = url;
    host.dataset.coverIndex = String(slot.state.index);
  };
  const preloadNext = state => {
    const url = state.covers[(state.index + 1) % state.covers.length];
    if (state.next?.getAttribute('src') === url) return;
    state.next = new Image();
    state.next.src = url;
  };
  const detach = host => {
    observer.unobserve(host);
    visible.delete(host);
    slots.delete(host);
  };
  const tick = () => {
    const now = performance.now();
    // Never fast-forward artwork after background throttling or a sleeping device.
    const elapsed = Math.min(500, now - previous);
    previous = now;
    const viewing = new Set();
    for (const [host, slot] of slots) {
      if (!host.isConnected) { detach(host); continue; }
      if (!document.hidden && visible.has(host) && slot.image.complete && slot.image.naturalWidth) {
        viewing.add(slot.state);
      }
    }
    for (const state of viewing) {
      if (state.covers.length < 2) continue;
      preloadNext(state);
      state.elapsed += elapsed;
      if (state.elapsed >= state.dwell && state.next.complete && state.next.naturalWidth) {
        state.index = (state.index + 1) % state.covers.length;
        state.elapsed = 0;
        for (const [host, slot] of slots) if (slot.state === state) paint(host, slot);
        preloadNext(state);
      }
    }
    if (!slots.size) { clearInterval(timer); timer = 0; }
  };
  const attach = (host, track) => {
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
    image.width = image.height = 960;
    image.loading = host.classList.contains('active-cover') ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.addEventListener('load', () => {
      if (!reducedMotion.matches) image.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 450 });
    });
    host.replaceChildren(image);
    host.classList.add('has-cover');
    const slot = { image, state: states.get(key) };
    slots.set(host, slot);
    paint(host, slot);
    observer.observe(host);
    if (!timer) { previous = performance.now(); timer = setInterval(tick, 250); }
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
    if (attach(host, track)) copy.classList.add('has-active-cover');
    else host.remove();
  };
  document.addEventListener('visibilitychange', () => { previous = performance.now(); });
  window.inteonCovers = { attach, select };
})();
