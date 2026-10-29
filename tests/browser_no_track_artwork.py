"""Local real-browser regression; no mocks, messages, or remote writes.
Run: python tests/browser_no_track_artwork.py [http://127.0.0.1:8080/]
"""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080/'
OUT = Path(tempfile.mkdtemp(prefix='inteon-no-artwork-'))
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for width, height in [(1440, 900), (390, 844), (844, 390)]:
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      is_mobile=width < 900, has_touch=width < 900)
        page = context.new_page()
        requests, errors = [], []
        page.on('request', lambda r: requests.append(r.url))
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until='load')
        page.wait_for_function('window.INTEONMTECA_PLAYLIST?.length > 0 && document.querySelectorAll(".track-select").length > 4')
        page.wait_for_timeout(600)
        row = page.evaluate('''() => {
          const bounds = document.querySelector('.track-list').getBoundingClientRect();
          return [...document.querySelectorAll('.track-select')].findIndex(e => {
            const r=e.getBoundingClientRect(); return r.top>=bounds.top && r.bottom<=bounds.bottom;
          });
        }''')
        assert row >= 0
        page.locator('.track-select').nth(row).click()
        page.wait_for_function('document.querySelector("#album-player").currentTime > .2', timeout=20000)
        page.locator('#immersive-play').click()
        page.wait_for_function('document.querySelector("#album-player").paused')
        sample = page.evaluate('''() => ({
          images: document.querySelectorAll('.track-item img,.active-cover,.cover-image').length,
          controller: typeof window.inteonCovers,
          artwork: navigator.mediaSession.metadata?.artwork.length,
          title: navigator.mediaSession.metadata?.title,
          overflow: document.documentElement.scrollWidth > innerWidth,
          tracks: INTEONMTECA_PLAYLIST.length,
          hasCoverData: INTEONMTECA_PLAYLIST.some(t => t.cover || t.covers || t.coverRenditions),
          time: document.querySelector('#album-player').currentTime
        })''')
        assert sample['images'] == 0 and sample['controller'] == 'undefined', sample
        assert sample['artwork'] == 0 and sample['title'], sample
        assert not sample['hasCoverData'] and not sample['overflow'], sample
        assert not any('track-covers' in url for url in requests), requests
        assert not errors, errors
        page.screenshot(path=str(OUT / f'{width}x{height}.png'))
        sample.update(viewport=[width, height], errors=errors, coverRequests=0)
        results.append(sample)
        context.close()
    for path in ['assets/track-covers/catalog.json', 'assets/track-covers/another-way/12e2c1bb8a5f98f0.webp', 'track-covers.js']:
        response = browser.new_context().request.get(BASE + path)
        assert response.status == 404, (path, response.status)
    browser.close()
(OUT / 'report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': results, 'artifacts': str(OUT)}, ensure_ascii=False, indent=2))
