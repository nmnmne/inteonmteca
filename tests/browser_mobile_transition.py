"""Real touch-navigation regression. Uses an isolated ephemeral local server."""
import functools
import json
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            pass  # Navigation intentionally cancels in-flight media requests.

def swipe(page, x, y, dx, dy):
    cdp = page.context.new_cdp_session(page)
    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart', 'touchPoints':[{'x':x, 'y':y}]})
    for step in range(1, 7):
        cdp.send('Input.dispatchTouchEvent', {'type':'touchMove', 'touchPoints':[{'x':x+dx*step/6, 'y':y+dy*step/6}]})
        page.wait_for_timeout(25)
    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd', 'touchPoints':[]})
    cdp.detach()

root = Path(__file__).resolve().parents[1]
output = Path(tempfile.mkdtemp(prefix='inteon-mobile-transition-'))
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for width, height in [(320,568), (390,844), (844,390), (568,320)]:
            context = browser.new_context(viewport={'width':width, 'height':height}, is_mobile=True, has_touch=True)
            page = context.new_page()
            page.route('https://**/*', lambda route: route.abort())
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            # Observe real capture-handler playback before navigation destroys the document.
            page.add_init_script("""document.addEventListener('DOMContentLoaded', () => {
              const original = window.inteonPlayTrack;
              window.inteonPlayTrack = (...args) => {
                sessionStorage.setItem('qa-picks', String(Number(sessionStorage.getItem('qa-picks') || 0) + 1));
                return original?.(...args);
              };
            });""")
            page.goto(url, wait_until='networkidle')
            page.wait_for_selector('.track-select')
            for panel in ['theme', 'auth', 'chat']:
                page.locator(f'#{panel}-hint').tap()
                page.locator(f'#{panel}-close').tap()
            assert page.evaluate('!document.querySelector(".page").inert')
            row = page.locator('.track-select').first.bounding_box()
            swipe(page, row['x']+row['width']/2, row['y']+row['height']/2, 0, -60)
            assert page.evaluate("Number(sessionStorage.getItem('qa-picks') || 0) === 0"), 'Scrolling selected a song'
            street = page.locator('#street-link').bounding_box()
            page.locator('#street-link').tap()
            page.wait_for_url('**/yard/')
            page.wait_for_function('!!window.__yard')
            page.wait_for_function('!document.documentElement.dataset.portalPhase')
            page.screenshot(path=str(output / f'mobile-yard-{width}.png'))
            picks = page.evaluate("Number(sessionStorage.getItem('qa-picks') || 0)")
            home = page.locator('.home-link').bounding_box()
            print(json.dumps({'viewport':[width,height], 'street':street, 'home':home, 'unintendedPicks':picks}), flush=True)
            assert picks == 0, 'The street text link selected a song before navigation'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth && scrollY === 0')
            assert home['height'] >= 44
            assert page.locator('.home-link').evaluate('(el) => {const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}'), 'Home is obscured'
            old_yaw = page.evaluate('__yard.body.yaw')
            swipe(page, width*.65, height*.45, -40, 0)
            page.wait_for_timeout(100)
            pose = page.evaluate('({x:__yard.body.x,z:__yard.body.z,yaw:__yard.body.yaw})')
            assert pose['yaw'] != old_yaw, 'Real touch look must work'
            page.locator('.home-link').tap()
            page.wait_for_url('**/index.html')
            page.wait_for_function('!document.documentElement.dataset.portalPhase')
            saved = page.evaluate('inteonStreet.resumePose()')
            assert saved and abs(saved['yaw']-pose['yaw']) < .01, 'Manual home lost the yard pose'
            assert page.evaluate('!document.body.classList.contains("is-inline-playing")')
            assert page.evaluate('!document.querySelector(".page").inert && scrollY === 0')
            assert page.locator('#street-link').is_visible()
            assert page.evaluate('!document.activeElement.closest("[hidden], [inert]")'), 'Focus is trapped in a hidden overlay'
            if width == 320:
                # Actual browser back, then keyboard activation of the home link.
                page.go_back()
                page.wait_for_function('!!window.__yard')
                page.locator('.home-link').focus()
                page.keyboard.press('Enter')
                page.wait_for_url('**/index.html')
                page.wait_for_function('!document.documentElement.dataset.portalPhase')
                page.locator('#street-link').tap()
                page.wait_for_url('**/yard/')
                page.wait_for_function('!!window.__yard')
                page.set_viewport_size({'width':568, 'height':320})
                assert page.locator('.home-link').is_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth && scrollY === 0')
                # Let the real timer perform the second visit's automatic return.
                page.wait_for_url('**/index.html', timeout=22000)
                page.wait_for_function('!document.documentElement.dataset.portalPhase')
                assert page.evaluate('!document.querySelector(".page").inert && scrollY === 0')
                assert page.locator('#street-link').is_visible()
            # Selection must still work after returning, not just avoid false picks.
            row_index = page.locator('#track-list').evaluate('''el=>{const b=el.getBoundingClientRect();return [...el.children].findIndex(e=>{const r=e.getBoundingClientRect();return r.top>=b.top && r.top<b.bottom-44})}''')
            assert row_index >= 0
            page.locator('.track-select').nth(row_index).tap()
            page.wait_for_function('!document.querySelector("#album-player").paused')
            assert not errors, errors
            print(json.dumps({'viewport':[width,height], 'manualReturn':True, 'touchScrollAndLook':True, 'overlaysAndFocus':True, 'playAfterReturn':True}), flush=True)
            context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
