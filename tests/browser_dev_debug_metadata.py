"""Verify development-only debug, SEO/MediaSession separation and desktop inset.
Run: python tests/browser_dev_debug_metadata.py
Artifacts are written outside the repository. No deployment or remote writes.
"""
import functools
import json
import os
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.app import serve

os.environ['INTEONMTECA_QUIET'] = '1'
OUT = Path(tempfile.mkdtemp(prefix='inteon-dev-debug-'))
DESCRIPTION = 'Погрузись в глубину звука. Почувствуй волновую природу мира — музыку, которая остаётся внутри.'
TITLE = 'Интеонмтека — Погрузись в глубину звука'
servers = []
results = []
try:
    static = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
    production = serve(root=ROOT, port=0, db_path=OUT / 'production.db', debug=False)
    development = serve(root=ROOT, port=0, db_path=OUT / 'development.db', debug=True)
    servers = [static, production, development]
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for name, server in zip(['static', 'production', 'development'], servers):
            base = f'http://127.0.0.1:{server.server_port}'
            for route in ['/', '/yard/']:
                context = browser.new_context(viewport={'width': 1440, 'height': 900})
                page = context.new_page()
                page.goto(base + route, wait_until='load')
                granted = page.evaluate('async () => Boolean(await window.inteonDebugReady)')
                assert granted == (name == 'development'), (name, route, granted)
                assert page.locator('.development-debug-master').count() == int(granted)
                assert page.locator('.yard-debug').count() == int(granted and route == '/yard/')
                if granted:
                    page.locator('.development-debug-master').click()
                    assert page.evaluate('document.documentElement.dataset.debugEnabled') == 'true'
                    page.reload(wait_until='load')
                    page.evaluate('async () => await window.inteonDebugReady')
                    assert page.evaluate('document.documentElement.dataset.debugEnabled') == 'false'
                results.append({'server': name, 'route': route, 'debug': granted})
                context.close()
            if name == 'production':
                for asset in ['/development-debug.js', '/yard/debug-pose.js', '/yard/../development-debug.js']:
                    assert browser.new_context().request.get(base + asset).status == 404
        base = f'http://127.0.0.1:{development.server_port}'
        css = (ROOT / 'desktop-edition.css').read_text(encoding='utf-8')
        baseline_css = css.split('/* Text-only rows need breathing room')[0]
        for width, height, touch in [(1440, 900, False), (900, 500, False), (768, 1024, True), (390, 844, True), (844, 390, True)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=touch, has_touch=touch)
            page = context.new_page()
            page.goto(base, wait_until='load')
            page.wait_for_function('document.querySelectorAll(".track-select").length > 4')
            page.wait_for_timeout(400)
            sample = page.evaluate('''() => {
              const e = document.querySelector('.track-select');
              return {padding: parseFloat(getComputedStyle(e).paddingLeft),
                overflow: document.documentElement.scrollWidth > innerWidth,
                title: document.title,
                description: document.querySelector('meta[name="description"]').content,
                canonical: document.querySelector('link[rel="canonical"]').href};
            }''')
            assert sample['title'] == TITLE and sample['description'] == DESCRIPTION
            assert sample['canonical'] == 'https://inteonmteca.online/'
            assert not sample['overflow'], sample
            if touch:
                page.route('**/desktop-edition.css*', lambda route: route.fulfill(body=baseline_css, content_type='text/css'))
                page.reload(wait_until='load')
                page.wait_for_function('document.querySelector(".track-select")')
                old = page.locator('.track-select').first.evaluate('(e) => parseFloat(getComputedStyle(e).paddingLeft)')
                assert old == sample['padding'], (old, sample)
                page.unroute('**/desktop-edition.css*')
            else:
                assert sample['padding'] >= 14, sample
            page.screenshot(path=str(OUT / f'{width}x{height}.png'))
            if width == 1440:
                selected = []
                for selection in range(2):
                    row = page.evaluate('''() => {
                      const bounds = document.querySelector('.track-list').getBoundingClientRect();
                      return [...document.querySelectorAll('.track-select')].findIndex(e => {
                        const r = e.getBoundingClientRect();
                        return r.top >= bounds.top && r.bottom <= bounds.bottom;
                      });
                    }''')
                    page.locator('.track-select').nth(row + selection).click()
                    page.wait_for_function('document.querySelector("#album-player").currentTime > .2')
                    media = page.evaluate('''() => {
                      const audio = document.querySelector('#album-player');
                      const track = INTEONMTECA_PLAYLIST.find(t => new URL(t.audio || t.file, location.href).href === audio.src);
                      const m = navigator.mediaSession.metadata;
                      return {title:m.title, artist:m.artist, expectedTitle:track.title,
                        expectedArtist:track.artist, artwork:m.artwork.length, documentTitle:document.title};
                    }''')
                    assert media['title'] == media['expectedTitle'] and media['artist'] == media['expectedArtist'], media
                    assert media['documentTitle'] == TITLE and media['artwork'] == 0, media
                    selected.append(media)
                assert selected[0]['title'] != selected[1]['title'], selected
                sample['realPlaybackMetadata'] = selected
            sample['viewport'] = [width, height]
            results.append(sample)
            context.close()
        browser.close()
finally:
    for server in servers:
        server.shutdown()
        server.server_close()
(OUT / 'report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': results, 'artifacts': str(OUT)}, ensure_ascii=False, indent=2))
