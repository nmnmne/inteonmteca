/* Exclusive mobile scatter / dissolve / recursion, weighted 5 : 5 : 1. */
(() => {
 const createMobileLogoCycle = () => {
  const slots = ['scatter','dissolve','scatter','dissolve','scatter','dissolve','scatter','dissolve','scatter','dissolve','recursion'];
  let index = 0;
  return {peek: () => slots[index], advance: () => {index = (index + 1) % slots.length;}};
 };
 const mobile=matchMedia('(max-width:800px), (pointer:coarse)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const wrap=document.querySelector('#logo-wrap');if(!wrap)return;
 const root=document.documentElement;
 const readLevel=()=>Math.max(1,Math.min(10,Math.round(Number(root.dataset.graphicsLevel)||(root.dataset.animationQuality==='low'?4:8))));
 const motionTimeout=(fn,delay)=>window.inteonHomeEffects?.setMotionTimeout?window.inteonHomeEffects.setMotionTimeout(fn,delay):setTimeout(fn,delay);
 const clearMotionTimeout=id=>{if(window.inteonHomeEffects?.clearMotionTimeout)window.inteonHomeEffects.clearMotionTimeout(id);else clearTimeout(id);};
 let timer=0,end=0,layer=null,active=false,generation=0,animations=[];
 const cycle = createMobileLogoCycle();
 const heldAnimations=new Set();
 const syncMotion=()=>{for(const animation of animations){if(window.inteonHomeEffects?.suspended){if(animation.playState==='running'){animation.pause();heldAnimations.add(animation);}}else if(heldAnimations.delete(animation)&&animation.playState==='paused')animation.play();}};
 const eligible=()=>mobile.matches&&!reduced.matches&&!document.hidden;
 const schedule=(delay=12000)=>{clearMotionTimeout(timer);if(eligible())timer=motionTimeout(run,delay);};
 const stop=()=>{generation++;clearMotionTimeout(timer);timer=0;clearTimeout(end);end=0;if(active&&wrap.dataset.mobileEffect==='dissolve')window.inteonLogoAcid?.stop();if(active&&wrap.dataset.mobileEffect==='recursion')window.inteonLogoMaterials?.stop();animations.forEach(a=>a.cancel());animations=[];heldAnimations.clear();layer?.remove();layer=null;active=false;delete wrap.dataset.mobileEffect;window.inteonHomeEffects?.setLogoScattered?.('mobile-scatter',false);window.inteonHomeEffects?.release('mobile-scatter');};
 const run=(requested)=>{
  clearMotionTimeout(timer);timer=0;
  if(!eligible())return false;
  if(active||window.inteonHomeEffects?.active){schedule(1500);return false;}
  const name=typeof requested==='string'?requested:cycle.peek();
  if(!['scatter','dissolve','recursion'].includes(name)){schedule();return false;}
  if(name!=='scatter'){
   const effect=name==='dissolve'?window.inteonLogoAcid?.run({preview:true}):window.inteonLogoMaterials?.run('recursion');
   if(!effect){schedule(1500);return false;}
   if(typeof requested!=='string')cycle.advance();active=true;wrap.dataset.mobileEffect=name;
   const token=generation;
   effect.then(()=>{if(token!==generation)return;active=false;delete wrap.dataset.mobileEffect;schedule();});return true;
  }
  if(!window.inteonHomeEffects?.claim('mobile-scatter')){schedule(1500);return;}
  if(typeof requested!=='string')cycle.advance();active=true;wrap.dataset.mobileEffect='scatter';
  window.inteonHomeEffects?.setLogoScattered?.('mobile-scatter',true);
  const level=readLevel(),detail=(level-1)/9,cols=Math.round(4+8*detail),rows=Math.round(2+detail);
  layer=document.createElement('div');layer.className='mobile-logo-shards';layer.setAttribute('aria-hidden','true');
  Object.assign(layer.dataset,{graphicsLevel:String(level),pieces:String(cols*rows)});
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const p=document.createElement('i');p.style.cssText=`left:${x/cols*100}%;top:${y/rows*100}%;width:${100/cols}%;height:${100/rows}%;background-size:${cols*100}% ${rows*100}%;background-position:${x/(cols-1)*100}% ${y/(rows-1)*100}%;filter:brightness(var(--logo-brightness));`;
   const dx=(Math.random()-.5)*48,dy=(Math.random()-.5)*42,angle=(Math.random()-.5)*70;
   layer.append(p);
   animations.push(p.animate([{transform:'none',opacity:0},{transform:`translate(${dx}px,${dy}px) rotate(${angle}deg)`,opacity:1,offset:.32},{transform:`translate(${dx*.8}px,${dy*.8}px) rotate(${angle*.8}deg)`,opacity:1,offset:.7},{transform:'none',opacity:0}],{duration:4200,easing:'ease-in-out'}));
  }
  wrap.append(layer);syncMotion();end=setTimeout(()=>{stop();schedule();},4300);return true;
 };
 const sync=()=>{stop();if(!mobile.matches) return;window.inteonLogoStorm?.stop();window.inteonLogoMaterials?.stop();window.inteonAtmosphere?.stopScene();schedule(2200);};
 mobile.addEventListener('change',sync);reduced.addEventListener('change',sync);
 document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',sync);
 const recover=()=>{if(eligible()&&!active&&!timer)schedule(2200);};
 window.addEventListener('focus',recover);document.addEventListener('resume',recover);
 window.addEventListener('inteon-effects-change',()=>{if(window.inteonHomeEffects?.suspended)stop();else syncMotion();});
 window.inteonMobileLogo={run,stop};sync();
})();
