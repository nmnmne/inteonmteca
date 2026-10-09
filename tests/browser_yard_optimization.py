"""Repeatable local scene samples; mobile emulation is not a phone GPU benchmark."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--label', default='after')
args = parser.parse_args()
out = ROOT / 'tests/artifacts/yard-optimization' / args.label
out.mkdir(parents=True, exist_ok=True)
report = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for mobile in (False, True):
        page = browser.new_page(viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 900},
                                is_mobile=mobile, has_touch=mobile, device_scale_factor=3 if mobile else 1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("localStorage.setItem('inteon.yard.lighting.next.v1', '0')")
        page.goto('http://127.0.0.1:8080/yard/', wait_until='domcontentloaded')
        page.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus === "ready" && __yard.scene.getObjectByName("music-logo").material.map')
        # Hold just the lighting timeline while comparing identical viewpoints.
        page.evaluate('yardWalkClock.enteredAt = Date.now() + 1000000; inteonStreet.boundaryPlaybackSucceeded()')
        rows = page.evaluate('''async () => {
          const y = __yard, rows = [];
          for (const pose of [y.layout.spawn, y.layout.photoView]) for (let i=0;i<4;i++) {
            Object.assign(y.body, pose, {yaw:pose.yaw+i*Math.PI/2});
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            rows.push({...y.renderer.info.render});
          }
          return rows;
        }''')
        for label, expression in [('spawn', '__yard.layout.spawn'), ('photo', '__yard.layout.photoView'),
                                  ('ground', '({...__yard.layout.spawn,pitch:-.7})')]:
            page.evaluate(f'Object.assign(__yard.body,{expression})')
            page.wait_for_timeout(70)
            page.locator('#yard-view').screenshot(path=str(out / f'{"mobile" if mobile else "desktop"}-{label}.png'))
        before = page.evaluate('__yard.renderer.info.render.frame')
        page.wait_for_timeout(500)
        idle = page.evaluate('__yard.renderer.info.render.frame') - before
        movement = page.evaluate('''async () => {
          const y=__yard, start=y.renderer.info.render.frame, samples=[];
          let previous=performance.now();
          for(let i=0;i<100;i++) {
            y.body.yaw+=.003;
            await new Promise(requestAnimationFrame);
            const now=performance.now(); samples.push(now-previous);previous=now;
          }
          samples.sort((a,b)=>a-b);
          return {frames:y.renderer.info.render.frame-start,medianMs:samples[50],p95Ms:samples[95]};
        }''')
        state = page.evaluate('''() => ({memory:__yard.renderer.info.memory,
          shadowBytes:__yard.scene.userData.bakedLighting.gpuBytes,
          programs:__yard.renderer.info.programs.map(p=>p.diagnostics?.runnable ?? true),
          batches:__yard.scene.userData.staticBatches,quality:__yard.quality?.snapshot()})''')
        assert not errors and all(state['programs']), errors
        assert movement['frames'] >= 95, movement
        if args.label == 'after':
            assert idle == 0, idle
        report.append(dict(mobileEmulation=mobile,rows=rows,idleFrames=idle,movement=movement,state=state,errors=errors))
        page.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report), flush=True)
