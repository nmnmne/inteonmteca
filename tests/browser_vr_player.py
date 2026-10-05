"""Repeatable home audit in real Chromium; mobile is emulated, not hardware."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/vr-player'
OUT.mkdir(parents=True, exist_ok=True)
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'after'
SIZES = [(1440, 900), (1280, 720), (1024, 768), (800, 600), (390, 844), (320, 568), (844, 390), (667, 375)]

def measure(page, context):
    cdp = context.new_cdp_session(page)
    cdp.send('Performance.enable')
    def metrics():
        return {x['name']: x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
    before = metrics()
    page.wait_for_timeout(3000)
    after = metrics()
    cdp.detach()
    return {k: round(after[k] - before[k], 5) for k in ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount']}

def visible_row(page):
    index = page.locator('#track-list').evaluate('''el => {
        const b=el.getBoundingClientRect(); return [...el.children].findIndex(x=>{
            const r=x.querySelector('button').getBoundingClientRect();return r.top>=b.top && r.bottom<=b.bottom;
        });
    }''')
    if index < 0:
        index = page.locator('#track-list').evaluate('''el => {
            const b=el.getBoundingClientRect();return [...el.children].findIndex(x=>{const r=x.getBoundingClientRect();return r.top<=b.top+b.height/2 && r.bottom>b.top+b.height/2});
        }''')
        row = page.locator('.track-select').nth(index)
        row.scroll_into_view_if_needed()
        page.wait_for_timeout(200)
    assert index >= 0
    return page.locator('.track-select').nth(index)

def verify(page, ctx, width, height, mobile):
    panel = page.locator('#active-player')
    assert panel.is_visible() and panel.get_attribute('aria-hidden') == 'false'
    assert page.locator('#close-track').count() == 0
    assert page.locator('#immersive-play').is_disabled()
    assert page.evaluate('player.paused && currentTrack === null')
    rect = panel.bounding_box()
    playlist = page.locator('#track-list').bounding_box()
    assert playlist['y'] + playlist['height'] <= rect['y'] - 5, (playlist, rect)
    assert rect['y'] + rect['height'] < height and rect['x'] >= 0
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    shapes = page.locator('.track-select').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height,getComputedStyle(e).borderRadius]})')
    assert all(s == shapes[0] for s in shapes), shapes
    for selector in ['#immersive-play', '#previous-track', '#next-track', '#track-progress', '#track-volume', '#street-link', '#chat-hint']:
        box = page.locator(selector).bounding_box()
        assert box['width'] >= 44 and box['height'] >= 44, (selector, box)
        assert 0 <= box['x'] and box['x'] + box['width'] <= width + 1, (selector, box)
    if mobile:
        seek = page.locator('#track-progress').bounding_box()
        play = page.locator('#immersive-play').bounding_box()
        assert seek['y'] >= play['y'] + play['height']
        box = page.locator('#track-list').bounding_box()
        cdp = ctx.new_cdp_session(page)
        x, y = box['x']+box['width']/2, box['y']+box['height']*.75
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        for step in range(1,7):
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y-step*7}]})
            page.wait_for_timeout(25)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        cdp.detach()
        page.wait_for_timeout(600)
        assert page.evaluate('player.paused && currentTrack === null'), 'Swipe selected audio'
    # Multiple full cycles in BOTH directions, with a bounded DOM.
    page.mouse.move(playlist['x']+playlist['width']/2, playlist['y']+playlist['height']/2)
    for direction in [1, -1]:
        for _ in range(6):
            page.mouse.wheel(0, direction*1200)
            page.wait_for_timeout(350)
        page.wait_for_function('playlistScrollRaf === 0', timeout=10000)
        assert page.evaluate('playlistList.scrollTop > 0 && playlistList.scrollTop < playlistList.scrollHeight-playlistList.clientHeight')
        assert page.evaluate('playlistList.children.length <= tracks.length * 8')
    row = visible_row(page)
    original = page.evaluate('({nodes:[...playlistList.children].map(x=>x.dataset.trackIndex), top:playlistList.scrollTop})')
    row.click()
    page.wait_for_function('!player.paused && player.currentTime > .05')
    page.wait_for_timeout(750)
    after_selection = page.evaluate('({nodes:[...playlistList.children].map(x=>x.dataset.trackIndex), top:playlistList.scrollTop})')
    assert after_selection == original, ('Selection moved catalogue', original, after_selection)
    assert page.locator('#immersive-play-icon').get_attribute('data-state') == 'playing'
    assert row.get_attribute('aria-pressed') == 'true'
    assert page.locator('audio').count() == 1
    page.screenshot(path=str(OUT / f'{LABEL}-{width}x{height}-playing.png'))
    page.locator('#immersive-play').focus()
    page.keyboard.press('Enter')
    page.wait_for_function('player.paused')
    page.wait_for_function('immersivePlayIcon.dataset.state === "paused"')
    assert page.locator('#immersive-play-icon').get_attribute('data-state') == 'paused'
    assert panel.is_visible()
    page.keyboard.press('Escape')
    assert panel.is_visible() and page.evaluate('currentTrack !== null')
    page.locator('#immersive-play').click()
    page.wait_for_function('!player.paused')
    before_src = page.evaluate('player.src')
    page.locator('#next-track').click()
    page.wait_for_function('(src)=>player.src!==src && !player.paused', arg=before_src)
    page.wait_for_timeout(300)
    page.locator('#previous-track').click()
    page.wait_for_function('(src)=>player.src===src && !player.paused', arg=before_src)
    page.wait_for_function('player.duration > 1')
    page.locator('#track-progress').fill('350')
    page.wait_for_function('player.currentTime > player.duration*.3')
    page.locator('#track-volume').fill('0.3')
    assert page.evaluate('Math.abs(player.volume-.3)<.01')
    if width in (1440,390):
        page.evaluate('window.qaEnded=0; player.addEventListener("ended",e=>{if(e.isTrusted)qaEnded++},{once:true}); player.playbackRate=8; player.currentTime=player.duration-1')
        page.wait_for_function('window.qaEnded === 1', timeout=20000)
        page.wait_for_function('(src)=>player.src !== src && !player.paused', arg=before_src)
        page.evaluate('player.playbackRate=1')
        assert panel.is_visible()
    page.locator('#immersive-play').click()
    page.wait_for_function('player.paused')
    # Long labels use the same tile and have an accessible full title.
    row = visible_row(page)
    row.evaluate('e=>{window.qaLabel=e.querySelector(".track-title").textContent;e.querySelector(".track-title").textContent="Очень длинное название / An unusually long track title for a layout regression";}')
    assert abs(row.bounding_box()['height'] - shapes[0][1]) < 1
    row.evaluate('e=>e.querySelector(".track-title").textContent=qaLabel')
    for name in ['theme', 'auth', 'chat']:
        page.locator(f'#{name}-hint').click()
        assert page.locator(f'#{name}-panel').is_visible()
        if name == 'theme':
            old = row.evaluate('e=>getComputedStyle(e).backgroundImage')
            page.locator('#theme-select').select_option('oxblood')
            assert row.evaluate('e=>getComputedStyle(e).backgroundImage') != old
        if name == 'chat':
            page.screenshot(path=str(OUT / f'{LABEL}-{width}x{height}-chat.png'))
        page.keyboard.press('Escape')
        assert page.locator(f'#{name}-panel').is_hidden()
        assert page.locator(f'#{name}-hint').evaluate('e=>e===document.activeElement')
        assert panel.is_visible()
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.heading-letter').first.evaluate('e=>getComputedStyle(e).animationName') == 'none'
    return {'realPlayback': True, 'nativeEnded': width in (1440,390), 'cyclesBothWays': True, 'selectionStable': True, 'panelsKeyboardTheme': True, 'touchSwipe': mobile}

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    results = []
    for width, height in (SIZES if len(sys.argv) < 3 else [tuple(map(int, sys.argv[2].split('x')))]):
        mobile = width < 700 or height < 450
        ctx = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**/*', lambda r: r.abort())
        page.goto('http://127.0.0.1:8080/', wait_until='networkidle')
        page.locator('#theme-hint').click()
        page.locator('#theme-select').select_option('abyss')
        page.locator('#theme-duration').fill('1000')
        page.locator('#theme-duration').dispatch_event('change')
        page.locator('#theme-close').click()
        page.wait_for_timeout(1800)
        result = {'viewport': [width, height], 'errors': errors}
        if (width, height) in [(1440,900),(390,844)]:
            result['performance3s'] = measure(page, ctx)
        page.screenshot(path=str(OUT / f'{LABEL}-{width}x{height}-idle.png'))
        result['geometry'] = page.evaluate('''() => {
            const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
            return {player:rect('#active-player'),list:rect('#track-list'),overflow:document.documentElement.scrollWidth>innerWidth};
        }''')
        if LABEL != 'before':
            print(f'Checking {width}x{height}', flush=True)
            result['checks'] = verify(page, ctx, width, height, mobile)
            assert not errors, errors
        results.append(result)
        (OUT / f'{LABEL}.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        ctx.close()
    browser.close()
(OUT / f'{LABEL}.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
