"""Real-clock mobile-profile Edge walk: ground views, frame intervals, and automatic return."""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get('YARD_TRANSITION_OUTPUT', 'tests/artifacts/lighting-transition')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    # This checks the local yard; never call the home page's external counter.
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1:8080/')
               else route.fulfill(status=204, body=''))
    errors = []
    http_errors = []
    page.on('response', lambda response: http_errors.append({'status': response.status, 'url': response.url}) if response.status >= 400 else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error'
            and not (m.location.get('url', '').endswith('/api/auth/me') and '401' in m.text) else None)
    page.goto('http://127.0.0.1:8080/index.html')
    page.evaluate("localStorage.setItem('inteon.yard.lighting.next.v1','0'); inteonStreet.noteExit()")
    started = time.monotonic()
    page.goto('http://127.0.0.1:8080/yard/')
    page.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus === "ready" && __yard.scene.getObjectByName("music-logo").material.map')
    report = {'profile': '390x844 touch, DPR3 capped to 1, Edge headless on this computer (not physical phone)',
              'clock': 'real unmodified Date/performance/timers', 'startupSeconds': time.monotonic()-started}
    page.add_style_tag(content='body > :not(canvas) { visibility:hidden!important }')
    page.evaluate('''() => {
      __yard.body.x+=2; __yard.body.yaw+=.5; __yard.body.pitch=-.65;
      window.drawSamples=[];
      const original=__yard.renderer.render;
      __yard.renderer.render=function(...args) {
        const start=performance.now(); original.apply(this,args);
        drawSamples.push({elapsed:Date.now()-yardWalkClock.enteredAt,submissionMs:performance.now()-start,
          mix:__yard.lightingTransition.state.mix});
      };
    }''')
    page.wait_for_timeout(100)
    page.locator('#yard-view').screenshot(path=str(OUT/'ground-original.png'))
    report['initialBytes'] = page.evaluate('__yard.scene.userData.bakedLighting.gpuBytes')
    page.wait_for_function('Date.now()-yardWalkClock.enteredAt >= 9600')
    page.locator('#yard-view').screenshot(path=str(OUT/'ground-hold.png'))
    difference = ImageChops.difference(Image.open(OUT/'ground-original.png').convert('RGB'), Image.open(OUT/'ground-hold.png').convert('RGB'))
    report['groundHoldDifferenceBounds'] = difference.getbbox()
    assert difference.getbbox() is None
    page.wait_for_function('Date.now()-yardWalkClock.enteredAt >= 15000')
    page.locator('#yard-view').screenshot(path=str(OUT/'ground-middle.png'))
    report['middle'] = page.evaluate('''() => ({state:{...__yard.lightingTransition.state},
      frameIntervals:__yard.meter.snapshot(),bytes:__yard.scene.userData.bakedLighting.gpuBytes,
      drawCalls:__yard.renderer.info.render.calls,triangles:__yard.renderer.info.render.triangles,
      textures:__yard.renderer.info.memory.textures})''')
    report['drawSamples'] = page.evaluate('drawSamples')
    samples = sorted(row['submissionMs'] for row in report['drawSamples'] if row['elapsed'] > 12000)
    report['submissionMs'] = {'median': samples[len(samples)//2], 'p95': samples[min(len(samples)-1,int(len(samples)*.95))],
                              'note': 'CPU render submission duration, not a GPU timestamp'}
    assert report['middle']['state']['mix'] > .45 and report['middle']['state']['mix'] < .6
    assert report['initialBytes'] == 4*1024**2 and report['middle']['bytes'] == 8*1024**2
    page.wait_for_url('**/index.html', timeout=15000)
    report['automaticReturnAfterNavigationSeconds'] = time.monotonic()-started
    assert 19 <= report['automaticReturnAfterNavigationSeconds'] <= 24
    report['errors'] = errors
    report['httpErrors'] = http_errors
    unexpected_http = [error for error in http_errors if not (error['status'] == 401 and error['url'].endswith('/api/auth/me'))]
    report['passed'] = not errors and not unexpected_http
    (OUT/'real-clock-performance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    assert not errors, errors
    assert not unexpected_http, unexpected_http
    print(json.dumps({key: value for key,value in report.items() if key != 'drawSamples'}), flush=True)
    browser.close()
