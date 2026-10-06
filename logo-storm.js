/* Playback variant of setupLogoParticles: the same wordmark tiles, in screen space. */
(() => {
  const music = document.querySelector('#album-player');
  const logo = document.querySelector('#logo-wrap');
  if (!music || !logo) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rebuild = document.querySelector('#logo-rebuild-clip');
  const cooldown = 300000;
  let lastStarted = 0;
  try { lastStarted = Number(sessionStorage.getItem('inteon-storm-last')) || 0; } catch {}
  const signal = (phase, detail = {}) => window.dispatchEvent(new CustomEvent('inteon-storm', {detail: {phase, ...detail}}));
  let layer, timer, animations = [], running = false, debugRun = false;
  const later = (fn, delay) => { timer = setTimeout(fn, delay); };
  const stop = () => {
    clearTimeout(timer);
    animations.forEach(a => a.cancel()); animations = [];
    layer?.remove(); layer = null; running = false;
    debugRun = false;
    logo.classList.remove('is-screen-scattered', 'is-rebuilding');
    rebuild?.replaceChildren();
    document.body.classList.remove('storm-priming');
    signal('end');
  };
  const start = (options = {}) => {
    const force = options.force === true;
    if (running || (!force && music.paused) || document.hidden || reduced.matches) return;
    clearTimeout(timer);
    const remaining = lastStarted + cooldown - Date.now();
    document.body.dataset.stormNextAt = String(lastStarted + cooldown);
    if (!force && remaining > 0) { later(start, remaining); return; }
    if (document.body.classList.contains('is-interlude')) { later(start, 10000); return; }
    lastStarted = Date.now();
    document.body.dataset.stormNextAt = String(lastStarted + cooldown);
    try { sessionStorage.setItem('inteon-storm-last', String(lastStarted)); } catch {}
    running = true;
    debugRun = force;
    document.body.classList.add('storm-priming');
    signal('prepare');
    later(explode, 1000);
  };
  const explode = () => {
    if ((!debugRun && music.paused) || document.hidden || reduced.matches) { stop(); return; }
    document.body.classList.remove('storm-priming');
    const box = logo.getBoundingClientRect();
    signal('burst', {x: box.left + box.width / 2, y: box.top + box.height / 2});
    const cols = innerWidth < 600 ? 12 : 18, rows = innerWidth < 600 ? 4 : 6;
    const count = cols * rows, flight = 4000, hold = 5000, step = 190, returnTime = 1600;
    let landed = 0;
    layer = document.createElement('div');
    const cycleLayer = layer;
    layer.className = 'logo-storm'; layer.setAttribute('aria-hidden', 'true');
    const sky = document.createElement('div'); sky.className = 'logo-storm-sky';
    layer.append(sky);
    const bolts = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bolts.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    bolts.setAttribute('preserveAspectRatio', 'none'); bolts.classList.add('logo-storm-bolts');
    for (let n = 0; n < 3; n++) {
      let x = innerWidth * (.2 + n * .3), y = 0, d = `M ${x} 0`;
      while (y < innerHeight) { x += (Math.random() - .5) * innerWidth * .18; y += innerHeight / 11; d += ` L ${x} ${y}`; }
      const path = document.createElementNS(bolts.namespaceURI, 'path');
      path.setAttribute('d', d); bolts.append(path);
    }
    layer.append(bolts);
    const order = Array.from({length: count}, (_, i) => i);
    for (let i = count - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const tile = document.createElement('span'); tile.className = 'logo-storm-piece';
      const w = box.width / cols, h = box.height / rows;
      const x = box.left + col * w, y = box.top + row * h;
      Object.assign(tile.style, {left: `${x}px`, top: `${y}px`, width: `${w + .3}px`, height: `${h + .3}px`,
        backgroundSize: `${box.width}px ${box.height}px`, backgroundPosition: `${-col * w}px ${-row * h}px`});
      // The field extends beyond the viewport: distant shards can leave the frame.
      const cell = order[i], across = innerWidth < 600 ? 6 : 12;
      const tx = (((cell % across) + .15 + Math.random() * .65) / across * 1.2 - .1) * innerWidth;
      const ty = ((Math.floor(cell / across) + .15 + Math.random() * .65) / Math.ceil(count / across) * 1.2 - .1) * innerHeight;
      const depth = Math.min(1, Math.hypot(tx - x, ty - y) / Math.hypot(innerWidth, innerHeight));
      const scatter = `translate(${tx - x}px, ${ty - y}px) rotate(${Math.random() * 150 - 75}deg) scale(${.85 - depth * .5})`;
      const farOpacity = .55 - depth * .36;
      const returnAt = flight + hold + order[i] * step;
      const duration = returnAt + returnTime;
      const home = 'translate(0, 0) rotate(0deg) scale(1)';
      layer.append(tile);
      const movement = tile.animate([
        {transform: home, opacity: .9, offset: 0, easing: 'cubic-bezier(.16,.72,.12,1)'},
        {transform: scatter, opacity: farOpacity, offset: flight / duration},
        {transform: scatter, opacity: farOpacity, offset: returnAt / duration, easing: 'cubic-bezier(.2,.7,.2,1)'},
        {transform: home, opacity: 1, offset: 1},
      ], {duration, fill: 'forwards'});
      const ink = tile.animate([
        {filter: 'brightness(.8)', offset: 0},
        {filter: 'brightness(.8)', offset: returnAt / duration},
        {filter: 'brightness(0)', offset: (returnAt + returnTime * .65) / duration},
        {filter: 'brightness(0)', offset: 1},
      ], {duration, fill: 'forwards'});
      movement.onfinish = () => {
        if (layer !== cycleLayer) return;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', col / cols); rect.setAttribute('y', row / rows);
        rect.setAttribute('width', 1 / cols + .001); rect.setAttribute('height', 1 / rows + .001);
        rebuild?.append(rect);
        logo.classList.remove('is-screen-scattered');
        tile.remove();
        if (++landed === count) {
          stop();
          if (!music.paused) later(start, Math.max(0, lastStarted + cooldown - Date.now()));
        }
      };
      animations.push(movement, ink);
    }
    document.body.append(layer); logo.classList.add('is-screen-scattered', 'is-rebuilding');
    layer.dataset.phase = 'scattering';
    later(() => {
      layer.dataset.phase = 'storm';
      const flashes = [0, .10, .12, .32, .34, .58, .60, 1];
      animations.push(sky.animate(flashes.map((offset, i) => ({offset, opacity: [0,.92,.55,.96,.5,.94,.55,0][i]})), {duration: 4200}));
      animations.push(bolts.animate(flashes.map((offset, i) => ({offset, opacity: [0,1,0,1,0,1,0,0][i]})), {duration: 4200}));
      later(() => {
        layer.dataset.phase = 'assembling';
        logo.classList.add('is-ink-rebuilt');
      }, hold);
    }, flight);
  };
  music.addEventListener('playing', start);
  window.inteonLogoStorm = {stop, replay: () => { stop(); start({force: true}); }};
  music.addEventListener('pause', stop);
  music.addEventListener('ended', stop);
  music.addEventListener('emptied', stop);
  document.addEventListener('visibilitychange', () => { stop(); if (!document.hidden) start(); });
  window.addEventListener('resize', () => { stop(); if (!music.paused) later(start, 500); });
  reduced.addEventListener('change', () => { stop(); start(); });
})();
