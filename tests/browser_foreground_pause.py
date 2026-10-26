"""Real ten-second foreground holds, retained pixels/WAAPI time and smooth resume."""
import json
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).parent/'artifacts'/'foreground-pause'
OUT.mkdir(parents=True,exist_ok=True)
INIT=r"""(() => {
  const d=new Date();localStorage.setItem('inteonmteca-theme-duration','604800000');
  localStorage.setItem('inteonmteca-theme-duration-day',`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`);
  sessionStorage.setItem('inteon-storm-last',String(Date.now()));
  window.__pauseQA={acidFrames:0,acidClears:0,acidDraws:0,edges:[]};
  const raf=requestAnimationFrame,origins=new WeakMap();
  window.requestAnimationFrame=fn=>{
    if(!origins.has(fn))origins.set(fn,String(new Error().stack).includes('logo-acid.js'));
    return raf(now=>{if(origins.get(fn))__pauseQA.acidFrames++;fn(now);});
  };
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('logo-acid'))__pauseQA.acidClears++;return clear.apply(this,args);};
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.classList.contains('logo-acid'))__pauseQA.acidDraws++;return draw.apply(this,args);};
  addEventListener('inteon-ambient-change',()=>__pauseQA.edges.push({at:performance.now(),phase:document.documentElement.dataset.ambientPhase,state:document.documentElement.dataset.logoMotion}));
})();"""
BEGIN=r"""kind=>{
  if(typeof cancelLogoTimers==='function')cancelLogoTimers();
  inteonMobileLogo?.stop();inteonLogoStorm?.stop();inteonLogoAcid?.stop();
  inteonLogoMaterials?.stop();inteonAtmosphere?.stop();inteonThemeMorph?.finish();
  if(typeof renderLogoMatrix==='function')renderLogoMatrix(true);
  if(typeof cancelLogoTimers==='function')cancelLogoTimers();
  inteonHomeEffects.setLogoScattered('particles',false);
  inteonGraphicsQuality.setManualLevel(1);
  __pauseQA.edges=[];
  const at=performance.now();
  if(kind==='acid') {if(!inteonLogoAcid.run())throw Error('acid did not start');}
  else if(kind==='storm')inteonLogoStorm.replay();
  else inteonMobileLogo.run();
  const selector=kind==='acid'?'.logo-acid':kind==='storm'?'.storm-inversion-shards':'.mobile-logo-shards';
  window.__heldScene=document.querySelector(selector);
  if(!__heldScene)throw Error(kind+' layer missing');
  window.__heldSelector=selector;
  window.__ownedAnimations=kind==='acid'?[]:[...__heldScene.querySelectorAll(kind==='storm'?'.logo-storm-piece':'i')].flatMap(e=>e.getAnimations());
  if(kind==='storm')__ownedAnimations.push(...document.querySelector('.logo-storm').getAnimations({subtree:true}));
  return {at,kind,ownedAnimations:__ownedAnimations.length};
}"""
SNAP=r"""()=>{
  const node=__heldScene,style=getComputedStyle(node);
  let hash=null,bitmap=null;
  if(node.tagName==='CANVAS'){
    const first=node.getContext('2d').getImageData(0,0,node.width,node.height).data;
    // The first GPU readback can round a few color channels by one; warm it,
    // then compare the stable byte buffer without relaxing the hold assertion.
    const pixels=node.getContext('2d').getImageData(0,0,node.width,node.height).data;
    const hashPixels=p=>{let v=2166136261;for(let i=0;i<p.length;i++){v^=p[i];v=Math.imul(v,16777619);}return v>>>0;};hash=hashPixels(pixels);
    let changed=0,maxDelta=0;if(window.__lastPixels?.length===pixels.length)for(let i=0;i<pixels.length;i++)if(pixels[i]!==__lastPixels[i]){changed++;maxDelta=Math.max(maxDelta,Math.abs(pixels[i]-__lastPixels[i]));}
    bitmap={width:node.width,height:node.height,firstReadHash:hashPixels(first),changedChannels:changed,maxDelta,repeatHash:hashPixels(node.getContext('2d').getImageData(0,0,node.width,node.height).data)};window.__lastPixels=pixels;
  }
  return {at:performance.now(),clock:inteonHomeEffects.ambientNow(),phase:document.documentElement.dataset.ambientPhase,state:document.documentElement.dataset.logoMotion,
    owner:inteonHomeEffects.active,connected:node.isConnected,sameNode:node===document.querySelector(__heldSelector),hash,bitmap,
    acidFrames:__pauseQA.acidFrames,acidClears:__pauseQA.acidClears,acidDraws:__pauseQA.acidDraws,
    animations:__ownedAnimations.map(a=>({time:a.currentTime,playState:a.playState})),
    css:{translate:style.translate,scale:style.scale,opacity:style.opacity,animation:style.animationName},
    letters:inteonTextMotion.updates,glyphs:[...document.querySelectorAll('.text-wave-mask')].map(e=>e.dataset.glyph||'').join('')};
}"""

parser=argparse.ArgumentParser();parser.add_argument('--case',choices=['all','acid','storm','mobile'],default='all');args=parser.parse_args()
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
    results=[]
    for kind in ['acid','storm','mobile']:
        if args.case not in ('all',kind):continue
        mobile=kind=='mobile'
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
        context.add_init_script(INIT)
        def route(r):
            if r.request.method not in ('GET','HEAD','OPTIONS'):r.abort();return
            if '/api/chat' in r.request.url:r.fulfill(json={'messages':[]});return
            r.continue_()
        context.route('**/*',route)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8080/',wait_until='networkidle')
        started=page.evaluate(BEGIN,kind)
        page.wait_for_function("document.documentElement.dataset.logoMotion==='scattered'&&document.documentElement.dataset.ambientPhase==='frozen'",timeout=7000)
        page.wait_for_timeout(160)
        held_start=page.evaluate(SNAP)
        page.wait_for_timeout(8300)
        held_end=page.evaluate(SNAP)
        (OUT/(kind+'-hold-diagnostic.json')).write_text(json.dumps({'started':started,'heldStart':held_start,'heldEnd':held_end},ensure_ascii=False,indent=2),encoding='utf-8')
        assert held_start['phase']==held_end['phase']=='frozen',(kind,held_start,held_end)
        assert held_end['connected'] and held_end['sameNode'],(kind,held_end)
        assert held_end['clock']==held_start['clock'],(kind,held_start,held_end)
        assert held_start['css']!=held_end['css'] and held_end['css']['animation']=='held-logo-breath',(kind,held_start['css'],held_end['css'])
        assert held_end['letters']>held_start['letters'] and held_end['glyphs']!=held_start['glyphs'],kind
        if kind=='acid':
            assert held_end['at']-started['at']>11850,held_end
            assert held_end['hash']==held_start['hash'],(held_start['hash'],held_end['hash'])
            assert held_start['hash']==held_start['bitmap']['repeatHash'] and held_end['hash']==held_end['bitmap']['repeatHash']
            assert held_end['acidFrames']==held_start['acidFrames'] and held_end['acidClears']==held_start['acidClears'],(held_start,held_end)
            assert held_end['acidDraws']==held_start['acidDraws'],(held_start,held_end)
        else:
            assert held_start['animations'] and all(a['playState']=='paused' for a in held_start['animations']),held_start['animations']
            assert held_end['animations']==held_start['animations'],(kind,held_start['animations'],held_end['animations'])
            if mobile:assert held_end['at']-started['at']>4300,held_end
        page.wait_for_function("document.documentElement.dataset.ambientPhase==='running'",timeout=3000)
        page.wait_for_timeout(60 if mobile else 150)
        resumed=page.evaluate(SNAP)
        assert resumed['connected'] and resumed['sameNode'],(kind,resumed)
        assert 0<resumed['clock']-held_end['clock']<500,(kind,held_end,resumed)
        if kind=='acid':
            assert resumed['acidFrames']>held_end['acidFrames'] and resumed['hash']!=held_end['hash'],resumed
        else:
            assert all(0<b['time']-a['time']<500 for a,b in zip(held_end['animations'],resumed['animations'])),(kind,held_end['animations'],resumed['animations'])
        edges=page.evaluate('__pauseQA.edges')
        freeze=next(e for e in edges if e['phase']=='frozen')
        running=next(e for e in edges if e['phase']=='running' and e['at']>freeze['at'])
        assert 9900<running['at']-freeze['at']<10400,edges
        if mobile:
            page.wait_for_timeout(550)
            assert page.evaluate("!document.querySelector('.mobile-logo-shards')&&document.documentElement.dataset.logoMotion==='assembled'")
        result={'kind':kind,'started':started,'heldStart':held_start,'heldEnd':held_end,'resumed':resumed,'freezeDurationMs':running['at']-freeze['at'],'errors':errors}
        (OUT/(kind+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        assert not errors,errors
        print(json.dumps({'kind':kind,'freezeDurationMs':result['freezeDurationMs'],'stableForMs':held_end['at']-held_start['at'],'alivePastOldDeadlineMs':held_end['at']-started['at'],'canvasClears':held_end['acidClears']-held_start['acidClears'],'canvasDraws':held_end['acidDraws']-held_start['acidDraws'],'acidRafs':held_end['acidFrames']-held_start['acidFrames'],'ownedAnimations':len(held_end['animations']),'letterUpdates':held_end['letters']-held_start['letters'],'resumedActiveMs':resumed['clock']-held_end['clock'],'errors':errors}),flush=True)
        results.append(result);context.close()
    browser.close()
    (OUT/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
