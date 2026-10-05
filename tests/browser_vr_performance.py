"""Sequential A/B measurements; same browser, scripts, viewport and idle workload."""
import json
import statistics
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/vr-final'
baseline = (OUT / 'start/home-player.css').read_text(encoding='utf-8')
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for width, height in [(390, 844), (1440, 900)]:
        for trial in range(3):
            for variant in ['before', 'after']:
                context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=width<700, has_touch=width<700)
                page = context.new_page()
                if variant == 'before':
                    page.route('**/home-player.css*', lambda route: route.fulfill(content_type='text/css', body=baseline))
                page.add_init_script('''window.qaDraws=0;const f=CanvasRenderingContext2D.prototype.clearRect;
                  CanvasRenderingContext2D.prototype.clearRect=function(...a){qaDraws++;return f.apply(this,a)};''')
                page.goto('http://127.0.0.1:8080/', wait_until='networkidle')
                page.wait_for_timeout(1200)
                cdp = context.new_cdp_session(page)
                cdp.send('Performance.enable')
                def metrics():
                    return {x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
                start = metrics()
                draws = page.evaluate('qaDraws')
                page.wait_for_timeout(3000)
                end = metrics()
                row = {k: round(end[k]-start[k], 5) for k in ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount']}
                row.update(variant=variant, viewport=[width,height], trial=trial, canvasClears=page.evaluate('qaDraws')-draws)
                results.append(row)
                context.close()
    browser.close()
medians = []
for width in [390,1440]:
    for variant in ['before','after']:
        rows = [r for r in results if r['viewport'][0]==width and r['variant']==variant]
        medians.append({'width':width,'variant':variant, **{k:statistics.median(r[k] for r in rows) for k in ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','canvasClears']}})
(OUT/'performance.json').write_text(json.dumps({'windowSeconds':3,'trials':results,'medians':medians},indent=2))
print(json.dumps(medians, indent=2))
