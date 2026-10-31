"""Immediate yard entrance and retained cross-document home logo layering."""
import json
import os
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.environ.get('INTEON_BASE_URL', 'http://127.0.0.1:8080').rstrip('/')
out = Path(tempfile.mkdtemp(prefix='inteon-portal-qa-'))
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 900}, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        errors = []
        requests = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        page.add_init_script("""
            localStorage.setItem('inteonmteca-theme-duration', '604800000');
            sessionStorage.setItem('inteon-storm-last', String(Date.now()));
            window.addEventListener('inteon-yard-entered', () => { window.firstYardFrameAt = Date.now(); });
        """)
        page.goto(base + '/', wait_until='domcontentloaded')
        # Intent warms only source/layout, without creating another scene or consuming a visit.
        before = page.evaluate("inteonStreet.visits()")
        with page.expect_response(lambda r: '/yard/data/site-layout.json' in r.url and r.status == 200):
            page.locator('#street-link').focus()
        assert page.evaluate("inteonStreet.visits()") == before
        assert page.locator('iframe').count() == 0
        assert not any('/yard/data/shadows/' in url or 'portal-preview' in url for url in requests), requests
        # A poster staged by a previous client version must not survive entry.
        page.evaluate("sessionStorage.setItem('inteon-room-portal-v1', JSON.stringify({to:'yard',at:Date.now(),poster:'data:image/jpeg;base64,obsolete'}))")
        begin = time.monotonic()
        page.locator('#street-link').click()
        page.wait_for_url('**/yard/', wait_until='domcontentloaded')
        page.wait_for_function("!!window.__yard && !!document.documentElement.dataset.yardReady && yardWalkClock.deadline > Date.now()")
        elapsed = time.monotonic() - begin
        state = page.evaluate("""() => ({
            phase: document.documentElement.dataset.portalPhase || null,
            overlay: !!document.querySelector('.portal-doorway, #yard-loading, iframe'),
            storage: sessionStorage.getItem('inteon-room-portal-v1'),
            firstFrame: window.firstYardFrameAt,
            clock: yardWalkClock.enteredAt,
            visits: inteonStreet.visits(),
        })""")
        assert state['phase'] is None and not state['overlay'] and state['storage'] is None, state
        assert state['firstFrame'] <= state['clock'] <= state['firstFrame'] + 100, state
        assert state['visits'] == before + 1, state
        assert not any('portal-preview' in url or '/assets/spawn-' in url or '/assets/portal-' in url for url in requests), requests
        page.screenshot(path=str(out / f'yard-{mobile}.png'))
        page.locator('.home-link').click()
        page.wait_for_url('**/index.html')
        page.wait_for_function("document.documentElement.dataset.portalPhase === 'snapshot'")
        home = page.evaluate("""() => ({
            logo: getComputedStyle(document.querySelector('#logo-wrap')).viewTransitionName,
            old: getComputedStyle(document.documentElement, '::view-transition-old(root)').animationName,
            z: getComputedStyle(document.documentElement, '::view-transition-group(portal-logo)').zIndex,
        })""")
        assert home == {'logo': 'portal-logo', 'old': 'portal-home-inertia', 'z': '3'}, home
        page.wait_for_timeout(800)
        page.screenshot(path=str(out / f'home-snapshot-{mobile}.png'))
        page.wait_for_function('!document.documentElement.dataset.portalPhase')
        assert page.evaluate("!document.documentElement.hasAttribute('aria-busy') && !sessionStorage.getItem('inteon-room-portal-v1')")
        assert not errors, errors
        print(json.dumps({'mobile': mobile, 'exitSeconds': elapsed, 'entry': state, 'return': home, 'errors': errors, 'artifacts': str(out)}), flush=True)
        context.close()
    browser.close()