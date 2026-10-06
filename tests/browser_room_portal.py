"""Real cross-document snapshots, alpha holes and home logo layering."""
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
        page.goto('http://127.0.0.1:8080/', wait_until='networkidle')
        assert page.locator('#theme-select optgroup').evaluate_all('es=>es.map(e=>e.children.length)') == [2]*10
        # Keep this visual inspection comfortably inside the existing walk budget.
        page.evaluate('for(let i=0;i<6;i++)inteonStreet.noteExit()')
        page.screenshot(path=str(out/f'editor-{mobile}.png'))
        begin=time.monotonic()
        page.locator('#street-link').click()
        page.wait_for_function("document.documentElement.dataset.portalPhase==='scattering'")
        page.wait_for_timeout(140)
        page.screenshot(path=str(out/f'scattering-{mobile}.png'))
        page.wait_for_url('**/yard/')
        page.wait_for_function("document.documentElement.dataset.portalPhase==='snapshot'")
        page.wait_for_function('!!window.__yard')
        state=page.evaluate('''async()=>{const root=document.documentElement,style=getComputedStyle(root,'::view-transition-old(root)'),url=root.style.getPropertyValue('--portal-holes').slice(5,-2);
          const i=new Image();i.src=url;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let holes=0,opaque=0;for(let n=3;n<d.length;n+=4){if(d[n]===0)holes++;if(d[n]===255)opaque++;}
          return {holes,opaque,animation:style.animationName,mask:style.maskImage.startsWith('url('),width:i.width,height:i.height};}''')
        assert state['holes']>50 and state['opaque']>state['holes'] and state['mask'],state
        assert state['animation']=='portal-dissolve',state
        page.screenshot(path=str(out/f'yard-snapshot-{mobile}.png'))
        page.wait_for_function('!document.documentElement.dataset.portalPhase')
        elapsed=time.monotonic()-begin
        assert elapsed<3.2,elapsed
        page.screenshot(path=str(out/f'yard-{mobile}.png'))
        page.locator('.home-link').click()
        page.wait_for_url('**/index.html')
        page.wait_for_function("document.documentElement.dataset.portalPhase==='snapshot'")
        home=page.evaluate('''()=>({logo:getComputedStyle(document.querySelector('#logo-wrap')).viewTransitionName,
          old:getComputedStyle(document.documentElement,'::view-transition-old(root)').animationName,
          z:getComputedStyle(document.documentElement,'::view-transition-group(portal-logo)').zIndex})''')
        assert home=={'logo':'portal-logo','old':'portal-dissolve','z':'3'},home
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
