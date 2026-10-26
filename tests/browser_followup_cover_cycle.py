"""A complete visible rotation of the track with the most cover variants."""
import json, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/artifacts/followup/cover-cycle'; OUT.mkdir(parents=True,exist_ok=True)
class H(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   body=b'{"messages":[],"authenticated":false}'
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
  try:super().do_GET()
  except (ConnectionResetError,BrokenPipeError):pass
s=ThreadingHTTPServer(('127.0.0.1',0),partial(H,directory=str(ROOT)))
threading.Thread(target=s.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(channel='msedge',headless=True)
  c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=3)
  page=c.new_page();requests=[];errors=[]
  page.on('request',lambda r:requests.append(r.url));page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{s.server_port}')
  title=page.evaluate("INTEONMTECA_PLAYLIST.reduce((a,b)=>(a.covers?.length||0)>(b.covers?.length||0)?a:b).title")
  # Use stable data because animated letters may alter visible text.
  row=page.locator('.track-item').filter(has=page.locator('.track-title[data-original-text="'+title+'"]')).nth(1)
  row.scroll_into_view_if_needed();page.wait_for_timeout(150)
  row.evaluate("""e=>{window.__cycle={indexes:[],stages:[]};const host=e.querySelector('.track-art');host.id='cycle-probe';const read=()=>{const img=host.querySelector('img');if(img.currentSrc)__cycle.stages.push({at:performance.now(),index:host.dataset.coverIndex,stage:host.dataset.coverStage,width:img.naturalWidth,url:img.currentSrc});if(host.dataset.coverIndex&&!__cycle.indexes.includes(host.dataset.coverIndex))__cycle.indexes.push(host.dataset.coverIndex)};read();new MutationObserver(read).observe(host,{attributes:true,attributeFilter:['data-cover-index','data-cover-stage']});}""")
  page.screenshot(path=str(OUT/'preview.png'))
  page.wait_for_timeout(1800);page.screenshot(path=str(OUT/'sharp.png'))
  page.wait_for_function('__cycle.indexes.length===15',timeout=65000)
  data=page.evaluate('__cycle')
  assert set(data['indexes'])==set(map(str,range(15))),data
  assert not any('/track-covers/' in u and '/renditions/' not in u for u in requests)
  assert not errors,errors
  (OUT/'report.json').write_text(json.dumps({'track':title,'cycle':data,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({'track':title,'variants':len(data['indexes']),'passed':True}),flush=True)
  b.close()
finally:s.shutdown();s.server_close()
