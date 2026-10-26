"""Live cap-height regression. Run against the local static server on :8080."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / 'artifacts' / 'cap-height-covers'
OUT.mkdir(parents=True, exist_ok=True)
MEASURE = r"""() => {
  const measure = (host, title) => {
    const font = getComputedStyle(title);
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;font:${font.font};width:1cap;height:1cap`;
    document.body.append(probe);
    const cap = probe.getBoundingClientRect().width;
    probe.remove();
    const rect = host.getBoundingClientRect();
    return {title:title.textContent, width:rect.width, height:rect.height, cap, font:font.font};
  };
  return {
    rows:[...document.querySelectorAll('.track-meta > .has-cover')].map(host => measure(host, host.parentElement.querySelector('.track-title'))),
    active:measure(document.querySelector('.active-cover'), document.querySelector('.now-playing-title')),
    overflow:document.documentElement.scrollWidth > innerWidth,
    activeHidden:getComputedStyle(document.querySelector('.active-track-copy')).display === 'none'
  };
}"""
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    results = []
    for width, height in [(1440,900),(1280,650),(390,844),(320,740),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.goto('http://127.0.0.1:8080/', wait_until='networkidle')
        page.wait_for_selector('.track-art.has-cover')
        page.evaluate("""() => {
            const track = window.INTEONMTECA_PLAYLIST.find(t => t.cover);
            document.querySelector('.now-playing-title').textContent = track.title;
            window.inteonCovers.select(track);
        }""")
        page.wait_for_timeout(300)
        result = page.evaluate(MEASURE)
        result['viewport'] = [width,height]
        # Mobile deliberately hides the entire copy. Exercise its real typography
        # separately without changing the production mobile layout.
        if result['activeHidden']:
            page.add_style_tag(content='#active-player .active-track-copy { display:grid !important; }')
            page.wait_for_timeout(100)
            result['active'] = page.evaluate(MEASURE)['active']
        results.append(result)
        (OUT / 'measurements.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
        for row in result['rows'] + [result['active']]:
            assert abs(row['width']-row['cap']) < .1, (width,height,row)
            assert abs(row['height']-row['cap']) < .1, (width,height,row)
        assert not result['overflow'], result
        if result['activeHidden']:
            page.reload(wait_until='networkidle')
        page.screenshot(path=str(OUT / f'{width}x{height}.png'))
    # Resize the SAME live document across breakpoints, including hidden -> shown
    # active copy; do not depend on initial page-load measurements alone.
    for width, height in [(390,844),(1440,900),(1280,650),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(400)
        result = page.evaluate(MEASURE)
        for row in result['rows'] + ([] if result['activeHidden'] else [result['active']]):
            assert abs(row['width']-row['cap']) < .1, ('live resize',width,height,row)
            assert abs(row['height']-row['cap']) < .1, ('live resize',width,height,row)
        assert not result['overflow']
    # Real application selection/animated title updates must retain the sizing.
    page.locator('.track-item:has(.has-cover) .track-select').first.evaluate('(button) => button.click()')
    page.wait_for_timeout(1000)
    result = page.evaluate(MEASURE)
    assert abs(result['active']['width']-result['active']['cap']) < .1, result['active']
    assert abs(result['active']['height']-result['active']['cap']) < .1, result['active']
    assert not errors, errors
    browser.close()
print('PASS: cap-height squares and no horizontal overflow at all 5 viewports')
