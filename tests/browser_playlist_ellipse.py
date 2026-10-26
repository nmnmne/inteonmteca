"""Ellipse, compact tiles and real interlude lifecycle regression checks."""
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/playlist-ellipse'
OUT.mkdir(parents=True, exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
measure = """() => {
 const list=document.querySelector('.track-list'), b=list.getBoundingClientRect();
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
 const rows=[...list.children].filter(e=>{let r=e.getBoundingClientRect();return r.top>=b.top-.5&&r.bottom<=b.bottom+.5});
 return {list:box(list),phase:document.body.dataset.interludePhase,rows:rows.map(e=>{
   const button=e.querySelector('.track-select'), artist=e.querySelector('.track-artist');
   return {row:box(e),button:box(button),artist:box(artist),font:getComputedStyle(artist).fontSize,
     orbit:parseFloat(e.style.getPropertyValue('--playlist-orbit-x'))||0};
 }),webgl:window.__webgl,overflow:document.documentElement.scrollWidth>innerWidth};
}"""
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  for w,h in [(1542,997),(1440,900),(1070,520),(390,844)]:
   context=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<800,has_touch=w<800)
   context.route('**/*',lambda route:route.continue_() if urlsplit(route.request.url).netloc==urlsplit(base).netloc else route.abort())
   context.add_init_script("""window.__webgl=0;
     const original=HTMLCanvasElement.prototype.getContext;
     HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))window.__webgl++;return original.call(this,type,...args)};
   """)
   page=context.new_page(); errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base,wait_until='domcontentloaded'); page.wait_for_timeout(1800)
   before=page.evaluate(measure)
   assert before['webgl']==0,before
   assert not before['overflow'],before
   assert len(before['rows'])>=4,before
   for row in before['rows']:
    assert row['artist']['y']+row['artist']['h'] <= row['button']['y']+row['button']['h']+.5,row
   if w>800 and h>540:
    assert max(r['orbit'] for r in before['rows'])-min(r['orbit'] for r in before['rows'])>20,before
    page.locator('.track-list').evaluate('(el)=>el.scrollTop+=el.clientHeight/2')
    page.wait_for_timeout(350)
    assert page.locator('.playlist-curve').first.get_attribute('data-trajectory')=='river'
    page.screenshot(path=str(OUT/f'{w}-ellipse.png'))
   if w==1542:
    baseline=page.evaluate(measure)
    page.evaluate("""() => {
      window.inteonHomeEffects.release(window.inteonHomeEffects.active);
      window.inteonAtmosphere.replayScene({preview:true});
    }""")
    phases={}
    for _ in range(66):
     page.wait_for_timeout(500)
     current=page.evaluate(measure); phase=current.get('phase')
     assert len(current['rows'])==len(baseline['rows']),(phase,current,baseline)
     assert current['list']==baseline['list'],(phase,current['list'],baseline['list'])
     for a,b in zip(current['rows'],baseline['rows']):
      assert a['button']['h']==b['button']['h'] and a['font']==b['font'],(phase,a,b)
      assert a['artist']['y']+a['artist']['h'] <= a['button']['y']+a['button']['h']+.5,(phase,a)
     if phase not in phases:
      phases[phase]=current
      if phase=='tracks': page.screenshot(path=str(OUT/'scene-tracks.png'))
     if phase=='idle': break
    assert {'tracks','void','energy','background','idle'}<=phases.keys(),phases.keys()
    results.append({'phases':list(phases),'stable_geometry':True})
   assert not errors,errors
   results.append({'viewport':[w,h],'rows':len(before['rows']),'webgl_on_load':before['webgl'],'errors':errors})
   context.close()
  browser.close()
 print(json.dumps(results))
 (OUT/'report.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
finally:
 server.shutdown(); server.server_close()
