"""Real WebGL regression: entrances, frozen atlas and persisted cycle."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass  # Navigation cancels in-flight asset downloads.

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        url = f'http://127.0.0.1:{server.server_port}'
        page.goto(url + '/yard/')
        page.wait_for_function('!!window.__yard')
        assert page.evaluate('window.__yard.lighting?.localMoment') == '20 April 16:20'
        rows = []
        for slot in range(13):
            if slot:
                page.locator('.home-link').click()
                page.locator('#street-link').click()
                page.wait_for_function('!!window.__yard')
            row = page.evaluate('''() => {
                const {lighting,scene,renderer} = window.__yard;
                const atlas = scene.userData.bakedLighting;
                const sun = scene.children.find(x => x.isDirectionalLight);
                return {index: lighting.presetIndex, moment: lighting.localMoment,
                    shadowMoment: atlas.entry.localMoment + ' Asia/Oral', residentSets: atlas.residentSets,
                    light: sun.intensity, color: sun.color.getHexString(),
                    vector: sun.position.toArray(), uuid: atlas.texture.uuid,
                    version: atlas.texture.version, shadowMap: renderer.shadowMap.enabled};
            }''')
            assert row['index'] == slot % 12, row
            assert row['shadowMoment'] == row['moment'] + ' Asia/Oral', row
            assert not row['shadowMap'], 'No continuous GPU shadow passes'
            page.wait_for_timeout(150)
            assert page.evaluate("window.__yard.scene.userData.bakedLighting.texture.version") == row['version']
            assert page.evaluate("window.__yard.scene.userData.bakedLighting.texture.uuid") == row['uuid']
            if slot in (0, 11):
                page.screenshot(path=str(Path.home() / f'yard-lighting-{slot}.png'))
            rows.append(row)
        assert rows[0]['vector'] != rows[11]['vector']
        assert rows[0]['light'] > rows[11]['light']
        assert rows[0]['color'] != rows[11]['color']
        # A history-cache restoration is a new entrance, unlike tab visibility.
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        assert page.evaluate('window.__yard.lighting.presetIndex') == 0
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}))")
        page.wait_for_function('window.__yard?.lighting.presetIndex === 1', timeout=10000)
        # Storage access throwing must not prevent rendering.
        blocked = browser.new_page()
        blocked.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('denied')}})")
        blocked.goto(url + '/yard/')
        blocked.wait_for_function('!!window.__yard')
        assert blocked.evaluate('window.__yard.lighting.presetIndex') == 0
        assert not errors, errors
        print(json.dumps({'visits': rows, 'blockedStorageRendered': True, 'pageErrors': errors}))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
