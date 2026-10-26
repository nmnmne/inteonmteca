"""Real shared schedule boundaries, retained acid pixels, and GPU/quality UI.

Runs two fresh pages sequentially. It observes the first ambient event as the
clock epoch; no production clocks, renderer results, or frame intervals are
replaced. Automatic logo scenes alone are held by a disposable test owner.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


OUT = Path(__file__).parent / 'artifacts' / 'continuous-quality'
URL = 'http://127.0.0.1:8080/'
INIT = r"""(() => {
  const d = new Date();
  localStorage.setItem('inteonmteca-theme-duration', '604800000');
  localStorage.setItem('inteonmteca-theme-duration-day', `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`);
  localStorage.setItem('inteonmteca-debug-enabled', '1');
  sessionStorage.setItem('inteon-storm-last', String(Date.now()));
  window.__continuousQA = {epoch:null, edges:[], quality:[], marks:[],
    acidFrames:0, acidClears:0, acidDraws:0, gpuAttempts:[], gpuContexts:[]};
  const qa = window.__continuousQA;
  addEventListener('inteon-ambient-change', () => {
    const at = performance.now();
    if (qa.epoch === null) {
      qa.epoch = at;
      window.inteonHomeEffects?.claim('qa-continuous');
    }
    qa.edges.push({at, sinceEpoch:at-qa.epoch,
      phase:document.documentElement.dataset.ambientPhase,
      mode:document.documentElement.dataset.logoMotion});
  });
  addEventListener('inteon-quality-state', e => qa.quality.push({at:performance.now(), ...e.detail}));
  const raf = requestAnimationFrame, origins = new WeakMap();
  window.requestAnimationFrame = fn => {
    if (!origins.has(fn)) origins.set(fn, String(new Error().stack).includes('logo-acid.js'));
    return raf(now => { if (origins.get(fn)) qa.acidFrames++; fn(now); });
  };
  for (const [method, counter] of [['clearRect', 'acidClears'], ['drawImage', 'acidDraws']]) {
    const original = CanvasRenderingContext2D.prototype[method];
    CanvasRenderingContext2D.prototype[method] = function(...args) {
      if (this.canvas.classList.contains('logo-acid')) qa[counter]++;
      return original.apply(this, args);
    };
  }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, options) {
    const context = getContext.call(this, type, options);
    if (type !== 'webgl' && type !== 'webgl2') return context;
    qa.gpuAttempts.push({type, preference:options?.powerPreference, available:Boolean(context)});
    if (!context || qa.gpuContexts.some(item => item.context === context)) return context;
    const item = {context, preference:options?.powerPreference, loses:0};
    qa.gpuContexts.push(item);
    const extension = context.getExtension.bind(context), wrapped = new WeakSet();
    context.getExtension = name => {
      const result = extension(name);
      if (name === 'WEBGL_lose_context' && result && !wrapped.has(result)) {
        wrapped.add(result);
        const lose = result.loseContext.bind(result);
        result.loseContext = () => { item.loses++; return lose(); };
      }
      return result;
    };
    return context;
  };
})();"""

SETUP = r"""() => {
  if (typeof cancelLogoTimers === 'function') cancelLogoTimers();
  window.inteonMobileLogo?.stop(); window.inteonLogoStorm?.stop();
  window.inteonLogoAcid?.stop(); window.inteonLogoMaterials?.stop();
  window.inteonAtmosphere?.stop(); window.inteonThemeMorph?.finish();
  if (typeof renderLogoMatrix === 'function') renderLogoMatrix(true);
  if (typeof cancelLogoTimers === 'function') cancelLogoTimers();
  inteonHomeEffects.setLogoScattered('particles', false);
  if (!inteonHomeEffects.active) inteonHomeEffects.claim('qa-continuous');
  if (inteonHomeEffects.active !== 'qa-continuous') throw Error('test owner unavailable');
  return {epoch:__continuousQA.epoch, now:performance.now()};
}"""

SNAP = r"""() => {
  const qa = __continuousQA, node = window.__continuousAcid;
  let bitmap = null;
  if (node?.isConnected) {
    const ctx = node.getContext('2d');
    // Warm the GPU readback before exact byte comparison: some drivers round
    // a few channels once during the first GPU-to-CPU backing-store transfer.
    ctx.getImageData(0, 0, node.width, node.height);
    const pixels = ctx.getImageData(0, 0, node.width, node.height).data;
    const hash = values => {
      let n = 2166136261;
      for (const value of values) { n ^= value; n = Math.imul(n, 16777619); }
      return n >>> 0;
    };
    bitmap = {width:node.width, height:node.height, hash:hash(pixels),
      repeatHash:hash(ctx.getImageData(0, 0, node.width, node.height).data)};
  }
  const at = performance.now();
  return {at, sinceEpoch:at-qa.epoch, phase:document.documentElement.dataset.ambientPhase,
    mode:document.documentElement.dataset.logoMotion, clock:inteonHomeEffects.ambientNow(),
    acidConnected:Boolean(node?.isConnected), sameCanvas:node === document.querySelector('.logo-acid'), bitmap,
    acidFrames:qa.acidFrames, acidClears:qa.acidClears, acidDraws:qa.acidDraws,
    letters:window.inteonTextMotion?.updates,
    glyphs:[...document.querySelectorAll('.text-wave-mask')].map(e => e.dataset.glyph || '').join(''),
    quality:inteonGraphicsQuality.snapshot()};
}"""


def wait_epoch(page, offset):
    page.wait_for_function('(offset) => performance.now()-__continuousQA.epoch >= offset', arg=offset)


def new_page(browser):
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    context.add_init_script(INIT)

    def route(request):
        if request.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            request.abort()
        elif '/api/chat' in request.request.url:
            request.fulfill(json={'messages': []})
        else:
            request.continue_()

    context.route('**/*', route)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('window.inteonLogoAcid && window.inteonGraphicsQuality && __continuousQA.epoch !== null')
    setup = page.evaluate(SETUP)
    assert setup['now'] - setup['epoch'] < 2500, ('page was too late for a real +3s start', setup)
    return context, page, errors


def late_acid(browser):
    context, page, errors = new_page(browser)
    try:
        page.evaluate(r"""() => {
          setTimeout(() => {
            if (typeof cancelLogoTimers === 'function') cancelLogoTimers();
            inteonHomeEffects.release('qa-continuous');
            const started = Boolean(inteonLogoAcid.run());
            window.__continuousAcid = document.querySelector('.logo-acid');
            __continuousQA.marks.push({name:'acid-start', at:performance.now(), started});
          }, Math.max(0, __continuousQA.epoch + 3000 - performance.now()));
        }""")
        page.wait_for_function('__continuousQA.marks.length > 0', timeout=5000)
        start = page.evaluate('__continuousQA.marks[0]')
        epoch = page.evaluate('__continuousQA.epoch')
        assert start['started'] and 2950 <= start['at'] - epoch <= 3300, start
        page.wait_for_function("document.documentElement.dataset.ambientPhase === 'frozen'", timeout=2500)
        wait_epoch(page, 4300)
        before = page.evaluate(SNAP)
        wait_epoch(page, 12800)
        after = page.evaluate(SNAP)
        assert before['phase'] == after['phase'] == 'frozen', (before, after)
        assert after['acidConnected'] and after['sameCanvas'], after
        assert before['clock'] == after['clock'], (before, after)
        assert before['bitmap'] == after['bitmap'] and before['bitmap']['hash'] == before['bitmap']['repeatHash']
        for key in ('acidFrames', 'acidClears', 'acidDraws'):
            assert before[key] == after[key], (key, before[key], after[key])
        assert after['letters'] > before['letters'] and after['glyphs'] != before['glyphs']
        page.wait_for_function("document.documentElement.dataset.ambientPhase === 'running'", timeout=2500)
        page.wait_for_timeout(150)
        resumed = page.evaluate(SNAP)
        assert resumed['acidConnected'] and resumed['sameCanvas'], resumed
        assert 0 < resumed['clock'] - after['clock'] < 600, (after, resumed)
        assert resumed['acidFrames'] > after['acidFrames'] and resumed['bitmap']['hash'] != after['bitmap']['hash']
        edges = page.evaluate('__continuousQA.edges')
        frozen = next(e for e in edges if e['phase'] == 'frozen')
        running = next(e for e in edges if e['phase'] == 'running' and e['at'] > frozen['at'])
        assert 3900 <= frozen['sinceEpoch'] <= 4350, edges
        assert 650 <= frozen['at'] - start['at'] <= 1350, (start, frozen)
        assert 9900 <= running['at'] - frozen['at'] <= 10400, edges
        assert not errors, errors
        return {'start':start, 'epoch':epoch, 'frozen':frozen, 'running':running,
                'before':before, 'after':after, 'resumed':resumed, 'edges':edges, 'errors':errors}
    finally:
        context.close()


def skipped_boundaries_and_gpu(browser):
    context, page, errors = new_page(browser)
    try:
        page.evaluate(r"""() => {
          for (const [offset, scattered] of [[5000, true], [10400, false]]) {
            setTimeout(() => {
              inteonHomeEffects.setLogoScattered('qa-late-entry', scattered);
              __continuousQA.marks.push({name:scattered?'late-scattered':'late-assembled', at:performance.now()});
            }, Math.max(0, __continuousQA.epoch + offset - performance.now()));
          }
        }""")
        snapshots = []
        for offset, mode in [(4250, 'assembled'), (5250, 'scattered'), (10250, 'scattered'), (10650, 'assembled')]:
            wait_epoch(page, offset)
            snap = page.evaluate(SNAP)
            assert snap['phase'] == 'running' and snap['mode'] == mode, snap
            snapshots.append(snap)
        edges = page.evaluate('__continuousQA.edges')
        assert not any(e['phase'] == 'frozen' for e in edges), edges
        # Observe the controller's first real sample; no synthetic rAF timings.
        page.wait_for_function('__continuousQA.quality.some(q => q.sampleDurationMs >= 4000)', timeout=8000)
        quality_events = page.evaluate('__continuousQA.quality')
        measured = next(q for q in quality_events if q['sampleDurationMs'] >= 4000)
        sampling = next(q for q in quality_events if q['state'] == 'sampling')
        assert 3950 <= measured['at'] - sampling['at'] < 5500, (sampling, measured)
        assert measured['activeSampleMs'] >= 3500 and measured['sampleFrames'] > 15, measured
        assert measured['activeFps'] > 0 and measured['p95FrameMs'] > 0 and measured['cadenceFps'] > 0, measured
        details = page.locator('.development-quality-details')
        details.locator('summary').click()
        slider = page.get_by_role('slider', name='Уровень графики на одну минуту')
        slider.evaluate("element => { element.value = '7'; element.dispatchEvent(new Event('input', {bubbles:true})); }")
        manual_before = page.evaluate('inteonGraphicsQuality.snapshot()')
        assert manual_before['mode'] == 'manual' and manual_before['level'] == 7, manual_before
        page.get_by_role('button', name='Проверить доступный GPU', exact=True).click()
        page.wait_for_timeout(250)
        manual_after = page.evaluate('inteonGraphicsQuality.snapshot()')
        assert manual_after['mode'] == 'manual' and manual_after['level'] == 7, manual_after
        assert manual_after['manualUntil'] == manual_before['manualUntil'], (manual_before, manual_after)
        assert manual_after['reason'] == 'gpu-probe', manual_after
        gpu = page.evaluate(r"""() => ({attempts:__continuousQA.gpuAttempts,
          contexts:__continuousQA.gpuContexts.map(item => ({preference:item.preference,
            loses:item.loses, lost:item.context.isContextLost()}))})""")
        assert {a['preference'] for a in gpu['attempts']} == {'default', 'high-performance'}, gpu
        assert all(c['loses'] == 1 and c['lost'] for c in gpu['contexts']), gpu
        panel = details.inner_text()
        assert 'обычный:' in panel and 'Производительный:' in panel and 'Canvas2D' in panel, panel
        assert 'p95:' in panel and 'Ориентир частоты:' in panel, panel
        page.screenshot(path=str(OUT / 'gpu-quality-panel.png'))
        assert not errors, errors
        return {'snapshots':snapshots, 'edges':edges, 'marks':page.evaluate('__continuousQA.marks'),
                'sampling':sampling, 'measured':measured, 'manualBefore':manual_before,
                'manualAfter':manual_after, 'gpu':gpu, 'panel':panel, 'errors':errors}
    finally:
        context.close()


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel='msedge', headless=True,
                args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
            try:
                report['lateAcid'] = late_acid(browser)
                (OUT / 'late-acid.json').write_text(json.dumps(report['lateAcid'], ensure_ascii=False, indent=2), encoding='utf-8')
                print('PASS late acid: global +4s boundary, retained 10s freeze, live letters, smooth resume', flush=True)
                report['qualityAndSkipped'] = skipped_boundaries_and_gpu(browser)
                print('PASS skipped boundaries: no retroactive freeze; real4s sample; GPU contexts disposed; manual level retained', flush=True)
            finally:
                browser.close()
    finally:
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
