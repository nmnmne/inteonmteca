"""Daily resident attitude and the shared desktop account/theme dock."""
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/artifacts/resident-dock'
OUT.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  for width,height in [(1722,900),(1070,520),(801,600),(390,844)]:
   context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<800,has_touch=width<800)
   context.route('**/*',lambda r:r.continue_() if urlsplit(r.request.url).netloc==urlsplit(base).netloc else r.abort())
   context.add_init_script("""window.__dateOffset=0; const NativeDate=Date;
    window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[NativeDate.now()+window.__dateOffset]));} static now(){return NativeDate.now()+window.__dateOffset;}};
   """)
   page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base,wait_until='domcontentloaded');page.wait_for_timeout(700)
   menu_boxes=[]
   for name in ['auth','theme']:
    page.locator(f'#{name}-hint').click()
    panel=page.locator(f'#{name}-panel');panel.wait_for(state='visible')
    box=panel.bounding_box();button=page.locator(f'#{name}-hint').bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=width+1,(width,box)
    assert box['y']>=0 and box['y']+box['height']<=height+1,(width,box)
    if width>800:
     assert abs(button['x']-width*.285)<1,(width,button)
     assert box['x']+box['width']<=button['x']-19,(box,button)
    menu_boxes.append(box)
    if width==1722:page.screenshot(path=str(OUT/f'{name}-dock.png'))
    page.keyboard.press('Escape');page.wait_for_timeout(100)
   if width>800:
    assert menu_boxes[0]['x']==menu_boxes[1]['x'] and menu_boxes[0]['y']==menu_boxes[1]['y'],menu_boxes
   if width in [1722,390]:
    resident=page.locator('.room-resident');durations=[];angles=[]
    for i in range(3):
     box=resident.bounding_box(); assert box
     page.evaluate("""({x,y})=>window.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,pointerType:'mouse'}))""",{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2})
     assert resident.get_attribute('data-state')=='angry'
     assert int(resident.get_attribute('data-anger-count'))==i+1
     durations.append(int(resident.get_attribute('data-anger-duration')))
     angles.append(resident.evaluate("e=>parseFloat(e.style.getPropertyValue('--anger-angle'))"))
     page.wait_for_timeout(350)
    assert durations[0]<durations[1]<durations[2],durations
    assert angles[0]<angles[1]<angles[2],angles
    box=resident.bounding_box()
    page.screenshot(path=str(OUT/f'angry-{width}.png'),clip={'x':max(0,box['x']-20),'y':max(0,box['y']-20),'width':box['width']+40,'height':box['height']+40})
    if width==1722:
     page.wait_for_timeout(4500)
     assert resident.get_attribute('data-state')=='angry','older callbacks must not end the latest reaction'
     page.wait_for_timeout(1500)
     assert resident.get_attribute('data-state')!='angry','reaction must finish after its extended duration'
    page.reload(wait_until='domcontentloaded');page.wait_for_timeout(300)
    assert resident.get_attribute('data-anger-count')=='3'
    # Move the local calendar forward without changing animation performance clocks.
    page.evaluate("window.__dateOffset=86400000; document.dispatchEvent(new Event('visibilitychange'))")
    assert resident.get_attribute('data-anger-count')=='0'
    box=resident.bounding_box()
    page.evaluate("""({x,y})=>window.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y}))""",{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2})
    assert resident.get_attribute('data-anger-count')=='1'
    assert int(resident.get_attribute('data-anger-duration'))==durations[0]
    results.append({'viewport':width,'durations':durations,'angles':angles,'reload':'preserved','next_day':'reset'})
   assert not errors,errors
   results.append({'viewport':[width,height],'menus':'passed','errors':errors})
   context.close()
  browser.close()
 print(json.dumps(results))
 (OUT/'report.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
finally:
 server.shutdown();server.server_close()
