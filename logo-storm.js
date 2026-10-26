/* Playback variant of setupLogoParticles: the same wordmark tiles, in screen space. */
(() => {
  const music = document.querySelector('#album-player');
  const logo = document.querySelector('#logo-wrap');
  if (!music || !logo) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const readLevel = () => Math.max(1, Math.min(10, Math.round(Number(root.dataset.graphicsLevel) || (root.dataset.animationQuality === 'low' ? 4 : 8))));
  const rebuild = document.querySelector('#logo-rebuild-clip');
  const cooldown = 300000;
  let lastStarted = 0;
  try { lastStarted = Number(sessionStorage.getItem('inteon-storm-last')) || 0; } catch {}
  const signal = (phase, detail = {}) => window.dispatchEvent(new CustomEvent('inteon-storm', {detail: {phase, ...detail}}));
  const motionTimeout = (fn, delay) => window.inteonHomeEffects?.setMotionTimeout ? window.inteonHomeEffects.setMotionTimeout(fn, delay) : setTimeout(fn, delay);
  const clearMotionTimeout = id => { if (window.inteonHomeEffects?.clearMotionTimeout) window.inteonHomeEffects.clearMotionTimeout(id); else clearTimeout(id); };
  let shardLayer, layer, timer, stageTimer, deadline, animations = [], running = false, debugRun = false;
  const heldAnimations = new Set();
  const syncMotion = () => {
    for (const animation of animations) {
      if (window.inteonHomeEffects?.ambientPaused) {
        if (animation.playState === 'running') { animation.pause(); heldAnimations.add(animation); }
      } else if (heldAnimations.delete(animation) && animation.playState === 'paused') animation.play();
    }
  };
  const trackAnimation = animation => {
    animations.push(animation);
    if (window.inteonHomeEffects?.ambientPaused && animation.playState === 'running') { animation.pause(); heldAnimations.add(animation); }
    return animation;
  };
  const later = (fn, delay) => { clearTimeout(timer); timer = setTimeout(fn, delay); };
  const sceneLater = (fn, delay) => { clearMotionTimeout(stageTimer); stageTimer = motionTimeout(() => { stageTimer = 0; fn(); }, delay); };
  const stop = () => {
    clearMotionTimeout(deadline); deadline = 0;
    clearMotionTimeout(stageTimer); stageTimer = 0;
    clearTimeout(timer);
    animations.forEach(a => a.cancel()); animations = []; heldAnimations.clear();
    shardLayer?.remove();shardLayer=null;
    layer?.remove(); layer = null; running = false;
    debugRun = false;
    logo.classList.remove('is-screen-scattered', 'is-rebuilding', 'is-ink-rebuilt');
    rebuild?.replaceChildren();
    document.body.classList.remove('storm-priming');
    window.inteonHomeEffects?.setLogoScattered?.('storm', false);
    signal('end');
    window.inteonHomeEffects?.release('storm');
  };
  const start = (options = {}) => {
    const force = options.force === true;
    if (matchMedia('(max-width: 800px), (pointer: coarse)').matches || running || (!force && music.paused) || document.hidden || reduced.matches) return;
    clearTimeout(timer);
    const remaining = lastStarted + cooldown - Date.now();
    document.body.dataset.stormNextAt = String(lastStarted + cooldown);
    if (!force && remaining > 0) { later(start, remaining); return; }
    if (document.body.classList.contains('is-interlude')) { later(start, 10000); return; }
    if (window.inteonHomeEffects && !window.inteonHomeEffects.claim('storm')) { later(start, 1000); return; }
    lastStarted = Date.now();
    document.body.dataset.stormNextAt = String(lastStarted + cooldown);
    try { sessionStorage.setItem('inteon-storm-last', String(lastStarted)); } catch {}
    running = true;
    debugRun = force;
    document.body.classList.add('storm-priming');
    signal('prepare');
    if (force) explode(); else sceneLater(explode, 1000);
  };
  const explode = () => {
    if ((!debugRun && music.paused) || document.hidden || reduced.matches) { stop(); return; }
    document.body.classList.remove('storm-priming');
    const box = logo.getBoundingClientRect();
    window.inteonHomeEffects?.setLogoScattered?.('storm', true);
    signal('burst', {x: box.left + box.width / 2, y: box.top + box.height / 2});
    const level = readLevel(), detail = (level - 1) / 9;
    const fullCols = innerWidth < 600 ? 12 : 18, fullRows = innerWidth < 600 ? 4 : 6;
    const cols = Math.round(6 + (fullCols - 6) * detail), rows = Math.round(2 + (fullRows - 2) * detail);
    const count = cols * rows, flight = debugRun ? 650 : 4000, hold = 5000, returnTime = 1600;
    // Fewer pieces retain the same total assembly span, not a shortened scene.
    const staggerSpan = (fullCols * fullRows - 1) * 190, step = staggerSpan / (count - 1);
    const channels = Math.round(1 + 2 * detail), branches = Math.round(1 + 2 * detail), boltDepth = Math.round(3 + 3 * detail);
    // Finish even if a compositor animation never reports its completion.
    deadline = motionTimeout(stop, flight + hold + staggerSpan + 190 + returnTime + 1500);
    let landed = 0;
    layer = document.createElement('div');
    const cycleLayer = layer;
    layer.className = 'logo-storm'; layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.dataset, {graphicsLevel: String(level), pieces: String(count)});
    const sky = document.createElement('div'); sky.className = 'logo-storm-sky';
    layer.append(sky);
    const bolts = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bolts.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    bolts.setAttribute('preserveAspectRatio', 'none'); bolts.classList.add('logo-storm-bolts');
    bolts.style.overflow = 'hidden';
    const lightning = (x0,y0,x1,y1,spread,depth=boltDepth) => {
      if(!depth)return [[x0,y0],[x1,y1]];
      const dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy)||1,jitter=(Math.random()-.5)*spread;
      const mx=(x0+x1)/2-dy/length*jitter,my=(y0+y1)/2+dx/length*jitter;
      return [...lightning(x0,y0,mx,my,spread*.55,depth-1).slice(0,-1),...lightning(mx,my,x1,y1,spread*.55,depth-1)];
    };
    const stroke = (points,width,opacity,core=false) => {
      const path=document.createElementNS(bolts.namespaceURI,'path');
      path.setAttribute('d',points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '));
      path.style.strokeWidth=String(width);path.style.opacity=String(opacity);path.style.stroke=core?'#f3f8ff':'#9ebbdc';
      path.style.strokeLinecap='round';path.style.strokeLinejoin='round';bolts.append(path);
    };
    for(let n=0;n<channels;n++){
      // The viewport crops the middle third of a much larger storm.
      // Main channels start and end off-screen, never visibly stopping in the room.
      const x=innerWidth*(channels === 1 ? .5 : .05+n*.9/(channels-1));
      const points=lightning(x,-innerHeight,x+innerWidth*(Math.random()-.5)*.75,innerHeight*2,innerWidth*.57);
      stroke(points,5,.2);stroke(points,1.4,.95,true);
      for(const fraction of [17/64,31/64,43/64].slice(0,branches)){
        const i=Math.round((points.length-1)*fraction);
        const [sx,sy]=points[i],side=(n+i)%2?1:-1;
        const branch=lightning(sx,sy,sx+side*innerWidth*(.3+Math.random()*.35),sy+innerHeight*.54,innerWidth*.165,Math.round(2+2*detail));
        stroke(branch,.7,.55,true);
      }
    }
    layer.append(bolts);
    shardLayer=document.createElement('div');shardLayer.className='storm-inversion-shards';document.body.append(shardLayer);
    const order = Array.from({length: count}, (_, i) => i);
    for (let i = count - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const tile = document.createElement('span'); tile.className = 'logo-storm-piece';
      const w = box.width / cols, h = box.height / rows;
      const x = box.left + col * w, y = box.top + row * h;
      Object.assign(tile.style, {left: `${x}px`, top: `${y}px`, width: `${w + .3}px`, height: `${h + .3}px`,
        backgroundSize: `${box.width}px ${box.height}px`, backgroundPosition: `${-col * w}px ${-row * h}px`, filter: 'brightness(0) invert(1)'});
      // The field extends beyond the viewport: distant shards can leave the frame.
      const cell = order[i], across = Math.min(cols, innerWidth < 600 ? 6 : 12);
      const tx = (((cell % across) + .15 + Math.random() * .65) / across * 1.2 - .1) * innerWidth;
      const ty = ((Math.floor(cell / across) + .15 + Math.random() * .65) / Math.ceil(count / across) * 1.2 - .1) * innerHeight;
      const depth = Math.min(1, Math.hypot(tx - x, ty - y) / Math.hypot(innerWidth, innerHeight));
      const scatter = `translate(${tx - x}px, ${ty - y}px) rotate(${Math.random() * 150 - 75}deg) scale(${1 - depth * .4})`;
      const farOpacity = .98 - depth * .04;
      const returnAt = flight + hold + order[i] * step;
      const duration = returnAt + returnTime;
      const home = 'translate(0, 0) rotate(0deg) scale(1)';
      shardLayer.append(tile);
      const movement = tile.animate([
        {transform: home, opacity: 1, offset: 0, easing: 'cubic-bezier(.16,.72,.12,1)'},
        {transform: scatter, opacity: farOpacity, offset: flight / duration},
        {transform: scatter, opacity: farOpacity, offset: returnAt / duration, easing: 'cubic-bezier(.2,.7,.2,1)'},
        {transform: home, opacity: 1, offset: 1},
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
      trackAnimation(movement);
    }
    document.body.append(layer); logo.classList.add('is-screen-scattered', 'is-rebuilding', 'is-ink-rebuilt');
    layer.dataset.phase = 'scattering';
    sceneLater(() => {
      layer.dataset.phase = 'storm';
      const flashes = [0, .10, .12, .32, .34, .58, .60, 1];
      trackAnimation(sky.animate(flashes.map((offset, i) => ({offset, opacity: [0,.92,.55,.96,.5,.94,.55,0][i]})), {duration: 4200}));
      trackAnimation(bolts.animate(flashes.map((offset, i) => ({offset, opacity: [0,1,0,1,0,1,0,0][i]})), {duration: 4200}));
      sceneLater(() => {
        layer.dataset.phase = 'assembling';
        // Returning tiles keep their pigment until the original contour takes over.
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
  window.addEventListener('inteon-ambient-change', syncMotion);
  window.addEventListener('inteon-effects-change', () => {
    const effects = window.inteonHomeEffects;
    if (effects?.suspended) stop();
    else if (!effects?.active && !music.paused && !running) later(start, Math.max(0, lastStarted + cooldown - Date.now()));
  });
  window.addEventListener('pagehide', stop);
})();
