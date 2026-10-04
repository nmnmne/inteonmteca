"""Browser release checks. Run against an isolated local server, never production.
Usage: python tests/browser_release.py [URL] [--audit]
Requires Playwright and Microsoft Edge. Screenshots go to the system temp folder.
"""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
AUDIT = '--audit' in sys.argv
OUTPUT = Path(tempfile.gettempdir()) / 'inteon-release-qa'
OUTPUT.mkdir(exist_ok=True)
failures = []

def check(ok, message):
    if not ok:
        failures.append(message)
        print('FAIL:', message)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for width, height in [(1440,900), (1024,768), (800,600), (640,800), (390,844), (320,568), (844,390)]:
        page = browser.new_page(viewport={'width':width,'height':height}, is_mobile=width<=640, has_touch=width<=640)
        page.route('https://**/*', lambda route: route.abort())
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL, wait_until='networkidle')
        if width <= 640 and page.locator('.visit-counter').is_visible():
            counter = page.locator('.visit-counter').bounding_box()
            street = page.locator('.street-link').bounding_box()
            overlap = counter['x'] < street['x']+street['width'] and street['x'] < counter['x']+counter['width'] and counter['y'] < street['y']+street['height'] and street['y'] < counter['y']+counter['height']
            check(not overlap,f'{width}: counter does not overlap street link')
        check(page.locator('#chat-panel').is_hidden(), f'{width}: chat initially collapsed')
        page.locator('#chat-hint').click()
        page.wait_for_timeout(400)
        bounds = page.locator('#chat-panel').bounding_box()
        print(json.dumps({'size':[width,height], 'chat':bounds}))
        check(bounds['x'] >= -1 and bounds['y'] >= -1 and bounds['x']+bounds['width'] <= width+1 and bounds['y']+bounds['height'] <= height+1, f'{width}: chat fits viewport')
        if width <= 1100 or height <= 540:
            check(abs(bounds['width']-width)<2, f'{width}: narrow chat uses dedicated screen')
            page.locator('#chat-close').focus()
            page.keyboard.press('Tab')
            check(page.evaluate("document.getElementById('chat-panel').contains(document.activeElement)"), f'{width}: keyboard stays in open chat')
        page.screenshot(path=str(OUTPUT / f'chat-{width}.png'))
        page.locator('#chat-close').focus()
        page.keyboard.press('Enter')
        page.locator('#theme-hint').click()
        page.locator('#theme-select').select_option(index=2)
        page.keyboard.press('Escape')
        check(page.locator('#theme-panel').is_hidden(), f'{width}: theme closes with Escape')
        page.locator('.track-select').first.click()
        page.wait_for_timeout(1800)
        check(page.evaluate("!document.getElementById('album-player').paused"),f'{width}: playback starts')
        close = page.locator('#close-track').bounding_box()
        check(close and close['width']>=44 and close['height']>=44,f'{width}: track close has a touch-sized target')
        page.screenshot(path=str(OUTPUT / f'player-{width}.png'))
        check(not errors, f'{width}: JS errors: {errors}')
        page.close()
    page = browser.new_page(viewport={'width':1440,'height':900})
    page.route('https://**/*', lambda route: route.abort())
    page.goto(URL,wait_until='networkidle')
    page.locator('#chat-hint').click()
    page.set_viewport_size({'width':800,'height':700})
    page.wait_for_timeout(300)
    check(page.locator('#chat-panel').is_hidden(), 'shrinking desktop collapses chat')
    page.locator('#chat-hint').click()
    page.evaluate("""() => {
      window.qaMessages = Array.from({length:40}, (_,id) => ({id,email:'qa@example.test',text:'Test message '+id}));
      renderChatMessages(window.qaMessages);
      chatStream.scrollTop = 0;
      window.qaFirst = chatStream.firstChild;
      renderChatMessages(window.qaMessages);
    }""")
    check(page.evaluate('chatStream.firstChild === window.qaFirst'), 'unchanged chat does not rebuild DOM')
    check(page.evaluate('chatStream.scrollTop === 0'), 'polling keeps reading position')
    check(page.locator('.chat-glyph').count() == 0, 'compact chat avoids per-letter animation')
    page.locator('.chat-send').click()
    check(page.locator('#auth-panel').is_visible(), 'guest send opens visible login panel')
    check(page.locator('#chat-panel').is_hidden(), 'login does not hide behind mobile chat')
    page.close()
    for width, height, touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        page = browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch)
        page.route('https://**/*', lambda route: route.abort())
        errors = []
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(URL.rstrip('/')+'/yard/',wait_until='networkidle')
        page.wait_for_function('Boolean(window.__yard)',timeout=30000)
        page.wait_for_timeout(1200)
        print('Yard render:',page.evaluate('({calls:__yard.renderer.info.render.calls, triangles:__yard.renderer.info.render.triangles})'))
        check(page.evaluate('__yard.renderer.info.render.calls > 0'),f'yard {width}: renders scene')
        minimap = page.locator('#scheme').bounding_box()
        check(abs(minimap['width']-minimap['height'])<1,f'yard {width}: minimap is square before circular clipping')
        check(page.locator('#scheme').evaluate("el => getComputedStyle(el).borderRadius === '50%'"),f'yard {width}: minimap is round')
        check(page.locator('#scheme-canvas').evaluate("el => el.getContext('2d').getImageData(0,0,1,1).data[3] === 0"),f'yard {width}: map corners are clipped')
        previous_map = page.locator('#scheme-canvas').evaluate('el => el.toDataURL()')
        page.evaluate('__yard.body.x += 2')
        page.wait_for_timeout(180)
        check(page.locator('#scheme-canvas').evaluate('el => el.toDataURL()') != previous_map,f'yard {width}: map follows movement')
        page.evaluate('__yard.body.x -= 2')
        for selector in ['.home-link','#yard-play','#yard-next','#yard-prev']:
            box=page.locator(selector).bounding_box()
            check(box and box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,f'yard {width}: {selector} fits viewport')
        page.locator('#yard-play').click()
        page.wait_for_timeout(800)
        check(page.evaluate("!document.getElementById('album-player').paused"),f'yard {width}: play works')
        old=page.locator('#album-player').get_attribute('src')
        page.locator('#yard-next').click()
        check(page.locator('#album-player').get_attribute('src')!=old,f'yard {width}: next works')
        if height <= 540:
            guide = page.locator('.touch-guide').bounding_box()
            controls = page.locator('.yard-player').bounding_box()
            overlap = guide and controls and guide['x']<controls['x']+controls['width'] and controls['x']<guide['x']+guide['width'] and guide['y']<controls['y']+controls['height'] and controls['y']<guide['y']+guide['height']
            check(not overlap,f'yard {width}: touch hint does not cover playback controls')
        page.screenshot(path=str(OUTPUT/f'yard-{width}.png'))
        check(not errors,f'yard {width}: JS errors {errors}')
        page.locator('.home-link').click()
        page.wait_for_url(URL.rstrip('/')+'/index.html*')
        check(page.locator('#track-list').is_visible(),f'yard {width}: home navigation works')
        page.close()
    page = browser.new_page(viewport={'width':390,'height':844})
    page.add_init_script("""(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (/webgl/i.test(type)) return null;
        return getContext.call(this,type,...args);
      };
    })();""")
    page.goto(URL.rstrip('/')+'/yard/',wait_until='networkidle')
    check(page.locator('#file-fallback').is_visible(),'unsupported WebGL shows a usable fallback')
    page.close()
    browser.close()
print('Screenshots:', OUTPUT)
print('Failures:',len(failures))
if failures and not AUDIT:
    raise SystemExit(1)
