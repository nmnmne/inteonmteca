"""Visual review evidence, using the running local app and real Edge/WebGL."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'after'
OUT = ROOT / 'tests/artifacts/vr-final' / LABEL
OUT.mkdir(parents=True, exist_ok=True)
report = {}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for width, height in [(1440, 900), (390, 844), (320, 568), (844, 390)]:
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      is_mobile=width < 700 or height < 450,
                                      has_touch=width < 700 or height < 450)
        page = context.new_page()
        page.goto('http://127.0.0.1:8080/', wait_until='networkidle')
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / f'home-{width}x{height}-slate.png'))
        report[f'home-{width}'] = page.evaluate('''() => ({
          theme:document.documentElement.dataset.theme,
          animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName,target:a.effect.target.id||a.effect.target.className})),
          resources:performance.getEntriesByType('resource').filter(r=>/vr-room|logo-fragmented/.test(r.name)).map(r=>({name:r.name,bytes:r.transferSize}))
        })''')
        context.close()
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800}, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if 'Shader Error' in m.text else None)
        for slot in [0, 5, 11]:
            page.goto('http://127.0.0.1:8080/')
            page.evaluate('i=>localStorage.setItem("inteon.yard.lighting.next.v1",i)', str(slot))
            page.locator('#street-link').click()
            page.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus === "ready"', timeout=45000)
            # Inspection uses a long test visit, never changing the production timer rule.
            page.evaluate('inteonStreet.boundaryPlaybackSucceeded()')
            for name, pose in [('spawn', None), ('near', {'x': -20, 'z': 60, 'yaw': 0, 'pitch': -.7}), ('moved', {'x': -18, 'z': 62, 'yaw': .5, 'pitch': -.7}), ('photo', 'photoView')]:
                if pose:
                    page.evaluate('p=>Object.assign(__yard.body,typeof p==="string"?__yard.layout[p]:p)', pose)
                page.wait_for_timeout(250)
                page.screenshot(path=str(OUT / f'yard-{int(mobile)}-{slot:02}-{name}.png'))
            report[f'yard-{int(mobile)}-{slot}'] = page.evaluate('''() => {
              const b=__yard.scene.userData.bakedLighting;
              return {preset:__yard.lighting.localMoment,bytes:b.gpuBytes,groundReceivers:b.groundReceivers,
                resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/shadows/')).map(r=>({name:r.name,bytes:r.transferSize})),
                shadowMap:__yard.renderer.shadowMap.enabled,programs:__yard.renderer.info.programs.map(p=>p.diagnostics?.runnable??true)};
            }''')
        report[f'yard-errors-{mobile}'] = errors
        context.close()
    browser.close()
(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(OUT)
