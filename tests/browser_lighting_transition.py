"""Edge/WebGL: real walk clock, all 12 pairs, unchanged hold pixels and GPU lifecycle."""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/lighting-transition'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8080'
BASE = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)
report = {'browser': 'Edge headless WebGL', 'clock': 'Playwright controlled time; production armReturn deadlines', 'pairs': [], 'errors': []}
requests = {}


def wait(page, expression):
    until = time.monotonic() + 20
    while time.monotonic() < until:
        page.clock.run_for(20)
        if page.evaluate(expression):
            return
        time.sleep(.025)
    raise AssertionError(f'Timeout: {expression}')


def advance_to(page, elapsed):
    delta = page.evaluate('(ms) => yardWalkClock.enteredAt + ms - Date.now()', elapsed)
    assert delta >= 0, delta
    page.clock.fast_forward(delta)


def shot(page, name):
    # Force the same render point even when the mobile idle gate is asleep.
    page.evaluate('__yard.renderer.render(__yard.scene, __yard.camera)')
    page.locator('#yard-view').screenshot(path=str(OUT / name), animations='allow', timeout=10000)


def snapshot(page):
    return page.evaluate('''() => {
      const {scene,renderer,lightingTransition} = __yard, a = scene.userData.bakedLighting;
      const light = scene.children.find(x=>x.isDirectionalLight);
      return {elapsed:Date.now()-yardWalkClock.enteredAt, clock:{...yardWalkClock}, ...lightingTransition.state,
        atlasIndex:a.presetIndex, bytes:a.gpuBytes, residentSets:a.residentSets,
        shadowStatus:a.transition?.status, textures:renderer.info.memory.textures,
        geometries:renderer.info.memory.geometries, frames:renderer.info.render.frame,
        sun:{color:light.color.getHexString(),intensity:light.intensity,position:light.position.toArray()},
        sky:scene.background.getHexString(), fog:scene.fog.color.getHexString(),
        programs:renderer.info.programs.map(p=>p.diagnostics?.runnable ?? true),
        shadowMap:renderer.shadowMap.enabled, target:renderer.getRenderTarget()};
    }''')


def new_visit(browser, slot=0, mobile=True, exits=5):
    page = browser.new_page(viewport={'width': 390, 'height': 844} if mobile else {'width': 1000, 'height': 800},
                            device_scale_factor=3 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(URL + '/')
               else route.fulfill(status=204, body=''))
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    requests[page] = []
    def finished(request):
        if '/shadows/' in request.url and request.url.endswith('.png'):
            response = request.response()
            requests[page].append({'name': request.url, 'bytes': int(response.headers.get('content-length', 0)),
                                   'duration': request.timing['responseEnd'] - request.timing['requestStart']})
    page.on('requestfinished', finished)
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.clock.install(time=BASE)
    page.clock.pause_at(BASE)
    page.goto(URL + '/index.html')
    page.evaluate('''({slot,exits}) => {
      localStorage.setItem('inteon.yard.lighting.next.v1',String(slot));
      for(let i=0;i<exits;i++) inteonStreet.noteExit();
    }''', {'slot': slot, 'exits': exits})
    page.goto(URL + '/yard/?photo')
    page.add_style_tag(content='body > :not(canvas) { visibility: hidden !important; }')
    wait(page, 'window.__yard?.scene.userData.bakedLightingStatus === "ready" && __yard.scene.getObjectByName("music-logo").material.map')
    return page


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for mobile in (True, False):
            mode = 'mobile' if mobile else 'desktop'
            for slot in range(12):
                page = new_visit(browser, slot, mobile)
                name = f'{mode}-{slot:02}'
                capture = slot in (0, 5, 11)
                start = snapshot(page)
                assert start['mix'] == 0 and start['residentSets'] == 1
                assert start['bytes'] == (4 if mobile else 64) * 1024 ** 2
                page.evaluate('''() => {
                  window.releases = 0;
                  __yard.scene.userData.bakedLighting.texture.addEventListener('dispose',()=>releases++);
                }''')
                if capture:
                    shot(page, name + '-original.png')
                advance_to(page, 7100)
                wait(page, '__yard.scene.userData.bakedLighting.transition.status === "ready"')
                advance_to(page, 10000)
                hold = snapshot(page)
                assert hold['mix'] == 0 and hold['elapsed'] == 10000, hold
                assert hold['sun'] == start['sun'], (hold, start)
                assert hold['bytes'] == start['bytes'] * 2 and hold['residentSets'] == 2
                if capture:
                    shot(page, name + '-hold-10s.png')
                    diff = ImageChops.difference(Image.open(OUT / (name + '-original.png')).convert('RGB'),
                                                Image.open(OUT / (name + '-hold-10s.png')).convert('RGB'))
                    hold['pixelDifferenceBounds'] = diff.getbbox()
                    assert diff.getbbox() is None, (name, diff.getbbox())
                advance_to(page, 20000)
                mid = snapshot(page)
                assert mid['progress'] == .5 and mid['mix'] == .5, mid
                assert mid['frames'] > hold['frames'], 'stationary mobile must render the transition'
                assert mid['textures'] == start['textures'] + 1, (start, mid)
                assert all(mid['programs']) and not mid['shadowMap'] and mid['target'] is None
                if capture:
                    shot(page, name + '-middle.png')
                # Sample the exact mathematical endpoint before armReturn navigates at that instant.
                page.evaluate('''() => {
                  __yard.lightingTransition.update(yardWalkClock.deadline);
                  __yard.renderer.render(__yard.scene,__yard.camera);
                }''')
                end = snapshot(page)
                assert end['mix'] == 1 and end['atlasIndex'] == (slot + 1) % 12, end
                assert end['residentSets'] == 1 and end['bytes'] == start['bytes']
                assert end['textures'] == start['textures'] and page.evaluate('releases') == 1, end
                assert end['durationMs'] == end['clock']['deadline'] - end['holdUntil'] == 20000
                assert page.evaluate('''async()=>{
                  const next=(await import('./baked-lighting.js')).lightingPresetForLayout(__yard.layout,(__yard.lighting.presetIndex+1)%12);
                  const sun=__yard.scene.children.find(x=>x.isDirectionalLight);
                  return Math.abs(sun.intensity-next.sunIntensity)<1e-12 && sun.color.getHexString()===next.sunColor.slice(1);
                }''')
                if capture:
                    shot(page, name + '-endpoint.png')
                    reference = new_visit(browser, (slot + 1) % 12, mobile)
                    shot(reference, name + '-next-original.png')
                    diff = ImageChops.difference(Image.open(OUT / (name + '-endpoint.png')).convert('RGB'),
                                                Image.open(OUT / (name + '-next-original.png')).convert('RGB'))
                    end['referenceMeanAbsoluteRGB'] = ImageStat.Stat(diff).mean
                    end['referenceDifferenceBounds'] = diff.getbbox()
                    assert max(end['referenceMeanAbsoluteRGB']) < .02, (name, end)
                    reference.close()
                resources = requests[page]
                assert len(resources) == 2 and all('ground' not in r['name'] for r in resources), resources
                page.evaluate('''() => {
                  __yard.scene.userData.bakedLighting.texture.addEventListener('dispose',()=>releases++);
                  window.dispatchEvent(new PageTransitionEvent('pagehide'));
                }''')
                cleanup = page.evaluate('({textures:__yard.renderer.info.memory.textures,geometries:__yard.renderer.info.memory.geometries,bytes:__yard.scene.userData.bakedLighting.gpuBytes,releases})')
                assert cleanup == {'textures': 0, 'geometries': 0, 'bytes': 0, 'releases': 2}, cleanup
                report['pairs'].append({'mode': mode, 'slot': slot, 'start': start, 'hold': hold, 'middle': mid, 'endpoint': end, 'cleanup': cleanup, 'requests': resources})
                page.close()
                print(mode, slot, 'PASS', flush=True)

        # The ten-second visit has no spare time; the real return still happens.
        short = new_visit(browser, exits=1)
        advance_to(short, 9990)
        assert snapshot(short)['mix'] == 0 and snapshot(short)['residentSets'] == 1
        short.clock.fast_forward(30)
        short.wait_for_url('**/index.html')
        report['shortVisitReturnedWithoutFade'] = True
        short.close()

        # Live bonus during blending must preserve the current image and extend its endpoint.
        bonus = new_visit(browser)
        advance_to(bonus, 7100)
        wait(bonus, '__yard.scene.userData.bakedLighting.transition.status === "ready"')
        advance_to(bonus, 20000)
        before = snapshot(bonus)
        assert bonus.evaluate('inteonStreet.boundaryPlaybackSucceeded()')
        bonus.evaluate('__yard.lightingTransition.update()')
        after = snapshot(bonus)
        assert after['mix'] == before['mix'] == .5
        assert after['deadline'] - bonus.evaluate('Date.now()') == 1200000
        bonus.clock.fast_forward(600000)
        later = snapshot(bonus)
        assert later['progress'] == .75
        report['bonus'] = {'before': before, 'after': after, 'later': later}
        bonus.close()

        # One missing next asset retains the original map and original light.
        failed = new_visit(browser)
        failed.route('**/shadows/mobile/sun-01.png', lambda route: route.fulfill(status=404, body='missing'))
        before = snapshot(failed)
        advance_to(failed, 7100)
        wait(failed, '__yard.scene.userData.bakedLighting.transition.status === "unavailable"')
        advance_to(failed, 20000)
        after = snapshot(failed)
        assert after['mix'] == 0 and after['sun'] == before['sun'] and after['bytes'] == before['bytes']
        report['missingNextKeepsOriginal'] = after
        failed.close()

        # A delayed second texture joins smoothly; late downloads cannot restart the walk clock.
        delayed = new_visit(browser)
        pending_routes = []
        delayed.route('**/shadows/mobile/sun-01.png', lambda route: pending_routes.append(route))
        advance_to(delayed, 7100)
        wait(delayed, '__yard.scene.userData.bakedLighting.transition.status === "loading"')
        advance_to(delayed, 15000)
        assert snapshot(delayed)['mix'] == 0
        assert pending_routes
        pending_routes[0].fulfill(status=200, content_type='image/png', body=(ROOT/'yard/data/shadows/mobile/sun-01.png').read_bytes())
        wait(delayed, '__yard.scene.userData.bakedLighting.transition.status === "ready"')
        delayed.evaluate('__yard.lightingTransition.update()')
        joined = snapshot(delayed)
        assert joined['mix'] < .00001, joined  # At most one 20 ms test frame after joining.
        advance_to(delayed, 20000)
        middle = snapshot(delayed)
        assert 0 < middle['mix'] < .5, middle
        delayed.evaluate('__yard.lightingTransition.update(yardWalkClock.deadline)')
        assert snapshot(delayed)['mix'] == 1
        report['delayedNext'] = {'joined': joined, 'middle': middle, 'endpoint': snapshot(delayed)}
        delayed.close()

        assert not report['errors'], report['errors']
        report['passed'] = True
        browser.close()
finally:
    (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

print(json.dumps({'pairs': len(report['pairs']), 'passed': report.get('passed', False), 'errors': report['errors']}))
