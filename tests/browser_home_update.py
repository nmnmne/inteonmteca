"""Guest/member shared chat and responsive toolbar against an isolated real backend."""
import json
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
with patch.object(Path, 'exists', return_value=False):
    from server.app import Store, make_handler

OUT = ROOT / 'tests/artifacts/home-optimization'
OUT.mkdir(parents=True, exist_ok=True)
report = {'layouts': [], 'errors': []}
with tempfile.TemporaryDirectory(prefix='inteon-home-qa-') as tmp:
    store = Store(Path(tmp) / 'qa.db')
    store.upsert_user('qa@example.invalid')
    for i in range(55):
        store.add_message('qa@example.invalid', f'fixture {i:02d}')
    handler = make_handler(ROOT, store, smtp=None, force_dev_code=True)
    handler.log_message = lambda *args: None
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge', headless=True)
            def page_for(width, height, mobile=False):
                page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile)
                page.route('**/abacus.jasoncameron.dev/**', lambda route: route.fulfill(status=200, content_type='application/json', body='{"value":123456}'))
                page.on('pageerror', lambda error: report['errors'].append(str(error)))
                page.goto(url + '/', wait_until='domcontentloaded')
                page.wait_for_function('document.querySelectorAll("#chat-stream .chat-line").length === 50')
                return page

            guest = page_for(1440, 900)
            assert guest.locator('#chat-input').get_attribute('readonly') is not None
            assert guest.request.post(url + '/api/chat', data={'text': 'unauthorized'}).status == 401
            member = page_for(1440, 900)
            member.locator('#auth-hint').click()
            assert not member.locator('#auth-code-form').is_visible()
            member.locator('#auth-email').fill('qa@example.invalid')
            with member.expect_response('**/api/auth/request-code') as request:
                member.locator('#auth-email-form button').click()
            code = request.value.json()['login_code']
            member.locator('#auth-code').fill(code)
            member.locator('#auth-code-form button').click()
            member.wait_for_function('!document.querySelector("#chat-input").readOnly')
            member.locator('#chat-input').fill('shared qa message')
            member.locator('#chat-form button').click()
            guest.wait_for_function('document.querySelector("#chat-stream").textContent.includes("shared qa message")')
            rows = guest.request.get(url + '/api/chat').json()['messages']
            assert len(rows) == 50 and rows[-1]['text'] == 'shared qa message'
            assert len(store.messages()) == 50
            report['sharedChat'] = {'guestCanRead': True, 'guestWriteStatus': 401, 'authenticatedWriteSeenByGuest': True, 'retained': len(rows)}
            member.close()
            guest.close()

            for width, height in [(1440,900),(1024,768),(844,390),(800,600),(390,844),(320,568)]:
                page = page_for(width, height, width <= 800)
                page.wait_for_function('document.querySelector("#visit-count").textContent === "123456"')
                page.locator('#theme-hint').click()
                assert page.locator('#theme-panel').is_visible()
                page.locator('#auth-hint').click()
                assert page.locator('#auth-panel').is_visible() and not page.locator('#theme-panel').is_visible()
                page.locator('#auth-hint').click()
                assert not page.locator('#auth-panel').is_visible()
                page.locator('#auth-hint').click()
                page.locator('#theme-hint').click()
                assert page.locator('#theme-panel').is_visible() and not page.locator('#auth-panel').is_visible()
                page.locator('#theme-hint').click()
                assert not page.locator('#theme-panel').is_visible()
                page.locator('#auth-hint').click()
                page.wait_for_timeout(220)
                geometry = page.evaluate('''() => {
                  const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
                  return {street:rect('.street-return'),counter:rect('.visit-counter'),auth:rect('#auth-panel'),
                    toolbar:rect('.room-toolbar'),overflow:document.documentElement.scrollWidth>innerWidth};
                }''')
                assert not geometry['overflow'], (width, geometry)
                assert geometry['counter']['x'] >= geometry['street']['right'] - 1, (width, geometry)
                assert geometry['counter']['right'] <= width, (width, geometry)
                assert geometry['auth']['x'] >= 0 and geometry['auth']['right'] <= width and geometry['auth']['bottom'] <= height, (width, geometry)
                if width > 800:
                    assert geometry['auth']['right'] <= width / 2, (width, geometry)
                page.screenshot(path=str(OUT / f'auth-{width}x{height}.png'))
                page.locator('#auth-close').click()
                page.screenshot(path=str(OUT / f'home-{width}x{height}.png'))
                report['layouts'].append({'viewport':[width,height], **geometry})
                page.close()
            assert not report['errors'], report['errors']
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        store.close()
(OUT / 'ui-chat-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report), flush=True)
