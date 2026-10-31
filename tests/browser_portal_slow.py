"""Navigation never waits for yard code, and the walk starts at its first frame."""
import asyncio
import json
import os
import time
from playwright.async_api import async_playwright

base = os.environ.get('INTEON_BASE_URL', 'http://127.0.0.1:8080').rstrip('/')

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='msedge', headless=True)
        page = await browser.new_page(viewport={'width': 1440, 'height': 900})
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        release_main = asyncio.Event()

        async def slow(route):
            await release_main.wait()
            try:
                await route.continue_()
            except Exception:
                # The optional home warm-up can be canceled by the immediate navigation.
                if '/yard/' in page.url:
                    return
                raise

        await page.route('**/yard/main.js*', slow)
        await page.goto(base + '/', wait_until='domcontentloaded')
        await page.evaluate("sessionStorage.setItem('inteon-room-portal-v1', JSON.stringify({to:'yard',at:Date.now(),poster:'data:image/jpeg;base64,obsolete'}))")
        started = time.monotonic()
        await page.locator('#street-link').click(no_wait_after=True)
        await page.wait_for_url('**/yard/', wait_until='commit')
        await page.wait_for_function('!!window.yardWalkClock')
        committed = time.monotonic() - started
        assert not release_main.is_set()
        assert await page.evaluate('yardWalkClock.deadline') is None
        assert await page.evaluate('!window.__yard && !document.documentElement.dataset.portalPhase')
        assert await page.locator('.portal-doorway, #yard-loading, iframe').count() == 0
        assert await page.evaluate("sessionStorage.getItem('inteon-room-portal-v1')") is None
        # Hold the module longer than the old minimum transition duration.
        await asyncio.sleep(1.2)
        assert await page.evaluate('yardWalkClock.deadline') is None
        release_main.set()
        await page.wait_for_function('!!window.__yard && !!document.documentElement.dataset.yardReady && yardWalkClock.deadline > Date.now()')
        ready = time.monotonic() - started
        assert not any('portal-preview' in url or '/assets/spawn-' in url or '/assets/portal-' in url for url in requests), requests
        assert not errors, errors
        print(json.dumps({'committedBeforeCodeRelease': True, 'commitSeconds': committed, 'readySeconds': ready, 'errors': errors}), flush=True)
        await browser.close()

asyncio.run(main())