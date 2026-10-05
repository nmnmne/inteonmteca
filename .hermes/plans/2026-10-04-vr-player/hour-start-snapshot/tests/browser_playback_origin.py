"""Real Edge touch + media playback policy regression (not a gapless claim)."""
import json
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
import sys
import tempfile
import os
sys.path.insert(0, str(root))
from server.app import Store, make_handler
scratch = tempfile.TemporaryDirectory()
store = Store(Path(scratch.name) / 'test.db')
os.environ['INTEONMTECA_QUIET'] = '1'
class MediaHandler(make_handler(root, store, None)):
    def do_GET(self):
        try: super().do_GET()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), MediaHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'

def inspect(page, expression):
    session = page.context.new_cdp_session(page)
    try:
        result = session.send('Runtime.evaluate', {'expression':expression, 'returnByValue':True, 'userGesture':False})
        return result.get('result', {}).get('value')
    finally:
        session.detach()

def wait_js(page, expression):
    import time
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if inspect(page, expression): return
        page.wait_for_timeout(50)
    raise AssertionError(f'Timed out: {expression}; {state(page)}')

def state(page):
    return inspect(page, '''({saved:inteonPlayback.read(), paused:document.querySelector('#album-player').paused,
      time:document.querySelector('#album-player').currentTime, src:document.querySelector('#album-player').currentSrc})''')

def ready(page, yard=False):
    if yard: wait_js(page, '!!window.__yard')
    wait_js(page, "document.querySelector('#album-player').readyState >= 1")

def playing(page):
    wait_js(page, "!document.querySelector('#album-player').paused && document.querySelector('#album-player').currentTime > 0")

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True, args=['--autoplay-policy=document-user-activation-required'])
        for width, height in [(390,844), (844,390)]:
            ctx = browser.new_context(viewport={'width':width,'height':height}, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.route('https://**/*', lambda route: route.abort())
            errors=[]
            page.on('pageerror',lambda e: errors.append(str(e)))
            page.goto(url)
            page.locator('.track-select').first.tap()
            playing(page)
            page.evaluate("document.querySelector('#album-player').currentTime=12")
            page.locator('#street-link').tap()
            page.wait_for_url('**/yard/')
            ready(page,True)
            s=state(page)
            assert s['paused'] and not s['saved']['playingIntent'] and s['saved']['origin']=='home',s
            assert s['time'] >= 11,s
            # The actual courtyard keyboard transport starts the selected track;
            # touch taps on both navigation links remain real touch input.
            page.keyboard.press('Space')
            playing(page)
            page.evaluate("document.querySelector('#album-player').currentTime=24")
            page.locator('.home-link').tap()
            page.wait_for_url('**/index.html')
            ready(page)
            playing(page)
            s=state(page)
            assert s['saved']['origin']=='yard' and s['saved']['playingIntent'] and s['time']>=23,s
            page.go_back()
            ready(page,True)
            playing(page)
            assert state(page)['saved']['origin']=='yard',state(page)
            page.go_forward()
            ready(page)
            wait_js(page, "!document.querySelector('#album-player').paused || document.querySelector('#playback-status').dataset.state === 'error'")
            if state(page)['paused']:
                assert state(page)['saved']['playingIntent'],state(page)
                message=inspect(page, "document.querySelector('#playback-status').textContent")
                print(json.dumps({'historyForwardNeedsGesture':True,'message':message,'state':state(page)}),flush=True)
                page.locator('#immersive-play').tap()
            playing(page)
            assert state(page)['saved']['origin']=='yard',state(page)
            page.locator('#street-link').tap()
            page.wait_for_url('**/yard/')
            ready(page,True)
            playing(page)
            s=state(page)
            assert s['saved']['origin']=='yard' and s['time']>=23,s
            page.keyboard.press('Space')
            assert state(page)['paused']
            page.locator('.home-link').tap()
            page.wait_for_url('**/index.html')
            ready(page)
            s=state(page)
            assert s['paused'] and not s['saved']['playingIntent'],s
            # A deliberate home start becomes home-origin; returning outside stops.
            page.locator('#immersive-play').tap()
            playing(page)
            wait_js(page, "inteonPlayback.read()?.origin === 'home'")
            page.locator('#street-link').tap()
            page.wait_for_url('**/yard/')
            ready(page,True)
            assert state(page)['paused'],state(page)
            page.locator('.home-link').tap()
            page.wait_for_url('**/index.html')
            ready(page)
            assert page.locator('#active-player').is_visible()
            page.keyboard.press('Escape')
            assert page.locator('#active-player').is_visible()
            page.locator('#street-link').tap()
            page.wait_for_url('**/yard/')
            wait_js(page, '!!window.__yard')
            assert not state(page)['saved']['playingIntent'] and state(page)['paused'],state(page)
            assert not errors,errors
            print(json.dumps({'viewport':[width,height], 'homeStops':True,'yardHomeYardResumes':True,'positionPreserved':True,'pauseAndEscapeStayStopped':True,'homeResumeNewOrigin':True,'pageErrors':errors}),flush=True)
            ctx.close()
        # Inject one NotAllowedError deterministically: this Edge environment
        # permits fresh-origin autoplay even with its restrictive launch flag.
        # The retry then exercises the real media element with a touch gesture.
        ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.route('https://**/*', lambda route: route.abort())
        page.add_init_script("""const originalPlay = HTMLMediaElement.prototype.play;
        let denyOnce = true;
        HTMLMediaElement.prototype.play = function() {
          if (denyOnce) { denyOnce = false; return Promise.reject(new DOMException('QA denial', 'NotAllowedError')); }
          return originalPlay.call(this);
        };
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem('inteonmteca-playback', JSON.stringify({
            audio:'media/God Is Dead/Матт - God Is Dead.flac', title:'God Is Dead',
            time:18, paused:false, origin:'yard', playingIntent:true}));
          sessionStorage.setItem('seeded','1');
        }""")
        page.goto(url+'/yard/')
        # Do not evaluate JS before the attempt: Playwright evaluation grants
        # transient user activation and would invalidate this denial test.
        page.locator('#yard-boundary-play').wait_for(state='visible', timeout=8000)
        s=state(page)
        assert s['paused'] and s['saved']['playingIntent'] and s['time']>=17,s
        page.locator('#yard-boundary-play').tap()
        playing(page)
        assert state(page)['saved']['origin']=='yard'
        print(json.dumps({'injectedAutoplayDenial':True,'intentAndPositionSurviveDenial':True,'touchRetryPlays':True}),flush=True)
        ctx.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    store.close()
    scratch.cleanup()
