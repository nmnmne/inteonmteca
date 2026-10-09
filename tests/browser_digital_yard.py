from playwright.sync_api import sync_playwright
from pathlib import Path
import json
out=Path('tests/artifacts/digital-yard');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1440,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto('http://127.0.0.1:8080/yard/',wait_until='domcontentloaded');page.wait_for_function('!!window.__yard');page.evaluate('yardWalkClock.enteredAt=Date.now()+1000000;inteonStreet.boundaryPlaybackSucceeded()')
 for name,x,z in [('green',-95,0),('digital',-138,0),('outer',-280,0),('distant',-650,0)]:
  page.evaluate('(p)=>Object.assign(__yard.body,{x:p[0],z:p[1],yaw:Math.PI/2,pitch:.12})',[x,z]);page.wait_for_timeout(300);page.screenshot(path=str(out/f'{name}.png'))
  print(name,page.evaluate('({amount:__yard.scene.userData.virtuality,layer:__yard.scene.userData.virtualLayer,proxy:__yard.scene.getObjectByName("digital-buildings").visible,render:__yard.renderer.info.render})'))
 page.evaluate('Object.assign(__yard.body,{x:-100,z:20,yaw:1.25,pitch:.12})');page.wait_for_timeout(1100);page.reload(wait_until='domcontentloaded');page.wait_for_function('!!window.__yard');print('reload',page.evaluate('({...__yard.body})'));assert page.evaluate('Math.abs(__yard.body.x+100)<.01')
 page.evaluate('yardWalkClock.enteredAt=Date.now()+1000000;inteonStreet.boundaryPlaybackSucceeded()');page.evaluate('__yard.flyToSpawn({stay:true})');assert page.evaluate('Math.abs(__yard.body.x-__yard.layout.spawn.x)<.01');assert '/yard/' in page.url
 print('errors',errors);assert not errors; b.close()
