"""Observe natural logo cycles without scene claims or forced effect replay.

Uses real wall-clock delays, seeded randomness and isolated browser storage.
Desktop starts idle to observe its scheduled acid loop; mobile plays real audio.
All screenshots/observations stay under tests/artifacts/logo-natural-cycles/.
Run sequentially after obtaining the shared browser profiling slot.
"""
import argparse
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parent/'artifacts'/'logo-natural-cycles'
INIT=r"""(() => {
  let seed=1234567;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  window.logoCycleAudit={samples:[],events:[],draws:{}};
  const a=window.logoCycleAudit;
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){const c=this.canvas;if(c.classList.contains('logo-ripples')||c.classList.contains('logo-acid')||c.id==='logo-reactive-canvas')a.draws[c.id||c.className]=(a.draws[c.id||c.className]||0)+1;return clear.apply(this,args);};
  for(const name of ['inteon-ambient-change','inteon-effects-change','inteon-storm','inteon-interlude'])window.addEventListener(name,e=>a.events.push({at:performance.now(),event:name,detail:e.detail,owner:window.inteonHomeEffects?.active,phase:document.documentElement.dataset.ambientPhase}));
  document.addEventListener('DOMContentLoaded',()=>{
    const logo=document.querySelector('#logo-wrap'),surface=document.querySelector('#reactive-logo');
    let previous='';
    function sample(){
      const css=surface&&getComputedStyle(surface),rect=logo?.getBoundingClientRect();
      const state={at:performance.now(),phase:document.documentElement.dataset.ambientPhase,owner:window.inteonHomeEffects?.active,classes:logo?.className,acid:logo?.dataset.acidPhase,mobileEffect:logo?.dataset.mobileEffect,cycle:typeof logoCycleVariant==='undefined'?null:logoCycleVariant,draws:{...a.draws},rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,opacity:css?.opacity,visibility:css?.visibility,display:css?.display,animation:surface?.getAnimations().map(x=>({name:x.animationName||x.constructor.name,time:x.currentTime,state:x.playState})),acidCanvas:Boolean(document.querySelector('.logo-acid')),mobileShards:document.querySelectorAll('.mobile-logo-shards i').length,storm:document.querySelector('.logo-storm')?.dataset.phase,theme:document.documentElement.dataset.theme,audioTime:document.querySelector('#album-player')?.currentTime};
      a.samples.push(state);
      const signature=JSON.stringify([state.owner,state.acid,state.mobileEffect,state.cycle,state.classes,state.storm]);
      if(signature!==previous){previous=signature;a.events.push({event:'logo-state',...state});}
    }
    sample();a.timer=setInterval(sample,200);
  });
})();"""


def summarize(data,mobile):
    samples=data['samples'];states=[e for e in data['events'] if e['event']=='logo-state']
    phase_edges=[e['at'] for e in data['events'] if e['event']=='inteon-ambient-change']
    acid=[s for s in samples if s.get('acidCanvas')]
    first_end=None
    if acid:
        first_start=acid[0]['at']
        first_end=next((s for s in samples if s['at']>first_start and not s['acidCanvas']),None)
    after_acid=[s for s in samples if first_end and s['at']>first_end['at']]
    animation_running=0;animation_frozen=0;freeze_violations=[];frozen_draws=[];running_draws=0
    for a,b in zip(samples,samples[1:]):
        if a['phase']!=b['phase'] or a['owner']!=b['owner'] or a['owner']=='acid':continue
        interior=a['at']-max((t for t in phase_edges if t<=a['at']),default=0)>120
        delta=sum(b['draws'].get(k,0)-a['draws'].get(k,0) for k in ['logo-ripples','logo-reactive-canvas'])
        if a['phase']=='frozen' and interior and delta:frozen_draws.append({'a':a['at'],'b':b['at'],'draws':delta})
        elif a['phase']=='running':running_draws+=delta
        if not a.get('animation') or not b.get('animation'):continue
        for x,y in zip(a['animation'],b['animation']):
            if x['name']!=y['name'] or x['time'] is None or y['time'] is None:continue
            if a['phase']=='running' and y['time']>x['time']:animation_running+=1
            elif a['phase']=='frozen' and x['state']=='paused' and y['state']=='paused' and interior:
                animation_frozen+=1
                if abs(y['time']-x['time'])>1:freeze_violations.append({'a':a['at'],'b':b['at'],'delta':y['time']-x['time']})
    return {'mobile':mobile,'sampleCount':len(samples),'naturalAcidObserved':bool(acid),'acidPhases':sorted({s.get('acid') for s in acid if s.get('acid')}),'firstAcidReturnAtMs':first_end['at'] if first_end else None,'cycleAfterAcid':max([s.get('cycle') or 0 for s in after_acid],default=0),'cycleAtAcidReturn':first_end.get('cycle') if first_end else None,'naturalMobileScatterObserved':any(s.get('mobileShards',0)>0 for s in samples),'mobileScatterAfterAcid':any(s.get('mobileShards',0)>0 for s in after_acid),'visibleSamples':sum(s.get('opacity')!='0' and s.get('visibility')=='visible' and s.get('rect',{}).get('width',0)>0 for s in samples),'animationRunningIntervals':animation_running,'animationFrozenIntervals':animation_frozen,'cssFreezeViolations':freeze_violations,'frozenAmbientDrawViolations':frozen_draws,'runningAmbientDraws':running_draws,'last':samples[-1] if samples else None}


def run(browser,mobile,args):
    label='mobile' if mobile else 'desktop';folder=OUT/label;folder.mkdir(parents=True,exist_ok=True)
    context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
    context.add_init_script(INIT)
    def route(r):
        if r.request.method not in ('GET','HEAD','OPTIONS'):r.abort();return
        if '/api/chat' in r.request.url:r.fulfill(json={'messages':[]});return
        r.continue_()
    context.route('**/*',route)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.url,wait_until='networkidle')
    if mobile or args.play_desktop:
        page.evaluate("()=>window.inteonPlayTrack(window.INTEONMTECA_PLAYLIST.find(t=>t.title==='Слишком холод')||window.INTEONMTECA_PLAYLIST[0])")
        page.wait_for_function("document.querySelector('#album-player').currentTime>0")
    captured=set();start=time.monotonic();last_notice=start
    while time.monotonic()-start<args.seconds:
        state=page.evaluate("({owner:inteonHomeEffects.active,phase:document.documentElement.dataset.ambientPhase,acid:document.querySelector('#logo-wrap').dataset.acidPhase,mobileEffect:document.querySelector('#logo-wrap').dataset.mobileEffect,cycle:typeof logoCycleVariant==='undefined'?null:logoCycleVariant,storm:document.querySelector('.logo-storm')?.dataset.phase})")
        shot=state.get('acid') or state.get('mobileEffect') or state.get('storm') or 'base'
        if shot not in captured and len(captured)<9:
            captured.add(shot);page.screenshot(path=str(folder/f'{shot}.png'))
        if time.monotonic()-last_notice>=20:
            print(json.dumps({'case':label,'elapsed':round(time.monotonic()-start),'state':state}),flush=True);last_notice=time.monotonic()
        page.wait_for_timeout(250)
    page.screenshot(path=str(folder/'final.png'))
    data=page.evaluate('logoCycleAudit');summary=summarize(data,mobile);summary['errors']=errors
    data.update({'summary':summary,'settings':vars(args),'screenshots':sorted(captured),'errors':errors})
    (folder/'report.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False),flush=True)
    context.close()
    assert not errors,errors
    assert summary['animationRunningIntervals']>0,summary
    assert summary['animationFrozenIntervals']>0,summary
    assert not summary['cssFreezeViolations'],summary
    assert not summary['frozenAmbientDrawViolations'],summary
    if mobile:
        assert summary['naturalMobileScatterObserved'] and summary['naturalAcidObserved'],summary
        assert summary['mobileScatterAfterAcid'],summary
    else:
        assert summary['naturalAcidObserved'] and summary['firstAcidReturnAtMs'],summary
        assert summary['cycleAfterAcid']>summary['cycleAtAcidReturn'],summary


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8080/');parser.add_argument('--case',choices=['desktop','mobile','both'],default='both');parser.add_argument('--seconds',type=int,default=75);parser.add_argument('--play-desktop',action='store_true');args=parser.parse_args()
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
        for mobile in (False,True):
            if args.case in ('both','mobile' if mobile else 'desktop'):run(browser,mobile,args)
        browser.close()
