"""Reactive renderer regression: cold mobile and repeated breakpoint crossings."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).parent/'artifacts'/'spatial-player'
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge')
 for initial in [1440,390]:
  page=b.new_page(viewport={'width':initial,'height':900})
  page.add_init_script('''window.audit={raf:0,canvas:0};window.scenePending=new Set();const r=requestAnimationFrame,c=cancelAnimationFrame;window.requestAnimationFrame=f=>{if(f.name!=='tickVisuals')return r(f);audit.raf++;let id=r(t=>{scenePending.delete(id);f(t)});scenePending.add(id);return id};window.cancelAnimationFrame=id=>{scenePending.delete(id);c(id)};for(const k of ['clearRect','fillRect','stroke','fillText']){const f=CanvasRenderingContext2D.prototype[k];CanvasRenderingContext2D.prototype[k]=function(...a){audit.canvas++;return f.apply(this,a)}}''')
  page.goto('http://127.0.0.1:8080');page.wait_for_timeout(600)
  for width in [390,1440,390,1440,390]:
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(350)
   before=page.evaluate('({...audit})');page.wait_for_timeout(1500);after=page.evaluate('({...audit})')
   assert page.evaluate('scenePending.size') == (0 if width==390 else 1)
   delta={k:after[k]-before[k] for k in before};results.append({'initial':initial,'width':width,**delta})
   if width==390: assert delta=={'raf':0,'canvas':0},results[-1]
   else: assert 5<delta['raf']<220 and delta['canvas']>0,results[-1]
  page.close()
 b.close()
(out/'breakpoint-results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
