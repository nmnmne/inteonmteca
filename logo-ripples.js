/* Pigment leaves the wordmark's contour, follows a curl field and returns to it. */
(() => {
  const wrap=document.querySelector('#logo-wrap'); if(!wrap) return;
  const canvas=document.createElement('canvas');canvas.className='logo-ripples';canvas.setAttribute('aria-hidden','true');wrap.prepend(canvas);
  const ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mask=document.createElement('canvas');mask.width=534;mask.height=107;
  const image=new Image();image.src='assets/logo-wordmark.svg';
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
    seeds=seeds.filter((_,i)=>i%2===0);canvas.dataset.particles=String(seeds.length);
  };
  const palette=()=>{const css=getComputedStyle(document.documentElement);a=css.getPropertyValue('--theme-a-rgb').trim()||a;b=css.getPropertyValue('--theme-c-rgb').trim()||b;colors=[`rgb(${a})`,`rgb(${b})`,'#e7ddbd'];paletteDirty=false;gradient=null;};
  const resize=()=>{width=canvas.clientWidth;height=canvas.clientHeight;const d=Math.min(devicePixelRatio,document.documentElement.dataset.animationQuality==='low'?1:1.4);canvas.width=Math.ceil(width*d);canvas.height=Math.ceil(height*d);ctx.setTransform(d,0,0,d,0,0);gradient=null;};
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
    if(paletteDirty)palette();
    ctx.clearRect(0,0,width,height);
    if(document.body.classList.contains('is-interlude')||wrap.classList.contains('is-rebuilding'))return;
    const t=now/1000,energy=typeof audioEnergy==='function'?audioEnergy(now).bass:0;
    const breath=.3+.7*Math.pow((Math.sin(t*.16)+1)/2,2),strength=breath+energy*.12;
    if(!gradient){gradient=ctx.createLinearGradient(width*.15,height*.2,width*.85,height*.8);gradient.addColorStop(0,`rgba(${a},0)`);gradient.addColorStop(.3,`rgba(${a},.32)`);gradient.addColorStop(.72,`rgba(${b},.18)`);gradient.addColorStop(1,`rgba(${b},0)`);}
    ctx.strokeStyle=gradient;
    // The same sinusoidal ribbons, with their spatial terms cached. Only the
    // time-dependent angles need trigonometry at display frequency.
    const sin13=Math.sin(-t*.17),cos13=Math.cos(-t*.17);
    for(const p of ribbonPoints)p.wave13=(p.sin13*cos13+p.cos13*sin13)*height*.025;
    for(let ribbon=0;ribbon<7;ribbon++){
      const sin6=Math.sin(t*.3+ribbon*.35),cos6=Math.cos(t*.3+ribbon*.35);
      ctx.beginPath();
      for(let i=0;i<ribbonPoints.length;i++){
        const p=ribbonPoints[i],x=width*(.09+p.u*.82);
        const y=height*(.36+ribbon*.045)+p.taper*((p.sin6*cos6+p.cos6*sin6)*height*.1+p.wave13);
        if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=ribbon%3===0?1.1:.45;ctx.globalAlpha=strength*.5;ctx.stroke();
    }
    for(let i=0;i<seeds.length;i++){
      const p=seeds[i],age=(t*(.035+p.depth*.012)+p.life)%1;
      const fade=Math.pow(Math.sin(Math.PI*age),.8)*strength;
      const q=field(p,age,t,point);
      if(i%4===0){
        ctx.strokeStyle=colors[i%8?0:1];ctx.lineWidth=.4+p.depth*.65;ctx.globalAlpha=fade*.18;ctx.beginPath();
        const mid=field(p,Math.max(0,age-.014),t-.175,middle);
        const tail=field(p,Math.max(0,age-.028),t-.35,end);
        ctx.moveTo(q.x,q.y);
        ctx.quadraticCurveTo(2*mid.x-(q.x+tail.x)/2,2*mid.y-(q.y+tail.y)/2,tail.x,tail.y);
        ctx.stroke();
      }
      ctx.fillStyle=colors[i%5===0?2:i%2?0:1];ctx.globalAlpha=fade*(.16+p.depth*.38);
      const size=.45+p.depth*.9;ctx.fillRect(q.x,q.y,size,size);
      if(i%37===0){ctx.globalAlpha=fade*.1;ctx.fillRect(q.x-2,q.y-2,4,4);}
    }
    ctx.globalAlpha=1;
  };
  const blocked=()=>document.hidden||reduced.matches||window.inteonHomeEffects?.ambientBlocked;
  const sync=()=>{cancelAnimationFrame(frame);frame=0;if(blocked())return;frame=requestAnimationFrame(draw);};
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(resize).observe(document.documentElement,{attributes:true,attributeFilter:['data-animation-quality']});
  new MutationObserver(resize).observe(document.documentElement,{attributes:true,attributeFilter:['data-animation-quality']});
  window.addEventListener('inteon-theme-frame',()=>{paletteDirty=true;});
  window.inteonHomeEffects?.watch('ripples', {blocked, restart: sync});
  window.addEventListener('inteon-effects-change',sync);
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));window.addEventListener('pageshow',sync);
  palette();resize();sync();
})();
