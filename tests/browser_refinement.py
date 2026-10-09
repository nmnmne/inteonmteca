from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('tests/artifacts/refinement');out.mkdir(exist_ok=True)
errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 for mobile in [False,True]:
  page=b.new_page(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded');page.wait_for_timeout(1000)
  page.locator('#theme-hint').click();page.locator('.theme-picker-toggle').click()
  assert page.locator('#theme-options [role=option]').count()==9
  assert page.locator('#theme-select optgroup').count()==0
  page.screenshot(path=str(out/f'themes-{mobile}.png'))
  page.keyboard.press('End');page.keyboard.press('Enter')
  page.wait_for_function('document.documentElement.dataset.theme === document.querySelector("#theme-select").options[8].value')
  page.locator('#theme-hint').click()
  page.evaluate('inteonAtmosphere.replayScene()');page.wait_for_timeout(7500)
  assert page.locator('.scene-peek-track').count()==page.locator('.track-item').count()
  page.screenshot(path=str(out/f'scene-{mobile}.png'))
  page.wait_for_timeout(15000)
  assert not page.evaluate('document.body.classList.contains("scene-peek")')
  page.screenshot(path=str(out/f'void-{mobile}.png'))
  page.close()
 page=b.new_page(viewport={'width':1440,'height':900});page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("localStorage.setItem('inteon.yard.lighting.next.v1','0')")
 page.goto('http://127.0.0.1:8080/yard/',wait_until='domcontentloaded');page.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus === "ready"')
 page.evaluate('yardWalkClock.enteredAt=Date.now()+1000000; inteonStreet.boundaryPlaybackSucceeded();Object.assign(__yard.body,{x:-128.7094,z:-27.5298,yaw:-4.2218,pitch:.2142})');page.wait_for_timeout(1000)
 page.screenshot(path=str(out/'yard-user-pose.png'))
 print(page.evaluate('JSON.stringify({render:__yard.renderer.info.render,spawn:__yard.layout.spawn,photo:__yard.layout.photoView})'))
 print('errors',errors);assert not errors
 b.close()
