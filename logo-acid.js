(() => {
  const logo = document.querySelector('#logo-wrap');
  const root = document.documentElement;
  const readLevel = () => Math.max(1, Math.min(10, Math.round(Number(root.dataset.graphicsLevel) || (root.dataset.animationQuality === 'low' ? 4 : 8))));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const source = new Image();
  source.src = 'assets/logo-wordmark.svg';
  let foreground = false;
  const motionNow = () => foreground ? performance.now() : (window.inteonHomeEffects?.ambientNow?.() ?? performance.now());
  const motionTimeout = (fn, delay) => !foreground && window.inteonHomeEffects?.setMotionTimeout ? window.inteonHomeEffects.setMotionTimeout(fn, delay) : setTimeout(fn, delay);
  const clearMotionTimeout = id => { if (!foreground && window.inteonHomeEffects?.clearMotionTimeout) window.inteonHomeEffects.clearMotionTimeout(id); else clearTimeout(id); };
  let frame = 0, finish = null, canvas = null, deadline = 0, paintFrame = null;
  const syncMotion = () => {
    if ((window.inteonHomeEffects?.suspended || (!foreground && window.inteonHomeEffects?.ambientPaused))) { cancelAnimationFrame(frame); frame = 0; }
    else if (finish && paintFrame && !frame) frame = requestAnimationFrame(paintFrame);
  };
  const stop = () => {
    clearMotionTimeout(deadline); deadline = 0;
    cancelAnimationFrame(frame); frame = 0;
    paintFrame = null;
    canvas?.remove(); canvas = null;
    logo?.classList.remove('is-acid');
    if (logo) delete logo.dataset.acidPhase;
    const resolve = finish; finish = null;
    window.inteonHomeEffects?.setLogoScattered?.('acid', false);
    window.inteonHomeEffects?.release('acid');
    resolve?.();
  };
  const run = (options = {}) => {
    if (!logo || finish || !source.complete || !source.naturalWidth || document.hidden || reduced.matches ||
        document.body.classList.contains('is-interlude') || document.body.classList.contains('storm-priming') || document.querySelector('.logo-storm')) return null;
    if (window.inteonHomeEffects && !window.inteonHomeEffects.claim('acid')) return null;
    return new Promise(resolve => {
      finish = resolve;
      const mobile=matchMedia('(max-width: 800px), (pointer: coarse)').matches;
      foreground = mobile;
      // A scene keeps its allocation when quality changes; the next one samples it.
      const level = readLevel(), detail = (level - 1) / 9;
      const cols = Math.round((mobile ? 5 : 6) + (mobile ? 7 : 12) * detail);
      const rows = Math.round(2 + (mobile ? 1 : 4) * detail);
      const holesPerTile = Math.round(2 + (mobile ? 3 : 7) * detail), vertices = Math.round(7 + 8 * detail);
      const box = logo.getBoundingClientRect(), pad = mobile ? 44 : 90;
      const w = box.width / cols, h = box.height / rows;
      canvas = document.createElement('canvas');
      canvas.className = 'logo-acid'; canvas.setAttribute('aria-hidden', 'true');
      const dpr = Math.min(devicePixelRatio, 1 + .5 * detail);
      Object.assign(canvas.dataset, {graphicsLevel: String(level), tiles: String(cols * rows), holesPerTile: String(holesPerTile)});
      canvas.width = Math.ceil((box.width + pad * 2) * dpr);
      canvas.height = Math.ceil((box.height + pad * 2) * dpr);
      Object.assign(canvas.style, {left: `${box.left-pad}px`, top: `${box.top-pad}px`, width: `${box.width+pad*2}px`, height: `${box.height+pad*2}px`});
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      // Rasterise the SVG once. Each tile keeps its own tiny pigment texture;
      // moving a tile must not redraw the SVG or its holes on every display frame.
      const atlas = document.createElement('canvas');
      atlas.width = Math.ceil(box.width*dpr); atlas.height = Math.ceil(box.height*dpr);
      const atlasInk = atlas.getContext('2d');
      atlasInk.drawImage(source,0,0,atlas.width,atlas.height);
      // Match the live wordmark's pigment instead of introducing white shards.
      const pigment = atlasInk.createLinearGradient(0,0,atlas.width,atlas.height);
      document.querySelectorAll('#logo-core-gradient stop').forEach(stop => {
        pigment.addColorStop(Number(stop.getAttribute('offset')), stop.getAttribute('stop-color'));
      });
      atlasInk.globalCompositeOperation = 'source-in';
      const darkInk = Number(getComputedStyle(document.documentElement).getPropertyValue('--logo-brightness')) === 0;
      atlasInk.fillStyle = darkInk ? '#18202a' : pigment; atlasInk.fillRect(0,0,atlas.width,atlas.height);
      const diagonal = Math.hypot(w,h);
      const makeTexture = () => {
        const image=document.createElement('canvas');
        image.width=Math.ceil(w*dpr);image.height=Math.ceil(h*dpr);
        return {image,ink:image.getContext('2d'),radius:-1,tint:-1};
      };
      const tiles = Array.from({length: cols*rows}, (_, i) => ({
        x: i % cols * w, y: Math.floor(i/cols)*h, texture:makeTexture(),
        dx: (Math.random()-.5)*(mobile?42:90), dy: (Math.random()-.5)*(mobile?30:58),
        rotation: (Math.random()-.5)*.45, delay: Math.random()*.22,
        holes: Array.from({length: holesPerTile}, () => {
          const x=Math.random()*w,y=Math.random()*h,path=new Path2D();
          for(let k=0;k<vertices;k++){
            const angle=k/(vertices-1)*Math.PI*2,r=1+.18*Math.sin(k*2.7+x);
            if(!k)path.moveTo(Math.cos(angle)*r,Math.sin(angle)*r);else path.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);
          }
          path.closePath();
          const size=.65+Math.random()*.7;
          return {x,y,size,path,cover:Math.hypot(Math.max(x,w-x),Math.max(y,h-y))/(size*.78)};
        }),
      }));
      document.body.append(canvas);
      window.inteonHomeEffects?.setLogoScattered?.('acid', true);
      const started = motionNow() - (options.preview ? 700 : 0);
      deadline = motionTimeout(stop, 11850);
      let previousPhase='',previousReturn='0',shown=false;
      const paint = () => {
        frame = 0;
        if (!finish || (window.inteonHomeEffects?.suspended || (!foreground && window.inteonHomeEffects?.ambientPaused))) return;
        if (!shown) { logo.classList.add('is-acid'); shown = true; }
        const elapsed = motionNow()-started;
        if (elapsed >= 11600) { stop(); return; }
        frame = requestAnimationFrame(paint);
        const spread = 1-Math.pow(1-Math.min(1, elapsed/2300), 3);
        const dissolve = Math.max(0, (elapsed-3100)/5900);
        const returnOpacity = Math.max(0, Math.min(1, (elapsed-9800)/1800));
        const opacity=returnOpacity.toFixed(3);
        if(opacity!==previousReturn){logo.style.setProperty('--acid-return',opacity);previousReturn=opacity;}
        const phase=elapsed<2300?'scatter':elapsed<3100?'hold':elapsed<9800?'dissolve':'return';
        const samePhase=phase===previousPhase;
        if(!samePhase){logo.dataset.acidPhase=phase;previousPhase=phase;}
        if(samePhase&&(phase==='hold'||phase==='return'))return;
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,box.width+pad*2,box.height+pad*2);
        if(elapsed>=9800)return;
        ctx.globalAlpha=1;
        for (const tile of tiles) {
          const erosion = Math.max(0, (dissolve-tile.delay)/(1-tile.delay));
          const radius=erosion*erosion*diagonal;
          if(tile.holes.some(hole=>radius>=hole.cover))continue;
          const texture=tile.texture,tint=erosion>0?Math.min(.28,erosion*.28):0;
          // Reuse pigment while its contour moves less than half a physical
          // pixel; tile transforms still follow every display refresh.
          if(texture.radius<0 || Math.abs(radius-texture.radius)*dpr>=.45 || Math.abs(tint-texture.tint)>=.015) {
            const ink=texture.ink;
            ink.setTransform(dpr,0,0,dpr,0,0);ink.clearRect(0,0,w+1,h+1);
            ink.globalCompositeOperation='source-over';
            ink.drawImage(atlas,tile.x/box.width*atlas.width,tile.y/box.height*atlas.height,
              w/box.width*atlas.width,h/box.height*atlas.height,0,0,w,h);
            ink.globalCompositeOperation='source-atop';
            ink.fillStyle=tint?`rgba(186,196,139,${tint})`:'rgba(196,188,160,.12)';
            ink.fillRect(0,0,w,h);
            ink.globalCompositeOperation='destination-out';
            if(radius>0)for(const hole of tile.holes){
              const scale=radius*hole.size*dpr;
              ink.setTransform(scale,0,0,scale,hole.x*dpr,hole.y*dpr);
              ink.fill(hole.path);
            }
            texture.radius=radius;texture.tint=tint;
          }
          const angle=tile.rotation*spread,c=Math.cos(angle)*dpr,s=Math.sin(angle)*dpr;
          ctx.setTransform(c,s,-s,c,
            (pad+tile.x+w/2+tile.dx*spread)*dpr,(pad+tile.y+h/2+tile.dy*spread+erosion*8)*dpr);
          ctx.drawImage(texture.image,-w/2,-h/2,w,h);
        }
      };
      paintFrame = paint;
      logo.style.setProperty('--acid-return', '0');
      paint();
    });
  };
  window.inteonLogoAcid = {run, stop, get active() { return Boolean(finish); }};
  document.addEventListener('visibilitychange', stop);
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('inteon-storm', event => { if (event.detail.phase === 'prepare') stop(); });
  window.addEventListener('inteon-interlude', () => { if (document.body.classList.contains('is-interlude')) stop(); });
  reduced.addEventListener('change', stop);
  window.addEventListener('inteon-ambient-change', syncMotion);
  window.addEventListener('inteon-effects-change', () => { if (window.inteonHomeEffects?.suspended) stop(); });
})();
