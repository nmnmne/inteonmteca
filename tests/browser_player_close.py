"""Persistent-player regression; filename retained for existing test commands."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for width, height in [(1440,900), (800,600), (390,844), (320,568), (844,390)]:
            page = browser.new_page(viewport={'width':width,'height':height}, has_touch=width<=640)
            page.route('https://**/*', lambda route: route.abort())
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle')
            assert page.locator('#active-player').is_visible()
            assert page.locator('#immersive-play').is_disabled()
            assert page.evaluate('player.paused && currentTrack === null')
            assert page.locator('#close-track').count() == 0
            page.locator('.track-select').first.click()
            page.wait_for_timeout(1800)
            assert page.evaluate('!player.paused'), 'Track must actually play'
            button = page.locator('#immersive-play').bounding_box()
            assert button['width'] >= 48 and button['height'] >= 48
            assert button['x'] + button['width'] <= width
            page.evaluate('window.qaSource = player.src')
            page.locator('#immersive-play').click()
            page.wait_for_timeout(1200)
            assert page.locator('#active-player').is_visible()
            assert page.evaluate('player.paused && currentTrack !== null && currentTrackIndex >= 0')
            assert page.evaluate('player.src === window.qaSource'), 'Pause must retain selection'
            assert page.locator('#playlist-shell').is_visible()
            page.keyboard.press('Escape')
            assert page.evaluate('currentTrack !== null && player.paused')
            assert page.locator('#active-player').is_visible()
            page.locator('#immersive-play').click()
            page.wait_for_timeout(1000)
            assert page.evaluate('!player.paused && currentTrack !== null'), 'Playlist must still work after closing'
            page.locator('#immersive-play').focus()
            page.keyboard.press('Enter')
            page.wait_for_timeout(800)
            assert page.locator('#active-player').is_visible()
            assert page.evaluate('player.paused && currentTrack !== null')
            assert not errors, errors
            print(json.dumps({'viewport':[width,height], 'persistent':True, 'pauseRetainsSelection':True, 'keyboardResume':True}))
            page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
