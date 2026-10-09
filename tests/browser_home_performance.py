"""Local frame pacing and renderer workload; no cross-device FPS guarantee."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080/'
OUT = Path(__file__).parent / 'artifacts/home-optimization/after-performance.json'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for mobile in (False, True):
        context = browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900}, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        page.route('**/abacus.jasoncameron.dev/**', lambda r:r.fulfill(status=200,content_type='application/json',body='{"value":1234}'))
        page.add_init_script('''
          sessionStorage.setItem('inteon-storm-last',String(Date.now()));
          window.__draws={};
          const clear=CanvasRenderingContext2D.prototype.clearRect;
          CanvasRenderingContext2D.prototype.clearRect=function(...args){
            const name=this.canvas.className||this.canvas.id||'other';
            __draws[name]=(__draws[name]||0)+1;return clear.apply(this,args);
          };
        ''')
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_timeout(1300)
        cdp=context.new_cdp_session(page)
        cdp.send('Performance.enable')
        for state in ('idle','playing','storm','acid','suspended'):
            if state=='playing':
                page.locator('.track-select').first.click()
                page.wait_for_function('!!document.querySelector("audio") && !document.querySelector("audio").paused')
                page.wait_for_timeout(1200)
            if state=='storm':
                page.evaluate('inteonLogoAcid.stop(); inteonAtmosphere.stop(); inteonLogoStorm.replay()')
                page.wait_for_timeout(1100)
            if state=='acid':
                page.evaluate('inteonLogoStorm.stop(); inteonAtmosphere.stop(); void inteonLogoAcid.run()')
                page.wait_for_timeout(200)
            if state=='suspended':
                page.evaluate("inteonLogoAcid.stop(); inteonHomeEffects.claim('measurement')")
                page.wait_for_timeout(100)
            before={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
            draws=page.evaluate('({...__draws})')
            frames=page.evaluate('''() => new Promise(resolve=>{
              const times=[],start=performance.now();let last=start;
              function tick(now){times.push(now-last);last=now;if(now-start<3500)return requestAnimationFrame(tick);
                const sorted=times.slice(1).sort((a,b)=>a-b);
                resolve({frames:times.length,fps:times.length*1000/(now-start),median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],over25:sorted.filter(t=>t>25).length});}
              requestAnimationFrame(tick);
            })''')
            after={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
            end=page.evaluate('({...__draws})')
            metrics={k:round(after[k]-before[k],4) for k in ('TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount')}
            metrics.update(mobile=mobile,state=state,frames=frames,draws={k:v-draws.get(k,0) for k,v in end.items()},effect=page.evaluate('inteonHomeEffects.active'))
            results.append(metrics)
        context.close()
    browser.close()
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
