"""Exercise courtyard quality changes and recovery without reloading the DJ page."""
import os
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


BASE = os.environ.get('INTEON_BASE_URL', 'http://127.0.0.1:8080').rstrip('/')
CANVAS = '[data-yard-layer] canvas'


def wait_state(page, state):
    page.wait_for_function("state => document.body.dataset.yardBackdrop === state",
                           arg=state, timeout=30000)


def check_quality(page):
    canvas = page.locator(CANVAS)
    box = canvas.bounding_box()
    widths = []
    for level in (1, 10, 1):
        page.evaluate("level => window.inteonGraphicsQuality.setManualLevel(level)", level)
        widths.append(canvas.evaluate("el => el.width"))
        assert canvas.bounding_box() == box
    assert widths[0] < widths[1] and widths[2] == widths[0], widths
    return widths


def exercise(browser, width, height, touch):
    page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=touch,
                            is_mobile=touch, device_scale_factor=2 if touch else 1)
    # pageshow can retry a fast local 503 between two Playwright calls.
    page.add_init_script("""new MutationObserver(() => {
        if (document.body?.dataset.yardBackdrop === 'fallback')
            window.sawCleanFallback = !document.querySelector('[data-yard-layer] canvas, .jog-refraction');
    }).observe(document, {subtree:true, attributes:true, attributeFilter:['data-yard-backdrop']});""")
    attempts = 0

    def layout(route):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            route.fulfill(status=503, body='Service unavailable')
        else:
            route.continue_()

    page.route('**/yard/data/site-layout.json*', layout)
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.wait_for_function("window.sawCleanFallback === true")
    page.wait_for_function("document.querySelector('[data-yard-layer] img').naturalWidth > 0")
    wait_state(page, 'live')
    assert attempts == 2
    widths = check_quality(page)
    # Use a real WebGL context loss. Headless Edge keeps all tabs visible, so
    # dispatch the document visibility changes used on background/foreground.
    page.locator(CANVAS).evaluate("""canvas => {
        window.previousYardCanvas = canvas;
        canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
    }""")
    wait_state(page, 'fallback')
    assert page.locator(CANVAS + ', .jog-refraction').count() == 0
    page.evaluate("""() => {
        Object.defineProperty(document, 'hidden', {configurable:true, value:true});
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
    }""")
    wait_state(page, 'live')
    assert page.locator(CANVAS).count() == 1
    assert page.locator(CANVAS).evaluate("canvas => !previousYardCanvas.isConnected && canvas !== previousYardCanvas")
    assert page.locator('.jog-refraction').count() == 0
    page.locator('#yard-dj-compact button[data-dj-mode="full"]').click()
    page.wait_for_function("document.querySelectorAll('.jog-refraction').length === 2")
    print(f'{width}x{height}: recovered after HTTP 503 and GPU loss; raster widths {widths}', flush=True)
    page.close()


if __name__ == '__main__':
    if urlsplit(BASE).hostname not in {'127.0.0.1', 'localhost', '::1'}:
        raise SystemExit('Use a local preview for the failure-injection test.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='msedge', args=['--enable-unsafe-swiftshader'])
        for viewport in [(390, 844, True), (844, 390, True), (1440, 900, False)]:
            exercise(browser, *viewport)
        browser.close()
