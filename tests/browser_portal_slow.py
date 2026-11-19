"""Cancel a pending background walk and ensure its late module cannot resurrect it."""
import asyncio
import os
from playwright.async_api import async_playwright


base = os.environ.get('INTEON_BASE_URL', 'http://127.0.0.1:8080').rstrip('/')


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel='msedge', headless=True)
        page = await browser.new_page(viewport={'width': 1180, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        requested, release, finished = (asyncio.Event() for _ in range(3))

        async def slow(route):
            requested.set()
            await release.wait()
            await route.continue_()

        await page.route('**/yard/ambient-scene.js*', slow)
        page.on('requestfinished', lambda request: finished.set() if '/yard/ambient-scene.js' in request.url else None)
        await page.goto(base + '/', wait_until='domcontentloaded')
        toggle = page.locator('[data-yard-toggle]:visible')
        await toggle.click()
        await asyncio.wait_for(requested.wait(), timeout=15)
        assert await page.locator('body').get_attribute('data-yard-backdrop') == 'loading'
        await page.locator('#deck-a .dd-play').click()
        await page.wait_for_function('DJEngine.snapshot().A.time > .2')
        await toggle.click()
        assert await toggle.get_attribute('aria-pressed') == 'false'
        await page.locator('[data-yard-layer]').wait_for(state='detached')
        release.set()
        await asyncio.wait_for(finished.wait(), timeout=10)
        await page.wait_for_timeout(400)
        assert await page.locator('[data-yard-layer], iframe').count() == 0
        assert await page.evaluate('DJEngine.snapshot().A.playing && !document.body.dataset.yardBackdrop')
        assert page.url == base + '/'
        await toggle.click()
        await page.wait_for_function("document.body.dataset.yardBackdrop === 'live'", timeout=45000)
        await toggle.click()
        await page.locator('[data-yard-layer]').wait_for(state='detached')
        assert not errors, errors
        print('Delayed fetch, deck playback, cancellation and retry passed.')
        await browser.close()


asyncio.run(main())
