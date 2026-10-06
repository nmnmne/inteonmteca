(() => {
  const logo = document.querySelector('#logo-wrap');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const source = new Image();
  source.src = 'assets/logo-wordmark.svg';
  let frame = 0, finish = null, canvas = null;
  const stop = () => {
    cancelAnimationFrame(frame); frame = 0;
    canvas?.remove(); canvas = null;
    logo?.classList.remove('is-acid');
    if (logo) delete logo.dataset.acidPhase;
    const resolve = finish; finish = null; resolve?.();
  };
  const run = () => {
    if (!logo || finish || !source.complete || !source.naturalWidth || document.hidden || reduced.matches ||
        document.body.classList.contains('is-interlude') || document.body.classList.contains('storm-priming') || document.querySelector('.logo-storm')) return null;
    return new Promise(resolve => {
      finish = resolve;
      const box = logo.getBoundingClientRect(), pad = 90, cols = 18, rows = 6;
      const w = box.width / cols, h = box.height / rows;
      canvas = document.createElement('canvas');
      canvas.className = 'logo-acid'; canvas.setAttribute('aria-hidden', 'true');
      const dpr = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.ceil((box.width + pad * 2) * dpr);
      canvas.height = Math.ceil((box.height + pad * 2) * dpr);
      Object.assign(canvas.style, {left: `${box.left-pad}px`, top: `${box.top-pad}px`, width: `${box.width+pad*2}px`, height: `${box.height+pad*2}px`});
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      const scratch = document.createElement('canvas');
      scratch.width = Math.ceil(w * dpr); scratch.height = Math.ceil(h * dpr);
      const ink = scratch.getContext('2d');
      const tiles = Array.from({length: cols*rows}, (_, i) => ({
        x: i % cols * w, y: Math.floor(i/cols)*h,
        dx: (Math.random()-.5)*90, dy: (Math.random()-.5)*58,
        rotation: (Math.random()-.5)*.45, delay: Math.random()*.22,
        holes: Array.from({length: 9}, () => ({x: Math.random()*w, y: Math.random()*h, size: .65+Math.random()*.7})),
      }));
      document.body.append(canvas); logo.classList.add('is-acid');
      const started = performance.now(); let last = -Infinity;
      const paint = now => {
        if (!finish) return;
        const elapsed = now-started;
        if (elapsed >= 11600) { stop(); return; }
        frame = requestAnimationFrame(paint);
        if (now-last < 32) return;
        last = now;
        const spread = 1-Math.pow(1-Math.min(1, elapsed/2300), 3);
        const dissolve = Math.max(0, (elapsed-3100)/5900);
        const returnOpacity = Math.max(0, Math.min(1, (elapsed-9800)/1800));
        logo.style.setProperty('--acid-return', returnOpacity.toFixed(3));
        logo.dataset.acidPhase = elapsed < 2300 ? 'scatter' : elapsed < 3100 ? 'hold' : elapsed < 9800 ? 'dissolve' : 'return';
        ctx.clearRect(0,0,box.width+pad*2,box.height+pad*2);
        if (elapsed >= 9800) return;
        for (const tile of tiles) {
          const erosion = Math.max(0, (dissolve-tile.delay)/(1-tile.delay));
          ink.setTransform(dpr,0,0,dpr,0,0); ink.clearRect(0,0,w+1,h+1);
          ink.globalCompositeOperation = 'source-over';
          ink.drawImage(source, tile.x/box.width*source.naturalWidth, tile.y/box.height*source.naturalHeight,
            w/box.width*source.naturalWidth, h/box.height*source.naturalHeight, 0,0,w,h);
          // Tint the surviving pigment; holes eat the actual alpha instead of fading a rectangle.
          ink.globalCompositeOperation = 'source-atop';
          ink.fillStyle = erosion > 0 ? `rgba(186,196,139,${Math.min(.8, erosion+.25)})` : 'rgba(196,188,160,.45)';
          ink.fillRect(0,0,w,h);
          ink.globalCompositeOperation = 'destination-out';
          for (const hole of tile.holes) {
            const radius = erosion * erosion * Math.hypot(w,h)*hole.size;
            if (radius <= 0) continue;
            ink.beginPath();
            for (let k=0;k<15;k++) {
              const angle=k/14*Math.PI*2, r=radius*(1+.18*Math.sin(k*2.7+hole.x));
              const x=hole.x+Math.cos(angle)*r, y=hole.y+Math.sin(angle)*r;
              if (!k) ink.moveTo(x,y); else ink.lineTo(x,y);
            }
            ink.closePath(); ink.fill();
          }
          ctx.save(); ctx.translate(pad+tile.x+w/2+tile.dx*spread,pad+tile.y+h/2+tile.dy*spread+erosion*8);
          ctx.rotate(tile.rotation*spread); ctx.globalAlpha=.88;
          ctx.drawImage(scratch,-w/2,-h/2,w,h); ctx.restore();
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
})();
