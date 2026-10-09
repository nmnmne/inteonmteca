"""Doorway exit and retained cross-document home logo layering."""
import json
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(tempfile.mkdtemp(prefix='inteon-portal-qa-'))
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900}, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000');sessionStorage.setItem('inteon-storm-last',String(Date.now()))")
        page.goto('http://127.0.0.1:8080/', wait_until='domcontentloaded')
        assert page.locator('#theme-select option').count() == 9
        # Keep this visual inspection comfortably inside the existing walk budget.
        page.evaluate('for(let i=0;i<6;i++)inteonStreet.noteExit()')
        page.screenshot(path=str(out/f'editor-{mobile}.png'))
        begin=time.monotonic()
        page.locator('#street-link').click()
        page.wait_for_function("document.documentElement.dataset.portalPhase==='doorway'")
        page.wait_for_timeout(140)
        page.screenshot(path=str(out/f'scattering-{mobile}.png'))
        page.wait_for_url('**/yard/')
        page.wait_for_function('!!window.__yard')
        state=page.evaluate("({poster:document.querySelector('.portal-doorway')?.style.backgroundImage})")
        assert 'portal-' in state['poster'],state
        page.screenshot(path=str(out/f'yard-snapshot-{mobile}.png'))
        page.wait_for_function('!document.documentElement.dataset.portalPhase')
        elapsed=time.monotonic()-begin
        assert 1 <= elapsed < 15,elapsed
        page.screenshot(path=str(out/f'yard-{mobile}.png'))
        page.locator('.home-link').click()
        page.wait_for_url('**/index.html')
        page.wait_for_function("document.documentElement.dataset.portalPhase==='snapshot'")
        home=page.evaluate('''()=>({logo:getComputedStyle(document.querySelector('#logo-wrap')).viewTransitionName,
          old:getComputedStyle(document.documentElement,'::view-transition-old(root)').animationName,
          z:getComputedStyle(document.documentElement,'::view-transition-group(portal-logo)').zIndex})''')
        assert home=={'logo':'portal-logo','old':'portal-home-inertia','z':'3'},home
        page.wait_for_timeout(800)
        page.screenshot(path=str(out/f'home-snapshot-{mobile}.png'))
        page.wait_for_function('!document.documentElement.dataset.portalPhase')
        assert page.evaluate("!document.querySelector('.portal-shards') && !document.documentElement.hasAttribute('aria-busy') && !sessionStorage.getItem('inteon-room-portal-v1')")
        page.locator('.track-select').first.click()
        page.wait_for_function("!document.querySelector('#album-player').paused")
        page.locator('#immersive-play').click()
        assert not errors,errors
        print(json.dumps({'mobile':mobile,'exitSeconds':elapsed,'holes':state,'return':home,'errors':errors,'artifacts':str(out)}),flush=True)
        context.close()
    browser.close()
