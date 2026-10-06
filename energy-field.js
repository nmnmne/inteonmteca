/* Sparse matter in the room; during the interlude it becomes the wordmark's pixels. */
(() => {
  const canvas=document.createElement('canvas'); canvas.className='material-field'; canvas.setAttribute('aria-hidden','true'); document.body.append(canvas);
  const ctx=canvas.getContext('2d'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mask=document.createElement('canvas'); mask.width=534; mask.height=107;
  const image=new Image(); image.src='assets/logo-wordmark.svg';
  let particles=[],frame=0,last=0,w=innerWidth,h=innerHeight,energy=false,origin=0,ink='218, 243, 149';
  const fragments=['0x','[',']','{','}','::','=>','01','11','00','&&','/','+','f(x)','vec','0.01','< >','||'];
  let streams=[],logoBox=null;
  const measureLogo=()=>{logoBox=document.querySelector('#logo-wrap')?.getBoundingClientRect();};
  const buildStreams=()=>{
    streams=Array.from({length:w<801?12:28},(_,i)=>({
      x:(i+.25+Math.random()*.5)/(w<801?12:28),phase:Math.random()*h,
      depth:.25+Math.random()*.75,speed:4+Math.random()*11,
      symbols:Array.from({length:9},()=>fragments[Math.floor(Math.random()*fragments.length)])
    }));
  };
  image.onload=()=>{
    const mc=mask.getContext('2d'); mc.drawImage(image,0,0,534,107);
    const data=mc.getImageData(0,0,534,107).data;
    for(let y=0;y<107;y+=2) for(let x=0;x<534;x+=2) {
      if(data[(y*534+x)*4+3]>100) particles.push({x,y,phase:Math.random()*Math.PI*2,speed:.7+Math.random(),charge:Math.random()});
    }
    canvas.dataset.pixels=String(particles.length);
  };
  const palette=()=>{ink=getComputedStyle(document.documentElement).getPropertyValue('--interface-accent').trim()||ink;};
  const resize=()=>{w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio,1.5);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);buildStreams();measureLogo();};
  const draw=now=>{
    frame=requestAnimationFrame(draw); if(now-last<(w<801?66:42)) return; last=now;
    ctx.clearRect(0,0,w,h);
    const t=now/1000;
    if(energy) {
      if(!logoBox?.width) return;
      const age=(now-origin)/1000,scale=logoBox.width/534,x0=logoBox.left,y0=logoBox.top+(logoBox.height-107*scale)/2;
      for(const p of particles) {
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
        if(p.charge>.93&&front>.3) {
          ctx.globalAlpha=front*.14;ctx.fillRect(x-2,y-2,size+4,size+4);
          ctx.strokeStyle='#d5edcf';ctx.lineWidth=.45;ctx.globalAlpha=front*.3;
          ctx.beginPath();ctx.moveTo(x+size/2,y+size/2);ctx.lineTo(x0+p.x*scale,y0+p.y*scale);ctx.stroke();
        }
      }
      ctx.globalAlpha=1; return;
    }
    if(document.body.classList.contains('is-interlude')&&!document.body.classList.contains('scene-dawn')) return;
    // Code arrives in packets at several depths, with gaps and occasional horizontal branches.
    for(let i=0;i<streams.length;i++){
      const stream=streams[i],head=(stream.phase+t*stream.speed)%(h+240)-100;
      const x=stream.x*w+Math.sin(t*.07+i)*12,font=8+stream.depth*5;
      ctx.font=`500 ${font.toFixed(1)}px Consolas, monospace`;ctx.fillStyle=`rgb(${ink})`;
      for(let line=0;line<stream.symbols.length;line++){
        const y=head-line*(font+9),pulse=(Math.sin(t*.8-line*.7+i)+1)/2;
        ctx.globalAlpha=(.12+stream.depth*.35)*(1-line/10)*(.35+pulse*.65);
        const token=stream.symbols[(line+Math.floor(t/7+i))%stream.symbols.length];
        ctx.fillText(token,x,y);
        if(line===2&&i%4===0){ctx.globalAlpha=.12;ctx.fillText('· '+((i*47+Math.floor(t/3))%65535).toString(16).padStart(4,'0')+' /',x+34,y);}
      }
      ctx.globalAlpha=.35*stream.depth;ctx.fillRect(x-5,head-font,2,2);
    }
    const cell=w<801?100:150,cols=Math.ceil(w/cell)+1,rows=Math.ceil(h/cell)+1;
    ctx.strokeStyle=`rgb(${ink})`;ctx.fillStyle=`rgb(${ink})`;ctx.lineWidth=.65;
    // Fragments of a lattice materialize and discharge, leaving most of the room empty.
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
      const phase=row*1.73+col*2.19,tide=Math.sin(t*.29+phase);
      if(tide<.35) continue;
      const alpha=Math.pow((tide-.35)/.65,2),x=col*cell+Math.sin(t*.16+row)*14,y=row*cell+Math.sin(col*.7+t*.12)*19;
      ctx.globalAlpha=alpha*.7;ctx.fillRect(x,y,1.6,1.6);
      const length=cell*(.24+alpha*.58);
      ctx.globalAlpha=alpha*.22;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+length,y+Math.sin(phase)*12);ctx.lineTo(x+length+12,y-17);ctx.stroke();
      if(tide>.97) {ctx.globalAlpha=alpha*.5;ctx.fillRect(x+length-1,y+Math.sin(phase)*12-1,2.2,2.2);}
    }
    ctx.globalAlpha=1;
  };
  const sync=()=>{cancelAnimationFrame(frame);frame=0;if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(draw);else ctx.clearRect(0,0,w,h);};
  window.inteonPixelEnergy={start(){measureLogo();energy=true;origin=performance.now();canvas.dataset.mode='pixels';},stop(){energy=false;canvas.dataset.mode='field';}};
  window.addEventListener('inteon-theme-frame',palette);
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));window.addEventListener('pageshow',sync);
  palette();resize();sync();
})();
