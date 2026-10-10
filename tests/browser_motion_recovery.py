"""Browser regression: menus and effect ownership do not freeze ambient motion;
lost RAF callbacks recover without user input. Run with the local server active.
"""
import sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8080/'
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge')
 for mobile in (False,True):
  page=browser.new_page(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('''
   localStorage.setItem('inteonmteca-theme-duration','604800000');
   const request=window.requestAnimationFrame.bind(window), cancel=window.cancelAnimationFrame.bind(window);
   const pending=new Set();window.draws={};window.frames={};
   window.requestAnimationFrame=fn=>{const id=request(t=>{pending.delete(id);frames[fn.name]=(frames[fn.name]||0)+1;fn(t)});pending.add(id);return id;};
   window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id)};
   window.loseFrames=()=>{for(const id of pending)cancel(id);pending.clear();};
   const clear=CanvasRenderingContext2D.prototype.clearRect;
   CanvasRenderingContext2D.prototype.clearRect=function(...args){const key=this.canvas.className;draws[key]=(draws[key]||0)+1;return clear.apply(this,args)};
  ''')
  page.goto(URL,wait_until='domcontentloaded');page.wait_for_timeout(1000)
  page.evaluate('inteonLogoStorm.stop();inteonLogoAcid.stop();inteonAtmosphere.stop()')
  def snapshot(): return page.evaluate('({draws:{...draws},frames:{...frames}})')
  def advancing(before,after):
   for key in ('material-field','logo-ripples'):
    assert after['draws'].get(key,0)>before['draws'].get(key,0),(mobile,key,before,after)
   if not mobile: assert after['frames'].get('tickVisuals',0)>before['frames'].get('tickVisuals',0)
   assert after['frames'].get('tick',0)>before['frames'].get('tick',0)
  normal=page.locator('.listening-intro h1').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
  for opener,panel in [('#theme-hint','#theme-panel'),('#auth-hint','#auth-panel')]:
   page.locator(opener).click();page.wait_for_timeout(250)
   assert not page.evaluate('inteonHomeEffects.suspended')
   before=snapshot();page.wait_for_timeout(600);advancing(before,snapshot())
   if not mobile:
    small=page.locator('.listening-intro h1').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
    assert small<=normal*.71,(normal,small)
   page.mouse.click(3,830 if mobile else 890);page.wait_for_timeout(250)
   assert page.locator(panel).is_hidden()
  page.evaluate("inteonHomeEffects.claim('regression')")
  before=snapshot();page.wait_for_timeout(600);advancing(before,snapshot())
  page.evaluate("inteonHomeEffects.release('regression')")
  page.evaluate('loseFrames()');before=snapshot()
  page.wait_for_timeout(3700);advancing(before,snapshot())
  # A second loss must recover too, not just the first initial startup.
  page.evaluate('loseFrames()');before=snapshot()
  page.wait_for_timeout(3700);advancing(before,snapshot())
  assert not errors,errors
  print('mobile' if mobile else 'desktop','menus and effect ownership keep moving; two forced RAF failures self-recovered',flush=True)
  page.close()
 browser.close()
