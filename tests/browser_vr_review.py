"""Read-only homepage QA; independent ephemeral HTTP server, evidence outside repo."""
import json, threading, functools, hashlib, os, time
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('TEMP','.')) / ('inteon-vr-review-'+time.strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/'
report={'url':URL,'sourceHashes':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['index.html','styles.css','script.js']},'cases':[]}
INIT='''window.__qa={raf:0,draw:0,long:[],errors:[]};const r=requestAnimationFrame;window.requestAnimationFrame=function(cb){return r.call(window,t=>{__qa.raf++;cb(t)})};for(const k of ['clearRect','drawImage','fillRect']){const f=CanvasRenderingContext2D.prototype[k];CanvasRenderingContext2D.prototype[k]=function(...a){__qa.draw++;return f.apply(this,a)}};new PerformanceObserver(l=>__qa.long.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});'''
SNAP='''() => ({mode:document.documentElement.dataset.backgroundMode,quality:document.documentElement.dataset.animationQuality,width:innerWidth,docWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,logo:!!document.querySelector('#reactive-logo'),logoBackground:getComputedStyle(document.querySelector('#logo-wrap'),'::before').backgroundImage,canvases:[...document.querySelectorAll('canvas')].map(e=>({id:e.id,w:e.width,h:e.height,display:getComputedStyle(e).display})),animations:document.getAnimations().filter(a=>a.playState==='running').length,qa:structuredClone(__qa),resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),bytes:e.transferSize})),list:(()=>{const e=document.querySelector('#track-list');return {top:e.scrollTop,height:e.clientHeight,scroll:e.scrollHeight,items:e.children.length}})()})'''
def attempt(case,name,fn):
    try: case[name]=fn()
    except Exception as e: case[name]={'ERROR':str(e)[:700]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge')
    for width,height,touch in [(1440,900,False),(320,740,True),(390,844,True),(768,1024,True),(800,900,False),(801,900,False)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=1)
        context.add_init_script(INIT)
        page=context.new_page(); errors=[]; console=[]
        page.on('response',lambda r:errors.append(f'HTTP {r.status} {r.url}') if r.status>=400 else None)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
        case={'width':width,'height':height,'touch':touch};report['cases'].append(case)
        page.goto(URL,wait_until='networkidle');page.wait_for_timeout(1500)
        case['initial']=page.evaluate(SNAP)
        shot=OUT/f'{width}-initial.png';page.screenshot(path=str(shot),full_page=True);case['screenshot']=str(shot)
        before=page.evaluate('({...__qa})');page.wait_for_timeout(1500);after=page.evaluate('({...__qa})');case['idle1500ms']={k:after[k]-before[k] for k in ['raf','draw']}
        if width in [1440,390]:
            def scrolltest():
                box=page.locator('#track-list').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+min(100,box['height']/2));rows=[]
                for direction in [1,-1]:
                    for i in range(45):
                        if touch:
                            session=context.new_cdp_session(page);x=box['x']+box['width']/2;y=box['y']+box['height']/2
                            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
                            for n in range(1,7): session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-direction*n*14}]});page.wait_for_timeout(15)
                            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});session.detach()
                        else: page.mouse.wheel(0,direction*420)
                        page.wait_for_timeout(100)
                    page.wait_for_timeout(450);rows.append({'direction':direction,'state':page.evaluate(SNAP)['list']})
                return rows
            attempt(case,'scroll',scrolltest)
            def tracktest():
                page.locator('#track-list').evaluate('(e)=>{const b=[...e.querySelectorAll("button")].find(b=>{const r=b.getBoundingClientRect(),p=e.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom});window.__pick=b}')
                box=page.evaluate('(()=>{const r=__pick.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
                if touch: page.touchscreen.tap(**box)
                else: page.mouse.click(**box)
                page.wait_for_timeout(650)
                state={'title':page.locator('#now-playing-title').inner_text(),'hidden':page.locator('#active-player').get_attribute('aria-hidden')}
                shot=OUT/f'{width}-playing.png';page.screenshot(path=str(shot),full_page=True);state['screenshot']=str(shot)
                page.locator('#next-track').click(timeout=1500);state['next']=page.locator('#now-playing-title').inner_text()
                page.locator('#previous-track').click(timeout=1500);state['previous']=page.locator('#now-playing-title').inner_text()
                page.locator('#immersive-play').click(timeout=1500);page.keyboard.press('Escape');state['persistent']=page.locator('#active-player').is_visible();return state
            attempt(case,'track',tracktest)
            def panels():
                out={}
                for name in ['chat','theme']:
                    page.locator('#'+name+'-hint').click();page.wait_for_timeout(200)
                    out[name]={'visible':page.locator('#'+name+'-panel').is_visible(),'focus':page.evaluate('document.activeElement.id')}
                    shot=OUT/f'{width}-{name}.png';page.screenshot(path=str(shot),full_page=True);out[name]['screenshot']=str(shot)
                    if name=='theme':
                        vals=page.locator('#theme-select option').evaluate_all('(es)=>es.map(e=>e.value)');page.locator('#theme-select').select_option(vals[-1]);out[name]['selected']=vals[-1];out[name]['applied']=page.locator('html').get_attribute('data-theme')
                    page.keyboard.press('Escape');out[name]['escapeClosed']=not page.locator('#'+name+'-panel').is_visible();out[name]['focusAfterEscape']=page.evaluate('document.activeElement.id')
                    if page.locator('#'+name+'-panel').is_visible():page.locator('#'+name+'-close').click()
                return out
            attempt(case,'panels',panels)
            case['smallTargets']=page.locator('button,a,input,select').evaluate_all('(es)=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.width<24||r.height<24)}).slice(0,25).map(e=>({id:e.id,text:e.innerText,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
        case['errors']=errors;case['consoleErrors']=console
        context.close()
    context=browser.new_context(viewport={'width':1440,'height':900});page=context.new_page();page.add_init_script(INIT);page.goto(URL);page.wait_for_timeout(800);page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(800);report['desktopResizedToMobile']=page.evaluate(SNAP)
    start=page.evaluate('({...__qa})');page.wait_for_timeout(1500);end=page.evaluate('({...__qa})');report['resizedIdle1500ms']={k:end[k]-start[k] for k in ['raf','draw']}
    page.screenshot(path=str(OUT/'desktop-resized-mobile.png'),full_page=True);context.close()
    context=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce');page=context.new_page();page.add_init_script(INIT);page.goto(URL);page.wait_for_timeout(1000);report['reducedMotion']=page.evaluate(SNAP);context.close()
    browser.close()
report['checks']=[{'name':'No horizontal document overflow at tested breakpoints','pass':all(c['initial']['width']==c['initial']['docWidth'] for c in report['cases'])},{'name':'Cold mobile startup has zero idle canvas calls','pass':all(c['idle1500ms']['draw']==0 for c in report['cases'] if c['width']<=800)},{'name':'Desktop resize to mobile switches to static mode','pass':report['desktopResizedToMobile']['mode']=='static'},{'name':'Desktop resize to mobile stops canvas drawing','pass':report['resizedIdle1500ms']['draw']==0},{'name':'Desktop retains live animated logo','pass':report['cases'][0]['initial']['logo'] and report['cases'][0]['idle1500ms']['draw']>0}]
report['endHashes']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['index.html','styles.css','script.js']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'report':report},ensure_ascii=False,indent=2))
server.shutdown()
