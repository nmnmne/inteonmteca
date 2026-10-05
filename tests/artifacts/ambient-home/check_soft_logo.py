from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('tests/artifacts/soft-logo');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1440,'height':900})
 page.route('https://**/*',lambda r:r.abort())
 page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000')")
 page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
 page.wait_for_timeout(1500)
 page.screenshot(path=str(out/'desktop.png'))
 assert page.locator('.logo-particle').count()>0
 assert page.locator('.logo-vector').evaluate('e=>getComputedStyle(e).animationName')=='logoVectorDissolve'
 page.mouse.move(1400,800);page.wait_for_timeout(1800)
 assert page.evaluate('motionState.x')>.5
 assert page.evaluate('logoReactiveCanvas.width')>100
 assert page.evaluate('logoTimers.size')>0
 page.evaluate('logoLocked=false; fullReadableMode=false; runLogoCycle()')
 page.wait_for_timeout(3000)
 page.screenshot(path=str(out/'fragments.png'))
 page.emulate_media(reduced_motion='reduce');page.wait_for_function('sceneRaf===0')
 assert page.locator('.logo-vector').evaluate('e=>getComputedStyle(e).animationName')=='none'
 page.emulate_media(reduced_motion='no-preference');page.wait_for_function('sceneRaf!==0')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(600)
 page.screenshot(path=str(out/'mobile.png'))
 assert page.evaluate('sceneRaf')==0
 b.close()
print('Logo layers, cycle, parallax, reduced motion, mobile lifecycle passed')
