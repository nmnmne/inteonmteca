"""Astra browser evidence. Reuses existing player assertions without changing tests."""
import ast, json, os, sys, threading, tempfile, traceback
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).parent
sys.path.insert(0,str(ROOT))
from server.app import Store, make_handler
os.environ['INTEONMTECA_QUIET']='1'
scratch=tempfile.TemporaryDirectory(); store=Store(Path(scratch.name)/'qa.db')
class Quiet(make_handler(ROOT,store,None)):
    def do_GET(self):
        try: super().do_GET()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/'
source=ast.parse((ROOT/'tests/browser_vr_player.py').read_text(encoding='utf-8'))
for f in source.body:
    if isinstance(f,ast.FunctionDef): exec(compile(ast.Module(body=[f],type_ignores=[]),'existing-browser_vr_player.py','exec'))
INIT="""localStorage.setItem('inteonmteca-theme-duration','604800000');
window.audit={draw:0};for(const k of ['clearRect','drawImage','fillRect']){const f=CanvasRenderingContext2D.prototype[k];CanvasRenderingContext2D.prototype[k]=function(...a){audit.draw++;return f.apply(this,a)}};
"""
GEOMETRY="""() => {const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {player:rect('#active-player'),list:rect('#track-list'),intro:rect('.listening-intro'),logo:rect('#logo-wrap'),overflow:document.documentElement.scrollWidth>innerWidth,mode:document.documentElement.dataset.backgroundMode,theme:document.documentElement.dataset.theme};}"""
SIZES=[(1440,900,False),(1920,1080,False),(768,1024,True),(800,900,False),(801,900,False),(390,844,True),(320,740,True),(320,568,True),(844,390,True)]
candidate='--candidate' in sys.argv
results=[]; mode=sys.argv[1] if len(sys.argv)>1 else 'screens'
try:
    with sync_playwright() as p:
        for channel in (['msedge','chrome'] if mode=='full' else ['msedge']):
            browser=p.chromium.launch(headless=True,channel=channel)
            for width,height,touch in (SIZES if channel=='msedge' else [(1440,900,False),(390,844,True)]):
                LABEL=('candidate-' if candidate else '')+f'{channel}-{width}x{height}'
                print(LABEL,flush=True)
                ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=1)
                ctx.add_init_script(INIT)
                page=ctx.new_page(); errors=[]; responses=[]
                if candidate:
                    page.route(URL,lambda r:r.fulfill(body=(OUT/'astra-index.html').read_bytes(),content_type='text/html'))
                    for name,filename in [('home-player.css','astra-home-player.css'),('styles.css','before-styles.css'),('script.js','before-script.js')]:
                        page.route(f'**/{name}*',lambda r,request,n=filename:r.fulfill(body=(OUT/n).read_bytes(),content_type='text/css' if n.endswith('.css') else 'text/javascript'))
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('response',lambda r:responses.append(f'{r.status} {r.url}') if r.status>=400 else None)
                result={'browser':channel,'viewport':[width,height],'touch':touch,'errors':errors,'httpErrors':responses}; results.append(result)
                try:
                    page.goto(URL,wait_until='networkidle'); page.wait_for_timeout(700)
                    result['geometry']=page.evaluate(GEOMETRY)
                    page.screenshot(path=str(OUT/f'{LABEL}-idle.png'))
                    assert not result['geometry']['overflow']
                    assert result['geometry']['list']['bottom']<=result['geometry']['player']['y']-5
                    assert result['geometry']['list']['height']>=65
                    start=page.evaluate('audit.draw');page.wait_for_timeout(500);result['idleCanvasDraws']=page.evaluate('audit.draw')-start
                    if width<=800 or touch: assert result['idleCanvasDraws']==0
                    else: assert result['idleCanvasDraws']>0
                    if mode=='full':
                        result['existingPlayerChecks']=verify(page,ctx,width,height,touch)
                        if width <= 600 and height > 540:
                            page.emulate_media(reduced_motion='no-preference')
                            row=page.locator('.track-select').filter(has_text='Last Eclipse (Negative Space Resonance)').first
                            row.click();page.wait_for_function('!player.paused && player.currentTime>.1');page.wait_for_timeout(300)
                            page.screenshot(path=str(OUT/f'{LABEL}-long-title.png'))
                            copy=page.locator('.active-track-copy').bounding_box(); transport=page.locator('.transport').bounding_box()
                            assert copy['y']+copy['height'] <= transport['y']+2,(copy,transport)
                            result['longTitleFits']=True
                            page.locator('#immersive-play').click()
                            page.wait_for_function('player.paused')
                        page.reload(wait_until='networkidle');page.wait_for_timeout(300)
                        result['reloadState']=page.evaluate('({paused:player.paused,hasTrack:currentTrack!==null,origin:inteonPlayback.read()?.origin})')
                        assert not errors,errors
                except Exception as e:
                    result['failure']=str(e);result['traceback']=traceback.format_exc()
                    page.screenshot(path=str(OUT/f'{LABEL}-failure.png'))
                    print(result['traceback'],flush=True)
                (OUT/f'browser-{"candidate-" if candidate else ""}{mode}.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
                ctx.close()
            browser.close()
finally:
    server.shutdown();server.server_close();store.close();scratch.cleanup()
print('Results:',OUT/f'browser-{"candidate-" if candidate else ""}{mode}.json',flush=True)
sys.exit(any('failure' in r for r in results))
