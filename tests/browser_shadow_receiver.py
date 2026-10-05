"""Visual differential: old screen-area cutoff versus scale-invariant receiver gradient."""
import functools,json,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
from PIL import Image,ImageChops,ImageStat
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
out=ROOT/'tests/artifacts/shadow-receiver';out.mkdir(parents=True,exist_ok=True)
source=(ROOT/'yard/shadow-atlas.js').read_text()
legacy=source.replace('dx /= max(length(dx.xy), 1e-20);','').replace('dy /= max(length(dy.xy), 1e-20);','').replace('abs(det) > 1e-7','abs(det) > 1e-10')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  results=[]
  for mode in ('legacy','fixed'):
   page=browser.new_page(viewport={'width':1000,'height':800},has_touch=True)
   page.route('**/yard/shadow-atlas.js',lambda route:route.fulfill(status=200,content_type='application/javascript',body=legacy if mode=='legacy' else source))
   page.goto(f'http://127.0.0.1:{server.server_port}/yard/')
   page.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus==="ready"')
   page.add_style_tag(content='body>*:not(canvas) { visibility:hidden!important }')
   for i,(x,z,yaw) in enumerate([(-20,60,0),(-18,62,.5),(20,20,0)]):
    page.evaluate('p=>Object.assign(__yard.body,p)',{'x':x,'z':z,'yaw':yaw,'pitch':-.7})
    page.wait_for_timeout(300);page.screenshot(path=str(out/f'{mode}-{i}.png'))
   page.close()
  for i in range(3):
   delta=ImageChops.difference(Image.open(out/f'legacy-{i}.png'),Image.open(out/f'fixed-{i}.png'))
   box=delta.getbbox();delta.save(out/f'difference-{i}.png')
   means=[ImageStat.Stat(Image.open(out/f'{mode}-{i}.png').crop((250,550,900,790)).convert('L')).mean[0] for mode in ('legacy','fixed')]
   assert box and box[1]>=400, 'Regression must affect near-camera acne, not distant world shadows'
   assert means[1]-means[0]>4, 'Corrected sunny receiver must lose the camera-local self-shadow'
   results.append({'view':i,'differenceBounds':box,'nearGroundLuminance':means})
  (out/'report.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
  browser.close()
finally:server.shutdown();server.server_close()
