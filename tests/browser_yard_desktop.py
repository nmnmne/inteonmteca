"""Exercise DJ and Eng-Rus windows, transport and the idle desktop panels in Edge."""
import sys

from playwright.sync_api import sync_playwright


def check(browser, url, width, height, touch):
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=touch,
                            has_touch=touch, reduced_motion="reduce", accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.clock.install()
    page.goto(url, wait_until='domcontentloaded')
    page.wait_for_selector('#yard-dj-compact button[data-dj-mode=full]')
    page.evaluate('window.desktopSmokePage = true')
    def action(app, name):
        return page.locator(f'[data-app="{app}"][data-window-action="{name}"]:visible')

    def launch(app):
        return page.locator(f'.yard-app-dock [data-launch="{app}"]')

    blank_click = page.touchscreen.tap if touch else page.mouse.click
    compact = page.locator('#yard-dj-compact')
    restore = page.locator('.yard-restore')
    assert compact.is_visible() and page.locator('#studio').is_hidden()
    assert page.locator('body').get_attribute('data-dj-mode') == 'compact'
    assert 'OpenStreetMap' not in compact.inner_text()
    display = compact.locator('.compact-display')
    fullscreen = display.locator('.compact-fullscreen')
    assert fullscreen.is_visible() and display.locator('[data-dj-mode=full]').is_visible()
    assert compact.locator('button:visible').evaluate_all(
        'buttons => buttons.every(el => el.getBoundingClientRect().top > innerHeight / 2)')
    if page.evaluate('document.fullscreenEnabled'):
        fullscreen.click()
        page.wait_for_function('document.fullscreenElement !== null')
        assert compact.is_visible() and page.locator('#studio').is_hidden()
        action('dj', 'minimize').click()
        assert page.evaluate('!!document.fullscreenElement') and restore.is_visible()
        blank_click(width // 2, height // 4)
        assert compact.is_visible() and page.evaluate('!!document.fullscreenElement')
        fullscreen.click()
        page.wait_for_function('document.fullscreenElement === null')
        assert compact.is_visible()
    compact.get_by_role('button', name='Сведения о дворе и источники карты').click()
    assert page.locator('#yard-map-sources a[href*="openstreetmap.org/copyright"]').is_visible()
    page.keyboard.press('Escape')
    if not touch:
        compact.locator('.compact-sound').click()
        page.locator('#midi-open').click()
        assert page.locator('#midi-dialog').is_visible()
        page.keyboard.press('Escape')
        page.keyboard.press('Escape')
    compact.locator('[data-dj-mode=full]').click()
    assert page.locator('#studio').is_visible()
    assert page.evaluate('document.fullscreenElement === null')
    for control in ('#import', '#keys-open', '[data-app=dj][data-window-action=minimize]',
                    '[data-app=dj][data-window-action=close]'):
        page.locator(control + ':visible').click(trial=True)
    assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
    if not touch:
        page.locator('#deck-a .dd-play').click()
        page.wait_for_function('DJEngine.snapshot().A.time > .1')
        page.locator('#deck-b .dd-play').click()
        page.wait_for_function('DJEngine.snapshot().B.time > .1')
    page.evaluate("DJEngine.setTempo('A', 2); DJEngine.setCross(.4)")
    position = page.evaluate('DJEngine.snapshot().A.time')
    if not touch and page.evaluate('document.fullscreenEnabled'):
        page.locator('#expand').click()
        page.wait_for_function('document.fullscreenElement !== null')
    page.locator('#studio [data-dj-mode=compact]').click()
    assert compact.is_visible() and page.locator('#studio').is_hidden()
    page.wait_for_function('document.fullscreenElement === null')
    action('dj', 'minimize').click()
    assert page.locator('body').get_attribute('data-yard-window') == 'desktop'
    assert page.locator('#studio').is_hidden()
    for selector in ('.room-toolbar', '.room-colophon', '#logo-wrap', '.room-resident'):
        assert page.locator(selector).first.is_hidden(), selector
    assert page.locator('[data-yard-layer]').is_visible() and launch('engrus').is_hidden()
    assert page.locator('.yard-system-panel').is_hidden() and page.locator('.yard-app-dock').is_hidden()
    assert restore.get_attribute('aria-label') == 'Развернуть DJ-пульт'
    rect = restore.bounding_box()
    assert rect and rect['width'] > 2 * rect['height'] and rect['y'] > height - 76, rect
    if not touch:
        page.wait_for_function('t => DJEngine.snapshot().A.time > t + .1', arg=position)
        assert page.evaluate('DJEngine.snapshot().B.playing')
    page.keyboard.press('q')
    page.keyboard.press('ArrowLeft')
    assert page.evaluate('DJEngine.snapshot().A.playing') is (not touch)
    assert page.evaluate('DJEngine.snapshot().cross === .4')

    button_center = [round(rect['x'] + rect['width'] / 2), round(rect['y'] + rect['height'] / 2)]
    page.clock.fast_forward(18000)
    assert restore.is_visible()
    page.mouse.move(width // 2, height // 2)
    page.clock.fast_forward(19000)
    assert restore.evaluate("el => el.checkVisibility({opacityProperty: true, visibilityProperty: true})")
    page.clock.fast_forward(1200)
    assert not restore.evaluate("el => el.checkVisibility({opacityProperty: true, visibilityProperty: true})")
    assert page.evaluate("([x,y]) => !document.elementFromPoint(x,y)?.closest('.yard-restore')", button_center)
    assert page.locator('[data-yard-layer]').is_visible()
    assert page.locator('.yard-system-panel').is_hidden() and page.locator('.yard-app-dock').is_hidden()
    if not touch:
        assert page.evaluate('DJEngine.snapshot().A.playing && DJEngine.snapshot().B.playing')

    # A single background click restores a manually minimized compact player in normal view.
    blank_click(width // 2, height // 4)
    assert compact.is_visible()
    action('dj', 'close').click()
    launch('engrus').click()
    assert page.locator('#yard-engrus-window').is_visible() and page.locator('.engrus-english').inner_text()
    page.locator('.engrus-next').click()
    count = page.locator('.engrus-count').inner_text()
    action('engrus', 'minimize').click()
    blank_click(width // 2, height // 4)
    assert page.locator('body').get_attribute('data-yard-window') == 'desktop'
    restore.click()
    assert page.locator('.engrus-count').inner_text() == count
    action('engrus', 'close').click()
    assert launch('engrus').get_attribute('data-running') == 'false'
    launch('dj').click()
    assert compact.is_visible()
    compact.locator('[data-dj-mode=full]').click()
    action('dj', 'minimize').click()
    blank_click(width // 2, height // 4)
    assert page.locator('body').get_attribute('data-yard-window') == 'desktop'
    restore.click()
    assert page.locator('#studio').is_visible()
    assert page.evaluate('window.desktopSmokePage && DJEngine.snapshot().A.tempo === 2 && DJEngine.snapshot().cross === .4')
    if not touch:
        page.locator('#record').click()
        page.wait_for_function('DJEngine.snapshot().recording')
        page.wait_for_timeout(180)
        with page.expect_download() as saved:
            action('dj', 'close').click()
        assert saved.value.suggested_filename.startswith('inteonmteca-mix-')
    else:
        action('dj', 'close').click()
    assert launch('dj').get_attribute('data-running') == 'false'
    assert page.evaluate('!DJEngine.snapshot().A.playing && !DJEngine.snapshot().B.playing && !DJEngine.snapshot().recording')

    # Drive the actual idle deadline without waiting twenty seconds for every input modality.
    page.mouse.move(20, 120)
    page.clock.fast_forward(19000)
    assert page.locator('#yard-desktop-shell').get_attribute('data-idle') is None
    page.clock.fast_forward(1100)
    page.wait_for_selector('#yard-desktop-shell[data-idle=true]', state='attached')
    if touch:
        page.touchscreen.tap(width // 2, height // 2)
    else:
        page.mouse.move(24, 123)
    assert page.locator('#yard-desktop-shell').get_attribute('data-idle') is None
    page.keyboard.press('Tab')
    launch('dj').focus()
    page.clock.fast_forward(20100)
    assert page.locator('#yard-desktop-shell').get_attribute('data-idle') is None
    page.keyboard.press('Enter')
    assert page.locator('#studio').is_visible()
    assert page.evaluate('!DJEngine.snapshot().A.playing && !DJEngine.snapshot().B.playing && window.desktopSmokePage')
    assert not errors, errors
    page.close()
    print(f'{width}×{height} desktop windows, shortcuts, audio and idle panels passed', flush=True)


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='msedge', headless=True)
        url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8122/'
        check(browser, url, 1440, 900, False)
        check(browser, url, 390, 844, True)
        check(browser, url, 320, 640, True)
        check(browser, url, 844, 390, True)
        browser.close()
