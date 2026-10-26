"""Real wall-clock effects, cover rotation and controlled visibility recovery."""
import json, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/artifacts/followup/lifecycle';OUT.mkdir(parents=True,exist_ok=True)
class H(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   body=b'{"messages":[],"authenticated":false}'
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
  super().do_GET()
 def end_headers(self):
  self.send_header('Cache-Control','public,max-age=31536000,immutable' if '/renditions/' in self.path else 'no-cache');super().end_headers()
s=ThreadingHTTPServer(('127.0.0.1',0),partial(H,directory=str(ROOT)));threading.Thread(target=s.serve_forever,daemon=True).start()
report={}
try:
 with sync_playwright() as p:
  b=p.chromium.launch(channel='msedge',headless=True)
  c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=3)
  c.add_init_script("""window.__qa={gpu:0,requests:[],glyphChanges:0,debugWrites:0};
   const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...a){if(type.startsWith('webgl'))__qa.gpu++;return get.call(this,type,...a)};
   window.__setHidden=value=>{Object.defineProperty(document,'hidden',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'));};
   document.addEventListener('DOMContentLoaded',()=>new MutationObserver(rs=>{for(const r of rs){if(r.target.closest?.('.text-wave-mask,.direct-wave-char'))__qa.glyphChanges++;if(r.target.closest?.('#development-debug-panel'))__qa.debugWrites++;}}).observe(document.body,{subtree:true,attributes:true,characterData:true,childList:true}));
  """)
  page=c.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.goto(f'http://127.0.0.1:{s.server_port}');page.wait_for_timeout(1200)
  page.evaluate("""()=>{inteonMobileLogo.stop();inteonLogoAcid.stop();inteonLogoMaterials.stop();inteonAlternateLogo.stop();inteonGraphicsQuality.setManualLevel(1);}""")
  effects=[];report['effects']=effects
  for name in ['scatter','dissolve','recursion']:
   page.evaluate('inteonMobileLogo.stop()')
   start=page.evaluate("name=>{const at=performance.now(),ok=inteonMobileLogo.run(name);return {at,ok,owner:inteonHomeEffects.active,rejected:inteonMobileLogo.run('scatter')===false};}",name)
   assert start['ok'] and start['rejected'],start
   limit=12500 if name=='dissolve' else 8000
   page.wait_for_function("!document.querySelector('#logo-wrap').dataset.mobileEffect",timeout=limit)
   end=page.evaluate('performance.now()');effects.append({'name':name,'duration':end-start['at'],'owner':start['owner']})
   assert end-start['at']<limit,effects[-1]
   print(effects[-1],flush=True)
  report['effects']=effects
  # Visibility is injected to make recovery deterministic; this is not a claim
  # about OS background-tab scheduling on a physical phone.
  assert page.evaluate("inteonMobileLogo.run('scatter')")
  page.evaluate('__setHidden(true)');page.wait_for_timeout(300)
  assert page.evaluate('inteonHomeEffects.active') is None
  page.evaluate('__setHidden(false)');page.wait_for_timeout(400)
  assert page.evaluate("inteonMobileLogo.run('recursion')")
  page.wait_for_function("!document.querySelector('#logo-wrap').dataset.mobileEffect",timeout=8500)
  page.evaluate("inteonMobileLogo.stop();inteonAlternateLogo.stop();window.__startQA=JSON.parse(JSON.stringify(__qa))")
  # More than a minute of actual viewing covers a full variant cycle. The first
  # three-copy catalogue stays bounded; only near rows own glyph/cover work.
  begin=len(requests);page.wait_for_timeout(57000)
  state=page.evaluate("""()=>({qa:__qa,start:__startQA,rows:document.querySelectorAll('.track-item').length,wrappedRows:[...document.querySelectorAll('.track-item')].filter(e=>e.querySelector('.text-wave-run')).length,images:[...document.querySelectorAll('.cover-image')].filter(e=>e.currentSrc).map(e=>({url:e.currentSrc,width:e.naturalWidth})),quality:inteonGraphicsQuality.snapshot()})""")
  assert state['qa']['gpu']==0,'normal startup must not probe or choose GPUs'
  assert state['qa']['glyphChanges']>state['start']['glyphChanges']+100,'letters remain alive at minimum quality'
  assert state['wrappedRows']<state['rows']/2,state
  assert not any('/api/chat' in u for u in requests[begin:]),'collapsed chat must not poll'
  assert all(x['width']<=64 for x in state['images'])
  assert not any('/track-covers/' in u and '/renditions/' not in u for u in requests)
  assert not errors,errors
  report.update(state=state,requests=requests,errors=errors,visibility='controlled document.hidden events')
  b.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');s.shutdown();s.server_close()
print(json.dumps({'effects':report.get('effects'),'passed':bool(report.get('state'))}),flush=True)
