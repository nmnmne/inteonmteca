"""Repeatable cold-load/layout and authored-work audit, no production writes."""
import json, sys, threading, time, os, gzip, io
from collections import Counter
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
TAG=sys.argv[1] if len(sys.argv)>1 else 'after'
OUT=ROOT/'tests/artifacts/followup'/TAG;OUT.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
 def send_head(self):
  if os.environ.get('FOLLOWUP_GZIP') and self.path.split('?')[0].endswith(('.js','.css')):
   file=Path(self.translate_path(self.path))
   if file.is_file():
    data=gzip.compress(file.read_bytes(),mtime=0);self.send_response(200);self.send_header('Content-Type',self.guess_type(str(file)));self.send_header('Content-Encoding','gzip');self.send_header('Content-Length',str(len(data)));self.end_headers();return io.BytesIO(data)
  return super().send_head()

 def end_headers(self):
  self.send_header('Cache-Control','public, max-age=31536000, immutable' if '/renditions/' in self.path else 'no-cache')
  super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
GEOMETRY="""() => {
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}};
 const shown=e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true});
 const list=document.querySelector('.track-list'), lb=box(list);
 return {overflow:document.documentElement.scrollWidth>innerWidth,
 boxes:Object.fromEntries(['.room-toolbar','#auth-hint','#theme-hint','.development-debug-master','.playlist-shell','#chat-panel','#active-player','.playback-status','.volume-control'].map(s=>[s,box(document.querySelector(s))])),
 rows:[...list.children].filter(e=>{const b=box(e);return b.y>=lb.y-.5&&b.b<=lb.b+.5}).map(e=>({row:box(e),button:box(e.querySelector('.track-select')),title:box(e.querySelector('.track-title')),artist:box(e.querySelector('.track-artist'))})),
 covers:[...document.querySelectorAll('.cover-image')].filter(e=>e.currentSrc).map(e=>({url:e.currentSrc.split('/').pop(),decoded:e.naturalWidth,css:box(e).w})),
 panels:[...document.querySelectorAll('#auth-panel,#theme-panel,.development-quality,.development-animation-menu')].filter(shown).map(e=>({id:e.id,box:box(e)})),
 small:[...document.querySelectorAll('.room-toolbar button,.development-debug-master')].filter(shown).filter(e=>box(e).h<40).map(e=>e.id||e.className),
 focus:document.activeElement?.id||document.activeElement?.className,
 letters:window.inteonTextMotion?.updates,quality:window.inteonGraphicsQuality?.snapshot(),perf:window.__audit};
}"""
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  cases=[(320,568,1,1,None),(390,844,2,1,None),(844,390,2,1,None),(768,1024,2,1,None),(1280,650,1,1,None),(1440,900,1,1,None),(390,844,3,4,None),(390,844,1,6,None),(390,844,2,1,'3g'),(390,844,2,1,'4g')]
  if os.environ.get('FOLLOWUP_QUICK'): cases=[(390,844,2,1,None),(1440,900,1,1,None),(390,844,3,4,None),(390,844,1,6,None)]
  for w,h,dpr,cpu,network in cases:
   case_name=f'{w}x{h}-dpr{dpr}-cpu{cpu}-{network or "normal"}'
   context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=dpr,is_mobile=w<900,has_touch=w<900)
   def route(r):
    if '/api/' in r.request.url:r.fulfill(json={'messages':[],'authenticated':False})
    elif urlsplit(r.request.url).netloc!=urlsplit(base).netloc:r.abort()
    else:r.continue_()
   context.route('**/*',route)
   context.add_init_script("""window.__audit={long:[],shifts:[],rows:[]};
    new PerformanceObserver(l=>l.getEntries().forEach(e=>__audit.long.push(e.duration))).observe({type:'longtask',buffered:true});
    new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)__audit.shifts.push(e.value)})).observe({type:'layout-shift',buffered:true});
    document.addEventListener('DOMContentLoaded',()=>{let n=0;const sample=()=>{const e=document.querySelector('.track-item');__audit.rows.push([performance.now(),e?.getBoundingClientRect().height]);if(n++<20)requestAnimationFrame(sample)};sample()});
   """)
   page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('request',lambda r:requests.append(r.url))
   cdp=context.new_cdp_session(page);cdp.send('Performance.enable');cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
   if network:cdp.send('Network.enable');cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':400 if network=='3g' else 150,'downloadThroughput':50000 if network=='3g' else 200000,'uploadThroughput':50000})
   page.goto(base,wait_until='load',timeout=120000)
   initial=page.evaluate(GEOMETRY)
   a={x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
   start=page.evaluate('performance.now()');page.wait_for_timeout(6000)
   b={x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
   settled=page.evaluate(GEOMETRY)
   timing=page.evaluate("({paint:performance.getEntriesByType('paint').map(e=>({name:e.name,at:e.startTime})),resources:performance.getEntriesByType('resource').map(e=>({url:e.name,bytes:e.transferSize,decoded:e.decodedBodySize,end:e.responseEnd}))})")
   states={}
   if cpu==1 and not network:
    for name in ['theme','auth','debug']:
     trigger=page.locator('.development-debug-master' if name=='debug' else '#'+name+'-hint');trigger.click();page.wait_for_timeout(120)
     states[name]=page.evaluate(GEOMETRY);page.keyboard.press('Escape');states[name+'-escape']=page.evaluate(GEOMETRY)['focus']
    toggle=page.locator('#mobile-chat-toggle')
    if toggle.is_visible():
     try:
      toggle.click(timeout=1500);page.wait_for_timeout(150);states['chat-expanded']=page.evaluate(GEOMETRY);toggle.click(timeout=1500)
     except Exception as e: states['chat-error']=str(e)[:180]
    page.screenshot(path=str(OUT/(name+'-'+str(w)+'-'+str(h)+'.png')))
   results.append({'case':case_name,'size':[w,h],'dpr':dpr,'cpu':cpu,'network':network,'initial':initial,'settled':settled,'states':states,'timing':timing,'requests':dict(Counter(requests)),'errors':errors,'sampleMs':page.evaluate('performance.now()')-start,'busyPercent':100*(b.get('TaskDuration',0)-a.get('TaskDuration',0))/(b['Timestamp']-a['Timestamp'])})
   (OUT/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
   print(json.dumps({'case':results[-1]['case'],'busy':round(results[-1]['busyPercent'],1),'bytes':sum(x['bytes'] for x in timing['resources']),'rows':len(settled['rows']),'small':settled['small'],'errors':errors}),flush=True)
   context.close()
  browser.close()
finally:server.shutdown();server.server_close()
