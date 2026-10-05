from playwright.sync_api import sync_playwright
from pathlib import Path
import json
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1440,'height':900})
 page.route('https://**/*',lambda r:r.abort());page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded');page.wait_for_timeout(1200)
 page.evaluate('Math.random=()=>.2');page.locator('.track-select').nth(1).click()
 page.wait_for_function("document.querySelector('.room-resident').dataset.behavior==='exploring'",timeout=12000)
 start=page.locator('.room-resident').bounding_box()
 page.wait_for_function("document.querySelector('.room-resident').dataset.behavior==='listening'",timeout=10000)
 end=page.locator('.room-resident').bounding_box()
 assert abs(start['x']-end['x'])>30 or abs(start['y']-end['y'])>30
 page.screenshot(path='tests/artifacts/left-room/explore-playlist.png')
 c=page.context.new_cdp_session(page);c.send('Performance.enable')
 def metrics():return {x['name']:x['value'] for x in c.send('Performance.getMetrics')['metrics']}
 results={}
 for rate in [1,4]:
  c.send('Emulation.setCPUThrottlingRate',{'rate':rate});page.wait_for_timeout(1500);a=metrics();page.wait_for_timeout(3000);z=metrics();results[str(rate)]={k:round(z[k]-a[k],4) for k in ['TaskDuration','ScriptDuration','RecalcStyleDuration']}
 Path('tests/artifacts/left-room/performance.json').write_text(json.dumps(results,indent=2));print(results);b.close()
