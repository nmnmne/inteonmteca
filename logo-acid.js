(() => {
  const logo = document.querySelector('#logo-wrap');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const source = new Image();
  source.src = 'assets/logo-wordmark.svg';
  let frame = 0, finish = null, canvas = null, deadline = 0;
  const stop = () => {
    clearTimeout(deadline); deadline = 0;
    cancelAnimationFrame(frame); frame = 0;
    canvas?.remove(); canvas = null;
    logo?.classList.remove('is-acid');
    if (logo) delete logo.dataset.acidPhase;
    const resolve = finish; finish = null;
    window.inteonHomeEffects?.release('acid');
    resolve?.();
  };
  const run = () => {
    if (!logo || finish || !source.complete || !source.naturalWidth || document.hidden || reduced.matches ||
        document.body.classList.contains('is-interlude') || document.body.classList.contains('storm-priming') || document.querySelector('.logo-storm')) return null;
    if (window.inteonHomeEffects && !window.inteonHomeEffects.claim('acid')) return null;
    return new Promise(resolve => {
      finish = resolve;
      deadline = setTimeout(stop, 11850);
      const box = logo.getBoundingClientRect(), pad = 90, cols = 18, rows = 6;
      const w = box.width / cols, h = box.height / rows;
      canvas = document.createElement('canvas');
      canvas.className = 'logo-acid'; canvas.setAttribute('aria-hidden', 'true');
      const dpr = Math.min(devicePixelRatio, document.documentElement.dataset.animationQuality === 'low' ? 1 : 1.5);
      canvas.width = Math.ceil((box.width + pad * 2) * dpr);
      canvas.height = Math.ceil((box.height + pad * 2) * dpr);
      Object.assign(canvas.style, {left: `${box.left-pad}px`, top: `${box.top-pad}px`, width: `${box.width+pad*2}px`, height: `${box.height+pad*2}px`});
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      // Rasterise the SVG once. Each tile keeps its own tiny pigment texture;
      // moving a tile must not redraw the SVG or its holes on every display frame.
      const atlas = document.createElement('canvas');
      atlas.width = Math.ceil(box.width*dpr); atlas.height = Math.ceil(box.height*dpr);
      atlas.getContext('2d').drawImage(source,0,0,atlas.width,atlas.height);
      const diagonal = Math.hypot(w,h);
      const makeTexture = () => {
        const image=document.createElement('canvas');
        image.width=Math.ceil(w*dpr);image.height=Math.ceil(h*dpr);
        return {image,ink:image.getContext('2d'),radius:-1,tint:-1};
      };
      const tiles = Array.from({length: cols*rows}, (_, i) => ({
        x: i % cols * w, y: Math.floor(i/cols)*h, texture:makeTexture(),
        dx: (Math.random()-.5)*90, dy: (Math.random()-.5)*58,
        rotation: (Math.random()-.5)*.45, delay: Math.random()*.22,
        holes: Array.from({length: 9}, () => {
          const x=Math.random()*w,y=Math.random()*h,path=new Path2D();
          for(let k=0;k<15;k++){
            const angle=k/14*Math.PI*2,r=1+.18*Math.sin(k*2.7+x);
            if(!k)path.moveTo(Math.cos(angle)*r,Math.sin(angle)*r);else path.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);
          }
          path.closePath();
          const size=.65+Math.random()*.7;
          return {x,y,size,path,cover:Math.hypot(Math.max(x,w-x),Math.max(y,h-y))/(size*.78)};
        }),
      }));
      document.body.append(canvas); logo.classList.add('is-acid');
      const started = performance.now();
      let previousPhase='',previousReturn='0';
      const paint = now => {
        if (!finish) return;
        const elapsed = now-started;
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
        ctx.globalAlpha=.88;
        for (const tile of tiles) {
          const erosion = Math.max(0, (dissolve-tile.delay)/(1-tile.delay));
          const radius=erosion*erosion*diagonal;
          if(tile.holes.some(hole=>radius>=hole.cover))continue;
          const texture=tile.texture,tint=erosion>0?Math.min(.8,erosion+.25):0;
          // Reuse pigment while its contour moves less than half a physical
          // pixel; tile transforms still follow every display refresh.
          if(texture.radius<0 || Math.abs(radius-texture.radius)*dpr>=.45 || Math.abs(tint-texture.tint)>=.015) {
            const ink=texture.ink;
            ink.setTransform(dpr,0,0,dpr,0,0);ink.clearRect(0,0,w+1,h+1);
            ink.globalCompositeOperation='source-over';
            ink.drawImage(atlas,tile.x/box.width*atlas.width,tile.y/box.height*atlas.height,
              w/box.width*atlas.width,h/box.height*atlas.height,0,0,w,h);
            ink.globalCompositeOperation='source-atop';
            ink.fillStyle=tint?`rgba(186,196,139,${tint})`:'rgba(196,188,160,.45)';
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
      logo.style.setProperty('--acid-return', '0');
      paint(started);
    });
  };
  window.inteonLogoAcid = {run, stop, get active() { return Boolean(finish); }};
  document.addEventListener('visibilitychange', stop);
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('inteon-storm', event => { if (event.detail.phase === 'prepare') stop(); });
  window.addEventListener('inteon-interlude', () => { if (document.body.classList.contains('is-interlude')) stop(); });
  reduced.addEventListener('change', stop);
  window.addEventListener('inteon-effects-change', () => { if (window.inteonHomeEffects?.suspended) stop(); });
})();
