"""Browser acceptance: real pointer/focus, responsive bounds, progressive/cache network.

The local server simulates the deployment cache headers. No production writes.
"""
import json, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/artifacts/followup/acceptance'; OUT.mkdir(parents=True,exist_ok=True)
requests=[]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  requests.append(self.path)
  if self.path.startswith('/api/'):
   data=json.dumps({'authenticated':False,'messages':[{'id':str(i),'author':'Тест','text':'Сообщение '+str(i),'createdAt':'2026-10-26T10:00:00Z'} for i in range(8)]}).encode()
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  try: super().do_GET()
  except (ConnectionResetError,BrokenPipeError): pass
 def end_headers(self):
  self.send_header('Cache-Control','public, max-age=31536000, immutable' if '/renditions/' in self.path else 'no-cache')
  super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}'
report={'ui':[],'covers':[]}
BOUNDS="""selector => [...document.querySelectorAll(selector)].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>{
 const r=e.getBoundingClientRect();return {id:e.id||e.className,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};})"""
def inside(box,w,h):
 assert box['x']>=-.5 and box['y']>=-.5 and box['right']<=w+.5 and box['bottom']<=h+.5,box
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio'])
  for w,h in [(320,568),(390,844),(844,390),(768,1024),(1280,650),(1440,900)]:
   context=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<900,has_touch=w<900)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.wait_for_timeout(300)
   assert page.evaluate("document.documentElement.dataset.debugEnabled")=='false'
   controls=page.evaluate(BOUNDS,'#auth-hint,#theme-hint,.development-debug-master,#street-link,.visit-counter')
   for a in controls:
    inside(a,w,h)
    for b in controls:
     if a is not b: assert min(a['right'],b['right'])-max(a['x'],b['x'])<1 or min(a['bottom'],b['bottom'])-max(a['y'],b['y'])<1,(a,b)
   page.screenshot(path=str(OUT/f'{w}-{h}-closed.png'))
   panels={'theme':'#theme-panel','auth':'#auth-panel','debug':'#development-debug-panel'}
   for scale in [1,2]:
    page.evaluate("scale=>{document.documentElement.style.fontSize=(scale*100)+'%';dispatchEvent(new Event('resize'));}",scale)
    page.wait_for_timeout(180)
    for kind,selector in panels.items():
     trigger=page.locator('.development-debug-master' if kind=='debug' else '#'+kind+'-hint')
     trigger.click();page.wait_for_timeout(60)
     assert page.locator(selector).is_visible(),kind
     for other,s in panels.items():
      if other!=kind: assert not page.locator(s).is_visible(),(kind,other)
     for box in page.evaluate(BOUNDS,selector): inside(box,w,h)
     # Tab and Shift+Tab remain in the visible panel, including a wrap.
     for key in ['Shift+Tab']+['Tab']*14:
      page.keyboard.press(key)
      assert page.locator(selector).evaluate('(e)=>e.contains(document.activeElement)'),(kind,key)
     page.screenshot(path=str(OUT/f'{w}-{h}-{kind}-font{scale}.png'))
     page.keyboard.press('Escape')
     assert not page.locator(selector).is_visible()
     assert trigger.evaluate('(e)=>document.activeElement===e')
    # Direct transition, not only close/reopen, exercises mutual exclusion.
    page.locator('#theme-hint').click();page.locator('#auth-hint').click()
    assert not page.locator('#theme-panel').is_visible()
    page.locator('.development-debug-master').click()
    assert not page.locator('#auth-panel').is_visible()
    page.keyboard.press('Escape')
    toggle=page.locator('#mobile-chat-toggle')
    if toggle.is_visible():
     toggle.click();page.wait_for_timeout(120)
     boxes=page.evaluate(BOUNDS,'#chat-panel,.playlist-shell,#active-player')
     for box in boxes: inside(box,w,h)
     chat=next(b for b in boxes if b['id']=='chat-panel');player=next(b for b in boxes if b['id']=='active-player')
     assert chat['bottom']<=player['y']+.5,(w,h,chat,player)
     assert page.locator('#chat-stream').evaluate("e=>Math.abs(e.clientHeight/parseFloat(getComputedStyle(e).getPropertyValue('--chat-row'))-5)<.1")
     toggle.click()
    rows=page.evaluate("""()=>{const list=document.querySelector('.track-list').getBoundingClientRect();return [...document.querySelectorAll('.track-item')].filter(e=>{const r=e.getBoundingClientRect();return r.top>=list.top&&r.bottom<=list.bottom}).map(e=>{const b=e.querySelector('button').getBoundingClientRect(),a=e.querySelector('.track-artist').getBoundingClientRect(),t=e.querySelector('.track-title').getBoundingClientRect();return {height:b.height,artist:a.bottom,bottom:b.bottom,title:t.top,top:b.top};});}""")
    if w<900:
     assert rows
     for r in rows: assert r['height']>=43.9 and r['artist']<=r['bottom']+1 and r['title']>=r['top']-1,r
   page.reload();assert page.evaluate("document.documentElement.dataset.debugEnabled")=='false'
   report['ui'].append({'size':[w,h],'errors':errors,'passed':True});assert not errors,errors
   context.close();print('UI',w,h,flush=True)
  for dpr in [1,2,3]:
   context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=dpr)
   context.add_init_script("""window.__covers=[];document.addEventListener('load',e=>{if(e.target.matches?.('.cover-image'))__covers.push({at:performance.now(),url:e.target.currentSrc,width:e.target.naturalWidth,stage:e.target.parentElement.dataset.coverStage})},true);""")
   page=context.new_page();page.goto(url);page.wait_for_timeout(3500)
   stages=page.evaluate('__covers');assert not stages
   assert page.locator('.cover-image,.active-cover').count()==0
   assert not page.evaluate("performance.getEntriesByType('resource').some(e=>e.name.includes('/track-covers/'))")
   page.reload();page.wait_for_timeout(2500)
   assert page.locator('.cover-image,.active-cover').count()==0
   report['covers'].append({'dpr':dpr,'removed':True})
   context.close();print('DPR/cache',dpr,flush=True)
  # Desktop -> mobile -> desktop restores explicit desktop slots. Playback
  # uses local media, never posts messages or changes a remote account.
  context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=3)
  page=context.new_page();page.goto(url);page.wait_for_timeout(400)
  page.wait_for_function("[...document.querySelectorAll('.direct-wave-char')].some(e=>e.dataset.glyph&&/[a-zа-я]/i.test(e.textContent))")
  page.evaluate("""()=>{const e=[...document.querySelectorAll('.direct-wave-char')].find(e=>e.dataset.glyph&&/[a-zа-я]/i.test(e.textContent));e.id='glyph-accessibility-probe';window.__glyphProbe={text:e.textContent,glyph:e.dataset.glyph};}""")
  cdp=context.new_cdp_session(page)
  doc=cdp.send('DOM.getDocument')['root']['nodeId']
  node=cdp.send('DOM.querySelector',{'nodeId':doc,'selector':'#glyph-accessibility-probe'})['nodeId']
  ax=cdp.send('Accessibility.getPartialAXTree',{'nodeId':node,'fetchRelatives':True})['nodes']
  probe=page.evaluate('__glyphProbe')
  names=[n.get('name',{}).get('value','') for n in ax if not n.get('ignored')]
  # text-transform can expose an uppercase letter in the accessibility tree.
  assert probe['text'].casefold() in [n.casefold() for n in names] and probe['glyph'] not in names,(probe,names)
  report['glyphAccessibility']={'probe':probe,'accessibleNames':names,'mode':'single element with empty generated-content alternative'}
  original=page.locator('.playlist-shell').evaluate("e=>getComputedStyle(e).getPropertyValue('--catalog-slots').trim()")
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
  assert page.locator('#mobile-visual-stage #logo-wrap').count()==1
  page.set_viewport_size({'width':1440,'height':900});page.wait_for_timeout(200)
  assert page.locator('.playlist-shell').evaluate("e=>getComputedStyle(e).getPropertyValue('--catalog-slots').trim()")==original
  assert page.locator('#mobile-visual-stage #logo-wrap').count()==0
  row=page.evaluate("""()=>{const list=document.querySelector('.track-list').getBoundingClientRect();return [...document.querySelectorAll('.track-item')].findIndex(e=>{const r=e.getBoundingClientRect();return r.top>=list.top&&r.bottom<=list.bottom});}""")
  page.locator('.track-select').nth(row).click()
  page.wait_for_function("document.querySelector('#album-player').currentTime > .1",timeout=20000)
  page.evaluate("document.querySelector('#album-player').pause()")
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
  status=page.evaluate(BOUNDS,'#active-player .playback-status,#active-player .transport-time')
  for a in status:
   for b in status:
    if a is not b: assert min(a['right'],b['right'])-max(a['x'],b['x'])<1 or min(a['bottom'],b['bottom'])-max(a['y'],b['y'])<1,(a,b)
  page.locator('#mobile-chat-toggle').click()
  page.locator('.development-debug-master').click();page.goto('about:blank');page.go_back();page.wait_for_timeout(100)
  assert page.evaluate("document.documentElement.dataset.debugEnabled")=='false'
  assert page.locator('#mobile-chat-toggle').get_attribute('aria-expanded')=='false'
  report['playback']={'backResetsDebug':True,'played':True,'statusBoxes':status,'restoredDesktopSlots':original}
  context.close()
  browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 server.shutdown();server.server_close()
