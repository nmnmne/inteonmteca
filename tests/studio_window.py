"""Enter the full DJ workspace through its normal desktop window control."""


def open_full_studio(page):
    if page.locator('#yard-dj-compact').is_visible():
        page.locator('#yard-dj-compact button[data-dj-mode=full]').click()
    page.locator('#studio').wait_for(state='visible')
