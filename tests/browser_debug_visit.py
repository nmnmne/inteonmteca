"""Debug is off on entry/reload/return; manual controls remain usable."""
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for mobile in (False, True):
            context = browser.new_context(
                viewport={'width': 390 if mobile else 1440, 'height': 900},
                is_mobile=mobile, has_touch=mobile,
            )
            # Do not contact production counters or services during local checks.
            context.route('**/*', lambda route: route.continue_()
                          if urlsplit(route.request.url).netloc == urlsplit(base).netloc
                          else route.abort())
            context.add_init_script("""
                try { localStorage.setItem('inteonmteca-debug-enabled', '1'); } catch {}
            """)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base, wait_until='domcontentloaded')
            root = page.locator('html')
            master = page.locator('.development-debug-master')
            quality = page.locator('#development-quality')
            expect(root).to_have_attribute('data-debug-enabled', 'false')
            expect(quality).to_be_hidden()
            master.click()
            expect(root).to_have_attribute('data-debug-enabled', 'true')
            expect(quality).to_be_visible()
            page.locator('[aria-controls="development-animation-menu"]').click()
            expect(page.locator('#development-animation-menu')).to_be_visible()
            page.reload(wait_until='domcontentloaded')
            expect(root).to_have_attribute('data-debug-enabled', 'false')
            expect(quality).to_be_hidden()
            expect(page.locator('#development-animation-menu')).to_be_hidden()
            master.click()
            expect(quality).to_be_visible()
            page.goto(base + '/robots.txt')
            page.go_back(wait_until='domcontentloaded')
            expect(root).to_have_attribute('data-debug-enabled', 'false')
            expect(quality).to_be_hidden()
            master.click()
            expect(quality).to_be_visible()
            assert not errors, errors
            results.append({'mobile': mobile, 'entry': 'off', 'reload': 'off',
                            'return': 'off', 'manual_toggle': 'passed', 'errors': errors})
            context.close()
        browser.close()
    print(json.dumps(results))
finally:
    server.shutdown()
    server.server_close()
