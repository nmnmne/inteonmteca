"""Real-browser checks for unobtrusive curiosity, personal space and lifecycle."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.route('https://**/*',lambda r:r.abort())
    page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000')")
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
    entity=page.locator('.room-resident')
    page.wait_for_timeout(500)
    assert entity.get_attribute('aria-hidden')=='true'
    assert entity.evaluate('e=>getComputedStyle(e).pointerEvents')=='none'
    box=entity.bounding_box()
    start={'x':box['x']+24,'y':box['y']+26}
    # Fix the chance decisions for reproducible interaction, not the movement itself.
    page.evaluate('Math.random=()=>.2')
    cursor={'x':start['x']+150,'y':start['y']}
    page.mouse.move(**cursor)
    page.wait_for_function('document.querySelector(".room-resident").dataset.state==="walking"',timeout=7000)
    samples=[]
    for _ in range(32):
        sample=page.evaluate('''() => {
          const e=document.querySelector('.room-resident'),r=e.getBoundingClientRect();
          const overlap=[...document.querySelectorAll('#track-list,#active-player,.listening-intro h1,#auth-hint,#street-link')].some(el=>{
            const b=el.getBoundingClientRect();return r.left<b.right && r.right>b.left && r.top<b.bottom && r.bottom>b.top;
          });
          return {x:r.x+r.width/2,y:r.y+r.height/2,state:e.dataset.state,overlap};
        }''')
        assert not sample['overlap'],sample
        samples.append(sample)
        page.wait_for_timeout(180)
    assert any(s['state']=='sniffing' for s in samples),samples
    approach=samples[-1]
    assert approach['x']>start['x']+30
    assert abs(cursor['x']-approach['x'])>60
    page.screenshot(path=str(OUT/'resident-sniffing.png'))
    page.wait_for_timeout(6000)
    box=entity.bounding_box();here={'x':box['x']+24,'y':box['y']+26}
    page.mouse.move(here['x']-22,here['y'])
    page.wait_for_function('document.querySelector(".room-resident").dataset.state==="walking"',timeout=2000)
    page.wait_for_timeout(5500)
    after=entity.bounding_box()
    assert after['x']+24>here['x']+45, (here,after)
    print('Curiosity, sniffing, distance and clear movement path passed',flush=True)
    for panel in ['theme','chat','auth']:
        page.locator(f'#{panel}-hint').click()
        assert entity.is_hidden()
        page.keyboard.press('Escape')
        assert entity.is_visible()
    page.emulate_media(reduced_motion='reduce')
    box=entity.bounding_box()
    page.mouse.move(box['x']+3,box['y']+3)
    page.wait_for_timeout(600)
    assert entity.bounding_box()==box
    assert entity.evaluate('e=>e.getAnimations({subtree:true}).length')==0
    assert page.evaluate('sceneRaf')==0
    page.emulate_media(reduced_motion='no-preference')
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(350)
    box=entity.bounding_box()
    assert 0<=box['x']<390-box['width'] and 0<=box['y']<844-box['height']
    page.screenshot(path=str(OUT/'resident-mobile.png'))
    assert page.evaluate('sceneRaf')==0
    assert not errors,errors
    browser.close()
(OUT/'resident-checks.json').write_text(json.dumps({
    'approachFrom':start,'cursor':cursor,'sniffAt':approach,
    'retreatFrom':here,'retreatTo':after,'movementSamples':samples,
    'clickThrough':True,'panelsPause':True,'reducedMotion':True,'mobileStationary':True,'errors':errors
},indent=2))
print('Panel, reduced-motion and mobile checks passed')

