"""Validate letter cadence with the site's real audio graph and controlled signals."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / 'artifacts' / 'text-audio-motion'
OUT.mkdir(parents=True, exist_ok=True)

def sample(page, milliseconds):
    return page.evaluate('''ms => new Promise(resolve => {
      const samples=[],start=performance.now(),first=inteonTextMotion.updates;
      const read=()=>{
        const signal=inteonAudioBands.read();
        samples.push({at:performance.now()-start,target:inteonTextMotion.targetFps,mid:signal.mid,bass:signal.bass,burst:inteonTextMotion.burst,heavyRest:inteonHomeEffects.ambientPaused});
        if(performance.now()-start<ms)setTimeout(read,40);
        else resolve({samples,updates:inteonTextMotion.updates-first,elapsedMs:performance.now()-start});
      };read();
    })''',milliseconds)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/api/chat',lambda route:route.fulfill(json={'messages':[]}))
    page.add_init_script('''{
      window.__audioContexts=0;
      const Native=window.AudioContext;
      if(Native)window.AudioContext=new Proxy(Native,{construct(target,args){window.__audioContexts++;return Reflect.construct(target,args)}});
    }''')
    page.goto('http://127.0.0.1:8080/',wait_until='networkidle')
    page.wait_for_function('window.inteonTextMotion && window.inteonAudioBands')
    page.evaluate("inteonMobileLogo?.stop();inteonLogoStorm?.stop();inteonAtmosphere?.stop();inteonLogoAcid?.stop();inteonThemeMorph?.finish();inteonHomeEffects.claim('audit')")
    silence=sample(page,900)
    assert all(s['target']==44 and s['burst']==0 for s in silence['samples']),silence
    assert silence['updates']>0
    page.evaluate("inteonPlayTrack(INTEONMTECA_PLAYLIST.find(track=>track.title==='Слишком холод')||INTEONMTECA_PLAYLIST[0])")
    page.wait_for_function("document.querySelector('#album-player').currentTime>0")
    page.evaluate("document.querySelector('#album-player').currentTime=20")
    page.wait_for_timeout(300)
    real=sample(page,5000)
    assert max(s['mid'] for s in real['samples'])>.02,real
    assert max(s['bass'] for s in real['samples'])>.02,real
    assert max(s['target'] for s in real['samples'])>50,real
    assert max(s['target'] for s in real['samples'])-min(s['target'] for s in real['samples'])>1,real
    assert page.evaluate('__audioContexts')==1
    page.evaluate("document.querySelector('#album-player').pause()")
    page.wait_for_function('inteonTextMotion.targetFps===44')
    paused=sample(page,500)
    assert all(s['target']==44 for s in paused['samples'])

    # Synthetic input exercises extremes without constructing another audio graph.
    page.evaluate('''() => {
      window.__realAudioBands=inteonAudioBands;
      window.__testSignal={playing:true,mid:.15,bass:.03};
      window.inteonAudioBands=Object.freeze({read:()=>__testSignal});
    }''')
    page.wait_for_timeout(700)
    medium=sample(page,400)
    page.evaluate('__testSignal.bass=.9')
    page.wait_for_function('inteonTextMotion.burst>.4')
    peak=page.evaluate('({target:inteonTextMotion.targetFps,burst:inteonTextMotion.burst})')
    page.wait_for_timeout(260)
    assert page.evaluate('inteonTextMotion.burst')==0
    assert page.evaluate('inteonTextMotion.targetFps')<peak['target']
    page.evaluate('__testSignal.mid=1')
    page.wait_for_function('inteonTextMotion.targetFps>143.99')
    maximum=sample(page,1000)
    assert all(s['target']>143.99 for s in maximum['samples']),maximum
    assert maximum['updates']>0
    assert page.evaluate('__audioContexts')==1
    page.evaluate('window.inteonAudioBands=__realAudioBands')
    page.wait_for_function('inteonTextMotion.targetFps===44')
    page.screenshot(path=str(OUT/'desktop.png'))
    report={'silence':silence,'realTrack':real,'paused':paused,'syntheticMedium':medium,'bassPeak':peak,'maximum':maximum,'audioContexts':page.evaluate('__audioContexts'),'errors':errors}
    assert not errors,errors
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'audioContexts':report['audioContexts'],'realTargetRange':[min(s['target'] for s in real['samples']),max(s['target'] for s in real['samples'])],'silenceTarget':silence['samples'][-1]['target'],'maxTarget':maximum['samples'][-1]['target'],'bassPeak':peak,'actualMaxUpdatesPerSecond':maximum['updates']/(maximum['elapsedMs']/1000),'errors':errors},ensure_ascii=False))
    browser.close()
