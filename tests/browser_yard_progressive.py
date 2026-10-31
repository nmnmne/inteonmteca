"""Nearest detail is usable before distant geometry and optional shadow downloads."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'tests/artifacts/yard-progressive'
out.mkdir(parents=True, exist_ok=True)
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for mobile, query in [(False, ''), (True, 'photo=1&')]:
        context = browser.new_context(viewport={'width': 390 if mobile else 1440,
                                               'height': 844 if mobile else 900},
                                      is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""
          window.addEventListener('inteon-yard-entered', () => {
            window.firstYardFrame = {
              time: performance.now(), ready: document.documentElement.dataset.yardReady,
              details: structuredClone(__yard.scene.userData.detailLoading),
              position: {...__yard.body}, frames: __yard.renderer.info.render.frame
            };
          });
        """)
        # Block optional assets: neither the first frame nor distant detail may depend on them.
        page.route('**/shadows/**/*.png', lambda route: route.abort())
        page.goto(f'http://127.0.0.1:8080/yard/?{query}portal-preview=1', wait_until='domcontentloaded')
        page.wait_for_function('window.firstYardFrame && __yard.scene.userData.detailLoading.status === "ready"')
        result = page.evaluate("""() => {
          const state = __yard.scene.userData;
          return {first: firstYardFrame, details: state.detailLoading,
            fallback: document.body.classList.contains('yard-unavailable'),
            programs: __yard.renderer.info.programs.map(p => p.diagnostics?.runnable ?? true),
            buildings: __yard.layout.buildings.map(b => ({id: b.id, ring: b.footprint})),
            shadows: state.bakedLightingStatus};
        }""")
        first = result['first']
        assert first['ready'] == 'true' and first['frames'] > 0
        assert len(first['details']['completed']) == 1
        assert len(result['details']['completed']) == result['details']['total']
        assert len(set(result['details']['completed'])) == result['details']['total']
        assert not result['fallback'] and all(result['programs']) and not errors, errors
        def distance(building):
            x, z = first['position']['x'], first['position']['z']
            ring = building['ring']
            nearest = float('inf')
            for a, b in zip(ring, ring[1:] + ring[:1]):
                dx, dz = b[0]-a[0], b[1]-a[1]
                t = max(0, min(1, ((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
                nearest = min(nearest, ((x-a[0]-dx*t)**2+(z-a[1]-dz*t)**2)**.5)
            return nearest
        expected = [b['id'] for b in sorted(result.pop('buildings'), key=distance)]
        assert result['details']['completed'] == expected, (expected, result['details'])
        # Render gate must wake as detail arrives even while the player stays still.
        assert page.evaluate('__yard.renderer.info.render.frame') > first['frames']
        page.screenshot(path=str(out / f'complete-{mobile}.png'))
        result['mobile'] = mobile
        reports.append(result)
        context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print(json.dumps(reports, ensure_ascii=False))
