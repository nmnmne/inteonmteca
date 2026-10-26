"""Cold artwork byte budget, DPR/resize, and real-time full rotation regression."""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/tiny-covers'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8080/'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    for width, height, dpr in [(390,844,1),(390,844,3),(1440,900,2)]:
        context = browser.new_context(viewport={'width':width,'height':height}, device_scale_factor=dpr)
        page = context.new_page()
        page.goto(BASE, wait_until='load')
        page.wait_for_timeout(1600)
        sample = page.evaluate('''() => ({
          resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/track-covers/')).map(r=>({url:r.name,bytes:r.encodedBodySize})),
          loaded:[...document.querySelectorAll('.cover-image')].filter(i=>i.getAttribute('src')).map(i=>({url:i.src,natural:i.naturalWidth,width:i.getBoundingClientRect().width})),
          unassigned:[...document.querySelectorAll('.cover-image')].filter(i=>!i.getAttribute('src')).length
        })''')
        assert sample['loaded'], sample
        assert all('/renditions/' in r['url'] for r in sample['resources']), sample
        sample.update(viewport=[width,height], dpr=dpr, bytes=sum(r['bytes'] for r in sample['resources']))
        assert sample['bytes'] < 20000, sample
        assert sample['unassigned'] > 0, sample
        for image in sample['loaded']:
            need = image['width'] * dpr
            expected = next((n for n in [16,24,32,48,64] if n >= need), 64)
            assert int(re.search(r'-(\d+)\.webp',image['url'])[1]) == expected, image
        if width < 600:
            page.evaluate("inteonCovers.select(INTEONMTECA_PLAYLIST.find(t => t.cover))")
            page.wait_for_timeout(100)
            assert page.locator('.active-cover img').get_attribute('src') is None
            sample['hiddenActiveUnassigned'] = True
        results.append(sample)
        context.close()
    # A real, visible isolated controller fixture removes unrelated animation and
    # scrolling, but does not replace clocks, image loads or intersection observers.
    context = browser.new_context(viewport={'width':390,'height':844}, device_scale_factor=3)
    page = context.new_page()
    page.route('**/cover-fixture', lambda route: route.fulfill(content_type='text/html', body='''
      <div id="host" style="width:8px;height:8px"></div>
      <script src="/playlist-data.js"></script><script src="/track-covers.js"></script>
      <script>window.track=INTEONMTECA_PLAYLIST.reduce((a,b)=>(b.covers?.length||0)>(a.covers?.length||0)?b:a);
      inteonCovers.attach(document.querySelector('#host'),track);</script>'''))
    page.goto(BASE+'cover-fixture')
    page.wait_for_function("document.querySelector('img')?.naturalWidth > 0")
    assert page.locator('img').get_attribute('src').endswith('-24.webp')
    page.locator('#host').evaluate("h=>{h.style.width='20px';h.style.height='20px'}")
    page.wait_for_function("document.querySelector('img').src.endsWith('-64.webp')")
    cdp = context.new_cdp_session(page)
    cdp.send('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':False})
    page.wait_for_function("document.querySelector('img').src.endsWith('-24.webp')")
    count = page.evaluate('track.covers.length')
    seen = []
    for _ in range(270):
        index = page.locator('#host').get_attribute('data-cover-index')
        if not seen or seen[-1] != index:
            seen.append(index)
        if len(seen) == count + 1:
            break
        page.wait_for_timeout(250)
    start = int(seen[0])
    assert seen == [str((start + n) % count) for n in range(count + 1)], seen
    resources = page.evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('/track-covers/')).map(r=>r.name)")
    assert all('/renditions/' in url for url in resources), resources
    results.append({'rotation':seen,'count':count,'liveResizeAndDpr':True})
    browser.close()
(OUT/'measurements.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps([{'viewport':r.get('viewport'),'dpr':r.get('dpr'),'bytes':r.get('bytes'),'rotation':r.get('rotation')} for r in results]))
