"""Local visual/renderer evidence. Does not submit chat or change server state."""
import json
import statistics
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('tests/artifacts/left-room')
URL = 'http://127.0.0.1:8080/'
SIZES = [(1920,1080),(1440,900),(1280,720),(1024,768),(800,600),
         (768,1024),(640,800),(390,844),(375,667),(320,568),
         (360,540),(844,390),(667,375),(568,320)]
results = {'viewports': [], 'performance': []}

def open_page(browser, width, height, before=False):
    context = browser.new_context(viewport={'width':width,'height':height},
                                  is_mobile=width<=800 or height<450,
                                  has_touch=width<=800 or height<450)
    page = context.new_page()
    page.route('https://**/*', lambda route: route.abort())
    page.add_init_script('''
      localStorage.setItem('inteonmteca-theme', 'desert');
      localStorage.setItem('inteonmteca-theme-duration', '604800000');
      window.qaDraws=0;
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect=function(...a){
        qaDraws++; return clear.apply(this,a);
      };
    ''')
    if before:
        for name in (['index.html','styles.css','home-player.css','script.js'] + ([] if before else ['room-resident.js'])):
            data = (OUT.parent/"home-synthesis"/"start"/name).read_bytes()
            mime = 'text/html' if name.endswith('html') else 'text/css' if name.endswith('css') else 'text/javascript'
            def route_snapshot(route, request, data=data, mime=mime):
                route.fulfill(content_type=mime,body=data)
            page.route(URL if name=='index.html' else '**/'+name+'*',route_snapshot)
    page.goto(URL, wait_until='domcontentloaded')
    return context, page

def metrics(cdp):
    return {m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}

def measure(page, context, throttle=1):
    cdp = context.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate':throttle})
    cdp.send('Performance.enable')
    page.wait_for_timeout(3000)
    before = metrics(cdp)
    draws = page.evaluate('qaDraws')
    page.wait_for_timeout(3000)
    after = metrics(cdp)
    result = {k:round(after[k]-before[k],5) for k in
              ['TaskDuration','ScriptDuration','RecalcStyleDuration','LayoutCount']}
    result['canvasDraws'] = page.evaluate('qaDraws')-draws
    cdp.detach()
    return result

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge',headless=True)
    for width,height in SIZES:
        context,page = open_page(browser,width,height)
        errors = []
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.wait_for_timeout(650)
        geometry = page.evaluate('''() => {
          const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();
          return {logo:box('.logo-wrap'),intro:box('.listening-intro'),list:box('#track-list'),
            dock:box('#active-player'),street:box('#street-link'),auth:box('#auth-hint'),
            overflow:document.documentElement.scrollWidth>innerWidth};
        }''')
        def overlaps(a,b):
            return min(a['right'],b['right'])>max(a['left'],b['left'])+1 and min(a['bottom'],b['bottom'])>max(a['top'],b['top'])+1
        assert not geometry['overflow'], (width,height,geometry)
        assert geometry['list']['bottom']<=geometry['dock']['top']-5, geometry
        assert geometry['list']['height']>=60, geometry
        for target in ['intro','list','street','auth']:
            assert not overlaps(geometry['logo'],geometry[target]), (width,height,target,geometry)
        assert not errors, errors
        page.screenshot(path=str(OUT/f'final-{width}x{height}.png'))
        results['viewports'].append({'size':[width,height],'geometry':geometry,'errors':errors})
        context.close()
    (OUT/'audit-geometry.json').write_text(json.dumps(results['viewports'],indent=2))
    print('14 viewport geometry checks passed',flush=True)
    browser.close()
