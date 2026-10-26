"""Manual graphics tiers: calibrated desktop rAF, stable pools, visible core motion."""
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
OUT = ROOT / 'artifacts' / 'graphics-levels'
OUT.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('benchmark', ROOT / 'artifacts' / 'fps-priority-20261026' / 'calibrated_benchmark.py')
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)

SNAPSHOT = '''() => ({
  at:performance.now(),
  level:inteonGraphicsQuality.level,phase:document.documentElement.dataset.ambientPhase,
  owner:inteonHomeEffects.active,target:inteonTextMotion.targetFps,updates:inteonTextMotion.updates,
  glyphs:document.querySelectorAll('.text-wave-char').length,
  glyphSignature:[...document.querySelectorAll('.text-wave-mask')].map(e=>e.dataset.glyph||'').join(''),
  logoTransform:getComputedStyle(document.querySelector('.reactive-logo')).transform,
  logoOutlineDisplay:getComputedStyle(document.querySelector('.logo-vector-outline')).display,
  logoOutlineFilter:getComputedStyle(document.querySelector('.logo-vector-outline')).filter,
  field:[...document.querySelectorAll('.material-field,.logo-ripples,.logo-reactive-canvas,#perception-visual')].map(c=>({class:c.className,id:c.id,width:c.width,height:c.height,data:{...c.dataset}})),
  pools:[perceptionField,windMotes,logoFilamentSeeds,logoSlices].map(p=>p.length),
  poolIdentity:[perceptionField,windMotes,logoFilamentSeeds,logoSlices].every((pool,index)=>pool===__graphicsPools[index]&&pool.every((item,n)=>item===__graphicsItems[index][n])),
  logoDomIdentity:logoParticles.children.length===__logoDom.length&&[...logoParticles.children].every((element,index)=>element===__logoDom[index]),
  font:getComputedStyle(document.querySelector('.track-title')).fontFamily,
  profile:{...sceneGraphics()}
})'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True, args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
    context = browser.new_context(viewport={'width':1440,'height':900}, device_scale_factor=1)
    context.add_init_script(benchmark.INIT)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/chat', lambda route: route.fulfill(json={'messages':[]}))
    cdp = context.new_cdp_session(page)
    cdp.send('Performance.enable')
    page.goto('about:blank')
    empty = benchmark.measure(page, cdp, 'empty-page', 1.25, OUT)
    page.goto('http://127.0.0.1:8080/', wait_until='networkidle')
    page.evaluate(benchmark.STOP)
    page.wait_for_function("document.querySelector('.logo-ripples')?.dataset.activeParticles && document.querySelector('.material-field')?.dataset.dust")
    page.evaluate('''() => {
      window.__graphicsPools=[perceptionField,windMotes,logoFilamentSeeds,logoSlices];
      window.__graphicsItems=__graphicsPools.map(pool=>[...pool]);
      window.__logoDom=[...logoParticles.children];
      window.__actualAudioBands=inteonAudioBands;
      // The same maximum letter workload at every tier isolates graphics cost.
      window.inteonAudioBands=Object.freeze({read:()=>({playing:true,mid:1,bass:0})});
    }''')
    page.wait_for_function('inteonTextMotion.targetFps>143.99')
    cases = []
    for level in [1,5,10]:
        page.evaluate('(level)=>inteonGraphicsQuality.setManualLevel(level)', level)
        page.wait_for_function('(level)=>!inteonHomeEffects.ambientPaused && document.querySelector(".material-field").dataset.graphicsLevel===String(level) && document.querySelector(".logo-ripples").dataset.graphicsLevel===String(level)',arg=level)
        page.wait_for_timeout(180)
        before = page.evaluate(SNAPSHOT)
        measurement = benchmark.measure(page, cdp, f'level-{level}', 1.25, OUT)
        after = page.evaluate(SNAPSHOT)
        assert before['poolIdentity'] and after['poolIdentity'] and after['logoDomIdentity'], after
        assert after['target'] > 143.99 and after['updates'] > before['updates'], after
        assert before['glyphSignature'] != after['glyphSignature'], 'letters keep changing'
        assert before['logoTransform'] != after['logoTransform'], 'main logo keeps moving'
        assert after['logoOutlineDisplay'] != 'none', after
        assert before['phase'] == after['phase'] == 'running', 'measurement must fit active phase'
        page.screenshot(path=str(OUT / f'level-{level}.png'))
        cases.append({'level':level,'before':before,'after':after,'measurement':measurement,
                      'actualLetterUpdatesPerSecond':(after['updates']-before['updates'])/((after['at']-before['at'])/1000)})
    # The expensive renderers rest; display-driven letters must still run at level 1.
    page.evaluate('inteonGraphicsQuality.setManualLevel(1)')
    page.wait_for_function('inteonHomeEffects.ambientPaused', timeout=22000)
    rest_before=page.evaluate(SNAPSHOT)
    page.wait_for_timeout(600)
    rest_after=page.evaluate(SNAPSHOT)
    assert rest_before['glyphSignature'] != rest_after['glyphSignature']
    assert rest_after['target'] > 143.99 and rest_after['updates'] > rest_before['updates']
    page.evaluate('window.inteonAudioBands=__actualAudioBands')
    report={'empty':empty,'cases':cases,'rest':{'before':rest_before,'after':rest_after},'errors':errors}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    assert not errors, errors
    print(json.dumps({'cases':[{'level':case['level'],'raf':case['measurement']['rafCallbacksPerSecond'],'taskPct':case['measurement']['mainThreadTaskPercent'],'letters':case['actualLetterUpdatesPerSecond'],'pools':case['after']['pools'],'field':case['after']['field']} for case in cases],'errors':errors},ensure_ascii=False))
    browser.close()
