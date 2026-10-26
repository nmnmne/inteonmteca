"""Adjacent baseline/candidate samples eliminate a changing RDP/display cadence.
Baseline files are read from Git, never checked out over the working tree.
"""
import json, subprocess, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/artifacts/followup/paired';OUT.mkdir(parents=True,exist_ok=True)
baseline={}
for name in subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).splitlines():
 if '/' not in name and name.endswith(('.js','.css','.html')):
  baseline[name]=subprocess.check_output(['git','show','d1e6694:'+name],cwd=ROOT)
class H(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   data=b'{"messages":[],"authenticated":false}'
  elif self.server.baseline and self.path.split('?')[0].lstrip('/') in baseline:
   data=baseline[self.path.split('?')[0].lstrip('/')]
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',self.guess_type(self.path.split('?')[0]));self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
servers=[]
for old in [True,False]:
 s=ThreadingHTTPServer(('127.0.0.1',0),partial(H,directory=str(ROOT)));s.baseline=old;servers.append(s);threading.Thread(target=s.serve_forever,daemon=True).start()
report=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  for cpu in [1,4,6]:
   for order in [servers,servers[::-1]]:
    for s in order:
     context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
     context.add_init_script("let seed=91;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)")
     page=context.new_page();d=context.new_cdp_session(page);d.send('Performance.enable');d.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
     page.goto(f'http://127.0.0.1:{s.server_port}');page.wait_for_timeout(2500)
     a={m['name']:m['value'] for m in d.send('Performance.getMetrics')['metrics']}
     frames=page.evaluate("""()=>new Promise(resolve=>{const start=performance.now();let count=0,previous=0,intervals=[];const tick=t=>{count++;if(previous)intervals.push(t-previous);previous=t;if(t-start>=4000)resolve({count,ms:t-start,intervals,letters:inteonTextMotion.updates});else requestAnimationFrame(tick)};requestAnimationFrame(tick);})""")
     b={m['name']:m['value'] for m in d.send('Performance.getMetrics')['metrics']}
     busy=(b['TaskDuration']-a['TaskDuration'])*1000
     report.append({'baseline':s.baseline,'cpu':cpu,'busyPercent':busy/(b['Timestamp']-a['Timestamp'])/10,'msPerFrame':busy/frames['count'],'frames':frames,'nodes':page.locator('*').count()})
     print(json.dumps({k:v for k,v in report[-1].items() if k!='frames'}),flush=True);context.close()
  browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 for s in servers:s.shutdown();s.server_close()
