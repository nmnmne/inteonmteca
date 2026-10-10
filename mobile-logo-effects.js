/* Two bounded mobile effects, with no idle rendering loop. */
(() => {
 const mobile=matchMedia('(max-width:800px), (pointer:coarse)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const wrap=document.querySelector('#logo-wrap');if(!wrap)return;
 let timer=0,end=0,layer=null,variant=0,active=false;
 const eligible=()=>mobile.matches&&!reduced.matches&&!document.hidden;
 const schedule=(delay=12000)=>{clearTimeout(timer);if(eligible())timer=setTimeout(run,delay);};
 const stop=()=>{clearTimeout(timer);clearTimeout(end);layer?.remove();layer=null;active=false;delete wrap.dataset.mobileEffect;window.inteonHomeEffects?.release('mobile-scatter');};
 const run=()=>{
  if(!eligible())return;
  if(active||window.inteonHomeEffects?.active){schedule(1500);return;}
  if(variant++%2){
   const acid=window.inteonLogoAcid?.run({preview:true});
   if(!acid){schedule(1500);return;}
   active=true;wrap.dataset.mobileEffect='acid';
   acid.then(()=>{active=false;delete wrap.dataset.mobileEffect;schedule();});return;
  }
  if(!window.inteonHomeEffects?.claim('mobile-scatter')){schedule(1500);return;}
  active=true;wrap.dataset.mobileEffect='scatter';
  layer=document.createElement('div');layer.className='mobile-logo-shards';layer.setAttribute('aria-hidden','true');
  for(let y=0;y<3;y++)for(let x=0;x<12;x++){
   const p=document.createElement('i');p.style.cssText=`left:${x/12*100}%;top:${y/3*100}%;width:${100/12}%;height:${100/3}%;background-size:1200% 300%;background-position:${x/11*100}% ${y/2*100}%;filter:brightness(var(--logo-brightness));`;
   const dx=(Math.random()-.5)*48,dy=(Math.random()-.5)*42,angle=(Math.random()-.5)*70;
   layer.append(p);
   p.animate([{transform:'none',opacity:0},{transform:`translate(${dx}px,${dy}px) rotate(${angle}deg)`,opacity:1,offset:.32},{transform:`translate(${dx*.8}px,${dy*.8}px) rotate(${angle*.8}deg)`,opacity:1,offset:.7},{transform:'none',opacity:0}],{duration:4200,easing:'ease-in-out'});
  }
  wrap.append(layer);end=setTimeout(()=>{stop();schedule();},4300);
 };
 const sync=()=>{stop();if(!mobile.matches) return;window.inteonLogoStorm?.stop();window.inteonLogoMaterials?.stop();window.inteonAtmosphere?.stopScene();schedule(2200);};
 mobile.addEventListener('change',sync);reduced.addEventListener('change',sync);
 document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',sync);
 window.inteonMobileLogo={run,stop};sync();
})();
