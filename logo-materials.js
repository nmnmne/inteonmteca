/* Native vector materials: organic erosion and depth contours, without column sampling. */
(() => {
  const wrap=document.querySelector('#logo-wrap');if(!wrap)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let layer,frame=0,deadline=0,generation=0,breathing=null,snapshot=null,pausedAnimations=[];
  const breathSource=new Image();breathSource.src="assets/logo-wordmark.svg";
  const stop=()=>{generation++;snapshot?.skipTransition();snapshot=null;delete document.documentElement.dataset.logoSnapshot;delete wrap.dataset.dissolvePhase;breathing?.cancel();breathing=null;cancelAnimationFrame(frame);clearTimeout(deadline);layer?.remove();layer=null;delete wrap.dataset.materialPreview;wrap.style.removeProperty('--material-return');wrap.style.removeProperty('--material-surface-opacity');pausedAnimations.forEach(a=>a.play());pausedAnimations=[];};
  const run=name=>{
    stop();if(reduced.matches||document.hidden||matchMedia('(max-width: 800px), (pointer: coarse)').matches)return;
    wrap.style.setProperty('--material-surface-opacity',getComputedStyle(wrap.querySelector('.reactive-logo')).opacity);
    wrap.dataset.materialPreview=name;
    if(name!=='dissolve'&&name!=='breath')return;
    const token=generation;
    const surface=wrap.querySelector('.reactive-logo');
    pausedAnimations=surface.getAnimations({subtree:true}).filter(a=>a.playState==='running');
    pausedAnimations.forEach(a=>a.pause());
    const ns='http://www.w3.org/2000/svg';
    layer=document.createElementNS(ns,'svg');layer.classList.add('logo-material-preview');layer.setAttribute('viewBox','0 0 534 107');layer.setAttribute('aria-hidden','true');
    const css=getComputedStyle(document.documentElement),dark=Number(css.getPropertyValue('--logo-brightness'))===0;
    const accent=`rgb(${css.getPropertyValue('--theme-accent-rgb')})`;
    const stops=[...document.querySelectorAll('#logo-core-gradient stop')].map(s=>`<stop offset="${s.getAttribute('offset')}" stop-color="${s.getAttribute('stop-color')}"/>`).join('');
    const word='<image href="assets/logo-wordmark.svg" width="534" height="107"/>';
    layer.innerHTML=`<defs>
      <linearGradient id="material-pigment" x1="0" y1="8" x2="534" y2="101" gradientUnits="userSpaceOnUse">${stops}</linearGradient>
      <mask id="material-word" maskUnits="userSpaceOnUse" x="0" y="0" width="534" height="107">${word}</mask>
      <filter id="material-erosion" x="-12%" y="-40%" width="124%" height="180%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".04 .065" numOctaves="3" seed="23" result="noise"/>
        <feColorMatrix class="erosion-threshold" in="noise" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 0" result="cut"/>
        <feComposite in="SourceGraphic" in2="cut" operator="in" result="body"/>
        <feMorphology in="body" operator="erode" radius=".65" result="inner"/>
        <feComposite in="body" in2="inner" operator="out" result="rim"/>
        <feFlood flood-color="${accent}" result="color"/>
        <feComposite in="color" in2="rim" operator="in" result="edge"/>
        <feMerge><feMergeNode in="body"/><feMergeNode in="edge"/></feMerge>
      </filter>
      <filter id="material-contour" x="-10%" y="-30%" width="120%" height="160%">
        <feMorphology in="SourceAlpha" operator="dilate" radius=".7" result="outer"/>
        <feComposite in="outer" in2="SourceAlpha" operator="out" result="rim"/>
        <feFlood flood-color="${accent}"/><feComposite in2="rim" operator="in"/>
      </filter>
      <filter id="snapshot-ink-erosion" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".04 .065" numOctaves="3" seed="23" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 1" result="cut">
          <animate class="snapshot-erosion-clock" attributeName="values" begin="indefinite" dur="3.2s" fill="freeze" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 1;0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 -10"/>
        </feColorMatrix>
        <feComposite in="SourceGraphic" in2="cut" operator="in"/>
      </filter>
    </defs>`;
    const makeWord=filter=>{const g=document.createElementNS(ns,'g');g.setAttribute('filter',filter);g.innerHTML='<rect width="534" height="107" fill="url(#material-pigment)" mask="url(#material-word)"/>';layer.append(g);return g;};
    const echoes=name==='breath'?Array.from({length:5},()=>makeWord('url(#material-contour)')):[];
    const blackBase=name==='dissolve'?makeWord('none'):null;
    if(blackBase){blackBase.querySelector('rect').setAttribute('fill','#000');blackBase.setAttribute('opacity','0');}
    const main=makeWord(name==='dissolve'?'url(#material-erosion)':'none');surface.append(layer);
    if(name==='breath')main.setAttribute('opacity','0');
    const threshold=layer.querySelector('.erosion-threshold');
    const started=performance.now(),duration=name==='dissolve'?8600:6500;
    const viewport=surface.querySelector(".logo-vector").getBoundingClientRect();
    const wordScale=Math.min(viewport.width/534,viewport.height/107);
    const bounds={width:534*wordScale,height:107*wordScale,left:viewport.left+(viewport.width-534*wordScale)/2,top:viewport.top+(viewport.height-107*wordScale)/2};
    const screenScale=Math.max(innerWidth/bounds.width,innerHeight/bounds.height)*1.35;
    let snapshotStarted=false;
    const draw=now=>{
      if(token!==generation||!layer)return;
      if(document.hidden){stop();return;}
      const t=(now-started)/1000,u=Math.min(1,(now-started)/duration);
      const fade=Math.min(1,t/.45,Math.max(0,(10-t)/1));
      if(name==='dissolve'){
        const black=t>=3.2&&t<6.4;
        const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
        let erosion=t<3.2?smooth(t/3.2):t<6.4?1-smooth((t-3.2)/3.2):1-smooth((t-6.4)/1.6);
        const phase=t<3.2?'logo-out':t<6.4?'background-out':'logo-return';
        wrap.dataset.dissolvePhase=phase;
        // Keep the revealed black silhouette underneath the returning pigment.
        blackBase.setAttribute('opacity',t>=6.4?'1':'0');
        main.querySelector('rect').setAttribute('fill',black?'#000':'url(#material-pigment)');
        layer.querySelector('#material-erosion feFlood').setAttribute('flood-color',black?'#000':accent);
        main.setAttribute('opacity','1');
        if(t>=3.2&&!snapshotStarted){
          snapshotStarted=true;
          const root=document.documentElement;
          root.style.setProperty('--logo-snapshot-x',`${bounds.left}px`);root.style.setProperty('--logo-snapshot-y',`${bounds.top}px`);
          root.style.setProperty('--logo-snapshot-w',`${bounds.width}px`);root.style.setProperty('--logo-snapshot-h',`${bounds.height}px`);
          if(document.startViewTransition){
            // Capture the empty screen; reveal black only inside the original wordmark silhouette.
            main.setAttribute('opacity','0');root.dataset.logoSnapshot='true';
            snapshot=document.startViewTransition(()=>{if(token!==generation)return;main.setAttribute('opacity','1');threshold.setAttribute('values','0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 1');});
            snapshot.ready.then(()=>layer?.querySelector('.snapshot-erosion-clock')?.beginElement()).catch(()=>{});
            snapshot.finished.finally(()=>{delete root.dataset.logoSnapshot;snapshot=null;});
          }
        }
        if(black&&snapshot)erosion=0;
        const handoff=smooth((t-8)/.6);
        wrap.style.setProperty('--material-return',String(handoff));
        layer.style.opacity=String(1-handoff);
        threshold.setAttribute('values',`0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 ${1-erosion*11}`);
      }else{
        // Successive continuous contours pass behind the intact surface like expanding pressure fronts.
        // The original stays still; each contour travels out once and fades there.
        echoes.forEach((g,i)=>{
          const phase=Math.max(0,Math.min(1,(t-i*.22)/(6.5-i*.22)));
          const spread=1-Math.pow(1-phase,2);
          g.setAttribute('transform',`translate(267 53.5) scale(${1+spread*.35}) translate(-267 -53.5)`);
          g.setAttribute('opacity',String(Math.pow(Math.sin(Math.PI*phase),2)*.48));
        });
      }
      if(u>=1){stop();return;}frame=requestAnimationFrame(draw);
    };
    draw(performance.now());deadline=setTimeout(stop,duration+150);
  };
  window.inteonLogoMaterials={run,stop};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('resize',stop);window.addEventListener('pagehide',stop);
})();
