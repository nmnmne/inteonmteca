from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 for reason,state in [('entries',{'entries':10,'walkMs':0}),('time',{'entries':1,'walkMs':1199900})]:
  page=b.new_page();page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
  page.evaluate('(s)=>{localStorage.setItem("inteon-yard-journey-v1",JSON.stringify(s));inteonStreet.savePose({x:-100,z:20,yaw:1,pitch:.1});}',state)
  page.goto('http://127.0.0.1:8080/yard/',wait_until='domcontentloaded');page.wait_for_function('!!window.__yard');page.wait_for_function('Math.abs(__yard.body.x-__yard.layout.spawn.x)<.01');page.wait_for_timeout(250)
  actual=page.evaluate('({pose:{...__yard.body},state:JSON.parse(localStorage.getItem("inteon-yard-journey-v1")),fov:__yard.camera.fov})');print(reason,json.dumps(actual));assert actual['state']['entries']==1 and actual['state']['walkMs']<2000 and actual['fov']==60
  assert '/yard/' in page.url
  page.reload(wait_until='domcontentloaded');page.wait_for_function('!!window.__yard');page.wait_for_timeout(1200);assert page.evaluate('JSON.parse(localStorage.getItem("inteon-yard-journey-v1")).entries')==1
  page.close()
 b.close()
