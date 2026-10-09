"""Capture a short playback trace for local performance diagnostics."""
import json
from collections import defaultdict
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.route('**/abacus.jasoncameron.dev/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"value":1}'))
    page.add_init_script("sessionStorage.setItem('inteon-storm-last',String(Date.now()))")
    page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
    page.locator('.track-select').first.click()
    page.wait_for_timeout(1200)
    cdp=page.context.new_cdp_session(page)
    events=[]
    cdp.on('Tracing.dataCollected',lambda data:events.extend(data['value']))
    cdp.send('Tracing.start',{'categories':'devtools.timeline,disabled-by-default-devtools.timeline.stack','options':'record-as-much-as-possible'})
    page.wait_for_timeout(4000)
    with page.expect_console_message(predicate=lambda m:m.text=='trace-done',timeout=5000):
        cdp.once('Tracing.tracingComplete',lambda _:page.evaluate("console.log('trace-done')"))
        cdp.send('Tracing.end')
    browser.close()
out=Path(__file__).parent/'artifacts/home-optimization/playback-trace.json'
out.write_text(json.dumps(events),encoding='utf-8')
total=defaultdict(float)
for e in events:
    if e.get('ph')=='X':total[e['name']]+=e.get('dur',0)/1000
print(sorted(total.items(),key=lambda x:-x[1])[:20])
for e in sorted((e for e in events if e.get('name') in ('UpdateLayoutTree','Layout','FunctionCall','FireAnimationFrame') and 'dur' in e),key=lambda e:-e['dur'])[:15]:
    print(json.dumps({k:e[k] for k in ('name','dur','args') if k in e})[:2300])
