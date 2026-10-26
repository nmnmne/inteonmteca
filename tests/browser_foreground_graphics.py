"""Foreground scene allocations at graphics 1/5/10, timing and live-scene stability."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / 'artifacts' / 'foreground-graphics'
OUT.mkdir(parents=True, exist_ok=True)
INIT = r"""(() => {
  const d=new Date();localStorage.setItem('inteonmteca-theme-duration','604800000');
  localStorage.setItem('inteonmteca-theme-duration-day',`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`);
  sessionStorage.setItem('inteon-storm-last',String(Date.now()));
  window.__sceneAlloc={canvases:0,paths:0,timeouts:[]};
  const create=document.createElement.bind(document);
  document.createElement=function(tag,...args){if(String(tag).toLowerCase()==='canvas')__sceneAlloc.canvases++;return create(tag,...args);};
  const Path=window.Path2D;
  window.Path2D=new Proxy(Path,{construct(target,args){__sceneAlloc.paths++;return Reflect.construct(target,args);}});
  const timeout=window.setTimeout;
  window.setTimeout=function(fn,delay,...args){if(String(new Error().stack).includes('logo-acid.js'))__sceneAlloc.timeouts.push(delay);return timeout(fn,delay,...args);};
})();"""
STOP = """() => {
  inteonMobileLogo?.stop();inteonLogoStorm?.stop();inteonLogoAcid?.stop();
  inteonLogoMaterials?.stop();inteonAtmosphere?.stop();inteonThemeMorph?.finish();
}"""
ACID = """level => {
  const before={...__sceneAlloc};
  const promise=inteonLogoAcid.run();if(!promise)throw Error('acid did not start');
  const node=document.querySelector('.logo-acid');
  const result={level,data:{...node.dataset},width:node.width,height:node.height,canvases:__sceneAlloc.canvases-before.canvases,paths:__sceneAlloc.paths-before.paths,deadline:__sceneAlloc.timeouts.at(-1)};
  inteonGraphicsQuality.setManualLevel(level===10?1:10);
  result.sameScene=node===document.querySelector('.logo-acid')&&node.dataset.graphicsLevel===String(level);
  inteonLogoAcid.stop();return result;
}"""
STORM = """level => {
  inteonGraphicsQuality.setManualLevel(level);inteonLogoStorm.replay();
  const node=document.querySelector('.logo-storm'),pieces=[...document.querySelectorAll('.logo-storm-piece')];
  const durations=pieces.flatMap(p=>p.getAnimations().map(a=>a.effect.getTiming().duration));
  const result={level,count:pieces.length,animations:durations.length,minDuration:Math.min(...durations),maxDuration:Math.max(...durations),paths:node.querySelectorAll('path').length,segments:[...node.querySelectorAll('path')].reduce((n,p)=>n+(p.getAttribute('d').match(/L/g)||[]).length,0),constantInk:pieces.every(p=>p.style.filter==='brightness(0) invert(1)')};
  inteonGraphicsQuality.setManualLevel(level===10?1:10);
  result.sameScene=node===document.querySelector('.logo-storm')&&pieces.length===document.querySelectorAll('.logo-storm-piece').length;
  inteonLogoStorm.stop();return result;
}"""
ATMOSPHERE = """level => {
  inteonGraphicsQuality.setManualLevel(level);inteonAtmosphere.replayScene({preview:true});
  const node=document.querySelector('.scene-digits');
  const result={level,digits:node.children.length};
  inteonGraphicsQuality.setManualLevel(level===10?1:10);
  result.sameScene=node===document.querySelector('.scene-digits')&&node.dataset.graphicsLevel===String(level);
  inteonAtmosphere.stop();inteonGraphicsQuality.setManualLevel(level);inteonAtmosphere.replayCloud({preview:true});
  const cloud=document.querySelector('.sky-clouds');
  result.octaves=Number(cloud.querySelector('feTurbulence').getAttribute('numOctaves'));
  result.blur=cloud.querySelector('svg').style.filter;
  inteonGraphicsQuality.setManualLevel(level===10?1:10);
  result.sameCloud=cloud===document.querySelector('.sky-clouds')&&cloud.dataset.graphicsLevel===String(level);
  inteonAtmosphere.stop();return result;
}"""
MOBILE = """level => {
  inteonGraphicsQuality.setManualLevel(level);inteonMobileLogo.run();
  const node=document.querySelector('.mobile-logo-shards');if(!node)throw Error('mobile scatter did not start');
  const durations=[...node.children].flatMap(p=>p.getAnimations().map(a=>a.effect.getTiming().duration));
  const result={level,count:node.children.length,durations:[...new Set(durations)]};
  inteonGraphicsQuality.setManualLevel(level===10?1:10);
  result.sameScene=node===document.querySelector('.mobile-logo-shards')&&node.dataset.graphicsLevel===String(level);
  inteonMobileLogo.stop();return result;
}"""

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
    report={'desktop':[],'mobile':[],'errors':[]}
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,device_scale_factor=2)
        context.add_init_script(INIT)
        def route(r):
            if r.request.method not in ('GET','HEAD','OPTIONS'):r.abort();return
            if '/api/chat' in r.request.url:r.fulfill(json={'messages':[]});return
            r.continue_()
        context.route('**/*',route)
        page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
        for level in [1,5,10]:
            # Fresh mobile scheduler ensures its first natural variant is scatter.
            page.goto('http://127.0.0.1:8080/',wait_until='networkidle');page.evaluate(STOP)
            page.evaluate('(n)=>inteonGraphicsQuality.setManualLevel(n)',level)
            acid=page.evaluate(ACID,level)
            assert acid['canvases']==int(acid['data']['tiles'])+2,acid
            assert acid['paths']==int(acid['data']['tiles'])*int(acid['data']['holesPerTile']),acid
            assert acid['deadline']==11850 and acid['sameScene'],acid
            row={'level':level,'acid':acid}
            if mobile:
                row['scatter']=page.evaluate(MOBILE,level)
                assert row['scatter']['durations']==[4200] and row['scatter']['sameScene'],row
            else:
                row['storm']=page.evaluate(STORM,level)
                assert abs(row['storm']['maxDuration']-27580)<.01 and abs(row['storm']['minDuration']-7250)<.01,row
                assert row['storm']['animations']==row['storm']['count'] and row['storm']['constantInk'] and row['storm']['sameScene'],row
                row['atmosphere']=page.evaluate(ATMOSPHERE,level)
                assert row['atmosphere']['sameScene'] and row['atmosphere']['sameCloud'],row
            report['mobile' if mobile else 'desktop'].append(row)
        context.close()
    browser.close()
    for kind in ['desktop','mobile']:
        rows=report[kind]
        assert all(int(a['acid']['data']['tiles'])<int(b['acid']['data']['tiles']) for a,b in zip(rows,rows[1:])),rows
        assert all(a['acid']['paths']<b['acid']['paths'] for a,b in zip(rows,rows[1:])),rows
    assert [r['storm']['count'] for r in report['desktop']]==[12,44,108]
    assert [r['scatter']['count'] for r in report['mobile']]==[8,16,36]
    assert [r['atmosphere']['digits'] for r in report['desktop']]==[6,18,34]
    assert [r['atmosphere']['octaves'] for r in report['desktop']]==[1,2,3]
    assert not report['errors'],report['errors']
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False),flush=True)
