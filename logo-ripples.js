/* Pigment leaves the wordmark's contour, follows a curl field and returns to it. */
(() => {
  const wrap=document.querySelector('#logo-wrap'); if(!wrap || matchMedia('(max-width: 800px), (pointer: coarse)').matches) return;
  const canvas=document.createElement('canvas');canvas.className='logo-ripples';canvas.setAttribute('aria-hidden','true');wrap.prepend(canvas);
  const ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mask=document.createElement('canvas');mask.width=534;mask.height=107;
  const image=new Image();image.src='assets/logo-wordmark.svg';
  const root=document.documentElement;
  const densities=[.12,.20,.29,.38,.48,.58,.68,.78,.89,1];
  const pixelRatios=[.65,.7,.75,.8,.9,1,1.1,1.2,1.35,1.5];
  const ribbonCounts=[1,1,2,2,3,4,5,6,7,9];
  const segmentCounts=[14,18,22,26,32,38,44,52,60,70];
  const segmentIndexes=segmentCounts.map(count=>Array.from({length:count+1},(_,index)=>Math.round(index*70/count)));
  const readLevel=()=>Math.max(1,Math.min(10,Math.round(Number(root.dataset.graphicsLevel)||(root.dataset.animationQuality==='low'?4:8))));
  let level=readLevel(),surfaceDirty=true,workloadDirty=true,seedCount=0;
  let seeds=[],frame=0,width=1,height=1,a='211, 192, 143',b='198, 155, 119',paletteDirty=true,gradient=null,colors=[];
  const point={},middle={},end={};
  const ribbonPoints=Array.from({length:71},(_,i)=>{const u=i/70;return {u,taper:Math.sin(u*Math.PI),sin6:Math.sin(u*6),cos6:Math.cos(u*6),sin13:Math.sin(u*13),cos13:Math.cos(u*13)};});
  image.onload=()=>{
    const mc=mask.getContext('2d');mc.drawImage(image,0,0,534,107);const pixels=mc.getImageData(0,0,534,107).data;
    const alpha=(x,y)=>x<0||y<0||x>533||y>106?0:pixels[(y*534+x)*4+3];
    for(let y=1;y<106;y+=2)for(let x=1;x<533;x+=2){
      if(alpha(x,y)>100&&Math.min(alpha(x-3,y),alpha(x+3,y),alpha(x,y-3),alpha(x,y+3))<70)
        seeds.push({x,y,phase:Math.random()*Math.PI*2,life:Math.random(),depth:.3+Math.random()*.7,side:y<53?-1:1});
    }
    canvas.dataset.particles=String(seeds.length);workloadDirty=true;
  };
  const palette=()=>{const css=getComputedStyle(document.documentElement);a=css.getPropertyValue('--theme-a-rgb').trim()||a;b=css.getPropertyValue('--theme-c-rgb').trim()||b;colors=[`rgb(${a})`,`rgb(${b})`,'#e7ddbd'];paletteDirty=false;gradient=null;};
  const resize=()=>{width=canvas.clientWidth;height=canvas.clientHeight;surfaceDirty=true;};
  const qualityChanged=()=>{const next=readLevel();if(next===level)return;level=next;surfaceDirty=true;workloadDirty=true;};
  const updateSurface=()=>{
    if(surfaceDirty){
      const d=Math.min(devicePixelRatio||1,pixelRatios[level-1]);
      const pixelWidth=Math.max(1,Math.ceil(width*d)),pixelHeight=Math.max(1,Math.ceil(height*d));
      if(canvas.width!==pixelWidth)canvas.width=pixelWidth;
      if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
      ctx.setTransform(d,0,0,d,0,0);gradient=null;surfaceDirty=false;
    }
    if(workloadDirty){
      seedCount=Math.round(seeds.length*densities[level-1]);
      canvas.dataset.graphicsLevel=String(level);canvas.dataset.activeParticles=String(seedCount);
      canvas.dataset.ribbons=String(ribbonCounts[level-1]);canvas.dataset.segments=String(segmentCounts[level-1]);
      workloadDirty=false;
    }
  };
  const field=(p,age,t,out)=>{
    const lift=Math.sin(Math.PI*age),r=width/1.68/534;
    const curl=Math.sin(p.x*.018+t*.37+p.phase)*.6+Math.sin(p.y*.055-t*.23)*.4;
    out.x=(width-534*r)/2+p.x*r+lift*(curl*width*.085+Math.sin(age*6+p.phase)*width*.025)*p.depth;
    out.y=(height-107*r)/2+p.y*r+lift*(p.side*height*(.11+p.depth*.14)+Math.sin(age*7+p.phase+t*.2)*height*.042);
    return out;
  };
  const draw=now=>{
    window.inteonHomeEffects?.beat('ripples');
    frame=0; if(blocked())return; frame=requestAnimationFrame(draw);
    updateSurface();
    now=window.inteonHomeEffects?.ambientNow(now)??now;
    if(paletteDirty)palette();
    ctx.clearRect(0,0,width,height);
    if(document.body.classList.contains('is-interlude')||wrap.classList.contains('is-rebuilding'))return;
    const t=now/1000,energy=typeof audioEnergy==='function'?audioEnergy().bass:0;
    const breath=.3+.7*Math.pow((Math.sin(t*.16)+1)/2,2),strength=breath+energy*.12;
    if(!gradient){gradient=ctx.createLinearGradient(width*.15,height*.2,width*.85,height*.8);gradient.addColorStop(0,`rgba(${a},0)`);gradient.addColorStop(.3,`rgba(${a},.32)`);gradient.addColorStop(.72,`rgba(${b},.18)`);gradient.addColorStop(1,`rgba(${b},0)`);}
    ctx.strokeStyle=gradient;
    // The same sinusoidal ribbons, with their spatial terms cached. Only the
    // time-dependent angles need trigonometry at display frequency.
    const sin13=Math.sin(-t*.17),cos13=Math.cos(-t*.17);
    const indexes=segmentIndexes[level-1];
    for(const index of indexes){const p=ribbonPoints[index];p.wave13=(p.sin13*cos13+p.cos13*sin13)*height*.025;}
    for(let ribbon=0;ribbon<ribbonCounts[level-1];ribbon++){
      const sin6=Math.sin(t*.3+ribbon*.35),cos6=Math.cos(t*.3+ribbon*.35);
      ctx.beginPath();
      for(let i=0;i<indexes.length;i++){
        const p=ribbonPoints[indexes[i]],x=width*(.09+p.u*.82);
        const y=height*(.36+ribbon*.045)+p.taper*((p.sin6*cos6+p.cos6*sin6)*height*.1+p.wave13);
        if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=ribbon%3===0?1.1:.45;ctx.globalAlpha=strength*.5;ctx.stroke();
    }
    for(let sample=0;sample<seedCount;sample++){
      const i=Math.min(seeds.length-1,Math.floor((sample+.5)*seeds.length/seedCount));
      const p=seeds[i],age=(t*(.035+p.depth*.012)+p.life)%1;
      const fade=Math.pow(Math.sin(Math.PI*age),.8)*strength;
      const q=field(p,age,t,point);
      if(level>=4&&sample%4===0){
        ctx.strokeStyle=colors[i%8?0:1];ctx.lineWidth=.4+p.depth*.65;ctx.globalAlpha=fade*.18;ctx.beginPath();
        const mid=field(p,Math.max(0,age-.014),t-.175,middle);
        const tail=field(p,Math.max(0,age-.028),t-.35,end);
        ctx.moveTo(q.x,q.y);
        ctx.quadraticCurveTo(2*mid.x-(q.x+tail.x)/2,2*mid.y-(q.y+tail.y)/2,tail.x,tail.y);
        ctx.stroke();
      }
      ctx.fillStyle=colors[i%5===0?2:i%2?0:1];ctx.globalAlpha=fade*(.9+p.depth*.1);
      const size=.45+p.depth*.9;ctx.fillRect(q.x,q.y,size,size);

    }
    ctx.globalAlpha=1;
  };
  const blocked=()=>document.hidden||reduced.matches||window.inteonHomeEffects?.ambientBlocked||window.inteonHomeEffects?.ambientPaused;
  const sync=()=>{cancelAnimationFrame(frame);frame=0;if(blocked())return;frame=requestAnimationFrame(draw);};
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('inteon-quality-change',qualityChanged);
  new MutationObserver(()=>{if(!root.dataset.graphicsLevel)qualityChanged();}).observe(root,{attributes:true,attributeFilter:['data-animation-quality']});
  window.addEventListener('inteon-theme-frame',()=>{paletteDirty=true;});
  window.inteonHomeEffects?.watch('ripples', {blocked, restart: sync});
  window.addEventListener('inteon-effects-change',sync);
  window.addEventListener('inteon-ambient-change',sync);
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));window.addEventListener('pageshow',sync);
  palette();resize();sync();
})();
