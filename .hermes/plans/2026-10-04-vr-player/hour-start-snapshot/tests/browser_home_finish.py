"""Final visual contracts, text effects and reduced motion."""
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).parent/'artifacts'/'spatial-player'
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge')
 page=b.new_page(viewport={'width':1440,'height':900})
 page.goto('http://127.0.0.1:8080');page.wait_for_timeout(700)
 assert page.locator('.listening-intro h1').inner_text().replace('\n',' ')=='Выбери свой звук'
 assert page.locator('h1 em').evaluate('(e)=>getComputedStyle(e).fontStyle')=='normal'
 assert page.locator('.track-select').first.evaluate('(e)=>getComputedStyle(e,"::after").content')=='none'
 assert page.locator('.heading-letter').first.evaluate('(e)=>getComputedStyle(e).animationName')=='heading-signal'
 page.emulate_media(reduced_motion='reduce')
 assert page.locator('.heading-letter').first.evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 page.screenshot(path=str(out/'desktop-reduced.png'))
 page.close();b.close()
print('Heading, geometric indicators and reduced motion verified')
