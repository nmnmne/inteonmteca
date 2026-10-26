/* A small universe of independent energy colonies; the interlude still gathers
   this same canvas into the wordmark. Pools and glow sprites survive quality changes. */
(() => {
  const canvas=document.createElement('canvas'); canvas.className='material-field'; canvas.setAttribute('aria-hidden','true'); document.body.append(canvas);
  const ctx=canvas.getContext('2d'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mask=document.createElement('canvas'); mask.width=534; mask.height=107;
  const image=new Image(); image.src='assets/logo-wordmark.svg';
  const root=document.documentElement;
  const densities=[.12,.20,.29,.38,.48,.58,.68,.78,.89,1];
  const pixelRatios=[.65,.7,.75,.8,.9,1,1.1,1.2,1.35,1.5];
  const readLevel=()=>Math.max(1,Math.min(10,Math.round(Number(root.dataset.graphicsLevel)||(root.dataset.animationQuality==='low'?4:8))));
  let level=readLevel(),surfaceDirty=true,workloadDirty=true;
  let dustCount=0,streamCount=0,pixelCount=0,lineCount=0;
  const sampleIndex=(index,count,length)=>Math.min(length-1,Math.floor((index+.5)*length/count));
  let particles=[],frame=0,w=innerWidth,h=innerHeight,energy=false,origin=0,ink='218, 243, 149',paletteDirty=true;
  const fragments=['∴','⟐','::','⊹','∷','⊕','⌁','⟁'];
  let streams=[],logoBox=null,dust=[],nodes=[],links=[],glows=[];
  let colors=[];
  const tau=Math.PI*2;
  const buildNodes=()=>{
    // Keep the largest presences in the room's negative space, away from titles.
    const anchors=w<801?[[.13,.15],[.88,.42],[.16,.54],[.79,.79],[.52,.09]]:
      [[.12,.25],[.31,.49],[.55,.09],[.90,.72],[.72,.89],[.07,.82],[.74,.40],[.41,.79]];
    nodes=anchors.map(([x,y],i)=>({
      homeX:x,homeY:y,x:0,y:0,authority:[1,.68,.86,.96,.57,.72,.46,.61][i],
      phase:i*2.39996,period:4.8+i*1.37,tilt:-.8+i*.63,
      radius:Math.min(w,h)*(.065+(i%3)*.024),color:i%3,pulse:0,
    }));
    links=nodes.map((_,i)=>({from:i,to:(i+1)%nodes.length,bend:(i%2?1:-1)*(.15+i*.017),cx:0,cy:0}));
    for(let i=0;i<Math.floor(nodes.length/2);i++)links.push({from:i,to:(i+3)%nodes.length,bend:(i%2?-.19:.23),cx:0,cy:0});
  };
  // Reuse the ambient canvas and its recovery loop; no extra full-screen layer.
  const buildDust=()=>{
    const count=Math.min(280,Math.max(64,Math.round(w*h/6500)));
    dust=Array.from({length:count},(_,i)=>({
      x:Math.random(),y:Math.random(),phase:Math.random()*Math.PI*2,cluster:i%nodes.length,free:i%5===0,
      vx:(Math.random()-.5)*5,vy:2+Math.random()*5,
      radius:.6+Math.random()*1.25,period:8+Math.random()*12,orbit:.35+Math.random()*1.3,
    }));
  };
  const drawDust=t=>{
    for(let index=0;index<dustCount;index++){
      const p=dust[sampleIndex(index,dustCount,dust.length)];
      const node=nodes[p.cluster],angle=p.phase+t*(p.cluster%2?-1:1)*(.07+p.orbit*.055);
      const radius=node.radius*p.orbit*(.94+node.pulse*.06),tilt=node.tilt;
      const ox=Math.cos(angle)*radius,oy=Math.sin(angle)*radius*(.26+p.y*.36);
      const x=p.free?((p.x*(w+48)+t*p.vx+w+48)%(w+48))-24:node.x+ox*Math.cos(tilt)-oy*Math.sin(tilt);
      const y=p.free?((p.y*(h+48)-t*p.vy+h*100)%(h+48))-24:node.y+ox*Math.sin(tilt)+oy*Math.cos(tilt);
      const fade=.5+.5*Math.sin(t*Math.PI*2/p.period+p.phase);
      ctx.fillStyle=colors[node.color];ctx.globalAlpha=.2+.8*fade*fade;
      ctx.beginPath();ctx.arc(x,y,p.radius,0,Math.PI*2);ctx.fill();
      if(level>=6&&index%9===0){ctx.globalAlpha=.24+fade*.32;ctx.drawImage(glows[node.color],x-7,y-7,14,14);}
    }
    ctx.globalAlpha=1;
  };
  const labels=new Map();
  const drawLabel=(text,font,x,y)=>{
    const key=`${font}|${text}`;
    let label=labels.get(key);
    if(!label){
      if(labels.size>=1024)labels.clear();
      const bitmap=document.createElement('canvas'),inkContext=bitmap.getContext('2d');
      // Quality changes reuse the atlas; only its destination shrinks.
      const ratio=Math.min(devicePixelRatio||1,1.5);
      inkContext.font=`500 ${font}px Consolas, monospace`;
      const width=Math.ceil(inkContext.measureText(text).width+2),height=Math.ceil(Number(font)*2),baseline=Number(font)*1.5;
      bitmap.width=Math.ceil(width*ratio);bitmap.height=Math.ceil(height*ratio);
      inkContext.scale(ratio,ratio);inkContext.font=`500 ${font}px Consolas, monospace`;inkContext.fillStyle=`rgb(${ink})`;
      inkContext.fillText(text,0,baseline);
      label={bitmap,width,height,baseline};labels.set(key,label);
    }
    ctx.drawImage(label.bitmap,x,y-label.baseline,label.width,label.height);
  };
  const measureLogo=()=>{logoBox=document.querySelector('#logo-wrap')?.getBoundingClientRect();};
  const buildStreams=()=>{
    const count=w<801?18:36;
    streams=Array.from({length:count},(_,i)=>({
      link:i%links.length,phase:Math.random(),depth:.25+Math.random()*.75,speed:.045+Math.random()*.065,
    }));
  };
  const drawColonies=t=>{
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i];
      n.pulse=.5+.5*Math.sin(t*tau/n.period+n.phase);
      n.x=n.homeX*w+Math.sin(t*.045+n.phase)*Math.min(24,w*.025);
      n.y=n.homeY*h+Math.cos(t*.057+n.phase)*Math.min(20,h*.025);
    }
    // A fixed network replaces all-pairs searches. Its curved routes have their
    // own clocks; packets never depend on frame count or the selected detail level.
    for(let i=0;i<links.length;i++){
      const link=links[i],a=nodes[link.from],b=nodes[link.to];
      link.cx=(a.x+b.x)*.5-(b.y-a.y)*link.bend;
      link.cy=(a.y+b.y)*.5+(b.x-a.x)*link.bend;
      if(level<3||i>=Math.min(links.length,level+2))continue;
      ctx.strokeStyle=colors[a.color];ctx.lineWidth=.65;
      ctx.globalAlpha=.07+.09*(.5+.5*Math.sin(t*.23+i));
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(link.cx,link.cy,b.x,b.y);ctx.stroke();
    }
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i],size=24+n.authority*35+n.pulse*8;
      ctx.globalAlpha=.55+n.authority*.3;ctx.drawImage(glows[n.color],n.x-size/2,n.y-size/2,size,size);
      ctx.fillStyle=colors[n.color];ctx.globalAlpha=.9;
      ctx.beginPath();ctx.arc(n.x,n.y,1+n.authority*1.5,0,tau);ctx.fill();
      ctx.fillStyle='#f4ffed';ctx.globalAlpha=.65;ctx.fillRect(n.x-.6,n.y-.6,1.2,1.2);
      ctx.strokeStyle=colors[n.color];ctx.lineWidth=.7;ctx.globalAlpha=.19+n.authority*.13;
      ctx.beginPath();ctx.ellipse(n.x,n.y,n.radius,n.radius*.37,n.tilt,t*.045+n.phase,t*.045+n.phase+Math.PI*1.28);ctx.stroke();
      if(level>=4){
        const pulse=(t/n.period+n.phase/tau)%1,radius=8+pulse*n.radius*.6;
        ctx.globalAlpha=(1-pulse)*.24*n.authority;
        ctx.beginPath();ctx.ellipse(n.x,n.y,radius,radius*.65,-n.tilt,0,tau);ctx.stroke();
      }
      if(level>=7){
        ctx.globalAlpha=.19;ctx.beginPath();ctx.ellipse(n.x,n.y,n.radius*1.22,n.radius*.2,n.tilt+.65,-t*.06+n.phase,-t*.06+n.phase+2.4);ctx.stroke();
        ctx.globalAlpha=.3;drawLabel(fragments[i%fragments.length],'10',n.x+12,n.y-10);
      }
    }
    for(let index=0;index<streamCount;index++){
      const s=streams[sampleIndex(index,streamCount,streams.length)],link=links[s.link];
      const a=nodes[link.from],b=nodes[link.to],u=(t*s.speed+s.phase)%1,v=1-u;
      const x=v*v*a.x+2*v*u*link.cx+u*u*b.x,y=v*v*a.y+2*v*u*link.cy+u*u*b.y;
      ctx.fillStyle=colors[a.color];ctx.globalAlpha=(.4+s.depth*.5)*Math.sin(u*Math.PI);
      ctx.beginPath();ctx.arc(x,y,1+s.depth,0,tau);ctx.fill();
      if(level>=5){ctx.globalAlpha*=.65;ctx.drawImage(glows[a.color],x-6,y-6,12,12);}
    }
    ctx.globalAlpha=1;
  };
  image.onload=()=>{
    const mc=mask.getContext('2d'); mc.drawImage(image,0,0,534,107);
    const data=mc.getImageData(0,0,534,107).data;
    for(let y=0;y<107;y+=2) for(let x=0;x<534;x+=2) {
      if(data[(y*534+x)*4+3]>100) particles.push({x,y,phase:Math.random()*Math.PI*2,speed:.7+Math.random(),charge:Math.random()});
    }
    canvas.dataset.pixels=String(particles.length);
    workloadDirty=true;
  };
  const palette=()=>{
    ink=getComputedStyle(document.documentElement).getPropertyValue('--interface-accent').trim()||ink;
    const rgb=ink.split(',').map(Number),mix=(target,amount)=>rgb.map((v,i)=>Math.round(v*(1-amount)+target[i]*amount)).join(',');
    const pigments=[ink,mix([100,211,233],.68),mix([237,157,104],.65)];
    colors=pigments.map(c=>`rgb(${c})`);
    // Three tiny raster glows, rebuilt only on palette changes, replace per-frame
    // canvas shadows and large filters. Quality switches keep these exact sprites.
    if(!glows.length)glows=pigments.map(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;return c;});
    pigments.forEach((c,i)=>{const gc=glows[i].getContext('2d');gc.clearRect(0,0,64,64);const g=gc.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,`rgba(${c},.85)`);g.addColorStop(.16,`rgba(${c},.28)`);g.addColorStop(.48,`rgba(${c},.07)`);g.addColorStop(1,`rgba(${c},0)`);gc.fillStyle=g;gc.fillRect(0,0,64,64);});
    paletteDirty=false;labels.clear();
  };
  const resize=()=>{w=innerWidth;h=innerHeight;surfaceDirty=true;workloadDirty=true;labels.clear();buildNodes();buildStreams();buildDust();measureLogo();};
  const qualityChanged=()=>{const next=readLevel();if(next===level)return;level=next;surfaceDirty=true;workloadDirty=true;};
  const updateSurface=()=>{
    if(surfaceDirty){
      const d=Math.min(devicePixelRatio||1,pixelRatios[level-1]);
      const width=Math.max(1,Math.round(w*d)),height=Math.max(1,Math.round(h*d));
      if(canvas.width!==width)canvas.width=width;
      if(canvas.height!==height)canvas.height=height;
      ctx.setTransform(d,0,0,d,0,0);surfaceDirty=false;
    }
    if(workloadDirty){
      const density=densities[level-1];
      dustCount=Math.round(dust.length*density);streamCount=Math.max(1,Math.round(streams.length*density));
      pixelCount=Math.round(particles.length*Math.max(.3,density));lineCount=0;
      canvas.dataset.graphicsLevel=String(level);canvas.dataset.dust=String(dustCount);
      canvas.dataset.streams=String(streamCount);canvas.dataset.symbolsPerStream=String(lineCount);
      canvas.dataset.activePixels=String(pixelCount);workloadDirty=false;
      canvas.dataset.colonies=String(nodes.length);canvas.dataset.links=String(level<3?0:Math.min(links.length,level+2));
      canvas.dataset.signals=String(streamCount);canvas.dataset.fieldStyle='energy-colonies';
    }
  };
  const draw=now=>{
    window.inteonHomeEffects?.beat('field');
    frame=0;if(blocked())return;frame=requestAnimationFrame(draw);
    updateSurface();
    now=window.inteonHomeEffects?.ambientNow(now)??now;
    if(paletteDirty)palette();
    ctx.clearRect(0,0,w,h);
    const t=now/1000;
    if(energy) {
      if(!logoBox?.width) return;
      const age=(now-origin)/1000,scale=logoBox.width/534,x0=logoBox.left,y0=logoBox.top+(logoBox.height-107*scale)/2;
      for(let index=0;index<pixelCount;index++) {
        const p=particles[sampleIndex(index,pixelCount,particles.length)];
        const wave=(Math.sin(p.x*.025+p.y*.038-age*1.8)+1)/2;
        const distance=Math.abs(p.x/534-(age*.12)%1),front=Math.exp(-Math.pow(Math.min(distance,1-distance)*17,2));
        const release=Math.pow((Math.sin(age*.9+p.phase)+1)/2,2)*(.22+wave*.45+front*.33);
        const curl=Math.sin(p.x*.032+p.y*.027-age*.8);
        const dx=(curl*4+Math.sin(age*2.6*p.speed+p.phase)*3)*release;
        const dy=(Math.cos(p.x*.027-age)*3+Math.cos(age*2.1+p.phase)*2)*release;
        const size=Math.max(.75,scale*(1.6-release*.6));
        const x=x0+p.x*scale+dx,y=y0+p.y*scale+dy;
        ctx.fillStyle=front>.65?'#f8ffe5':p.charge>.85?'#adc6bf':'#dce0ba';
        ctx.globalAlpha=.5+wave*.28+front*.22;
        ctx.fillRect(x,y,size,size);
        if(level>=6&&p.charge>.93&&front>.3) {
          ctx.globalAlpha=front*.14;ctx.fillRect(x-2,y-2,size+4,size+4);
          ctx.strokeStyle='#d5edcf';ctx.lineWidth=.45;ctx.globalAlpha=front*.3;
          ctx.beginPath();ctx.moveTo(x+size/2,y+size/2);ctx.lineTo(x0+p.x*scale,y0+p.y*scale);ctx.stroke();
        }
      }
      ctx.globalAlpha=1; return;
    }
    if(document.body.classList.contains('is-interlude')&&!document.body.classList.contains('scene-dawn')) return;
    drawColonies(t);drawDust(t);
  };
  const blocked=()=>document.hidden||reduced.matches||window.inteonHomeEffects?.suspended||window.inteonHomeEffects?.ambientPaused;
  const sync=()=>{cancelAnimationFrame(frame);frame=0;if(!blocked())frame=requestAnimationFrame(draw);};
  window.inteonPixelEnergy={start(){measureLogo();energy=true;origin=window.inteonHomeEffects?.ambientNow()??performance.now();canvas.dataset.mode='pixels';sync();},stop(){energy=false;canvas.dataset.mode='field';sync();}};
  window.addEventListener('inteon-theme-frame',()=>{paletteDirty=true;});
  window.inteonHomeEffects?.watch('field', {blocked, restart: sync});
  window.addEventListener('inteon-effects-change',sync);
  window.addEventListener('inteon-ambient-change',sync);
  window.addEventListener('inteon-interlude',sync);
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  window.addEventListener('inteon-quality-change',qualityChanged);
  new MutationObserver(()=>{if(!root.dataset.graphicsLevel)qualityChanged();}).observe(root,{attributes:true,attributeFilter:['data-animation-quality']});
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));window.addEventListener('pageshow',sync);
  palette();resize();sync();
})();
