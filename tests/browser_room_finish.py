"""Real-browser checks for whole-row scrolling, material rebuild and minimal transport."""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
OUT = Path(tempfile.mkdtemp(prefix="inteon-room-finish-qa-"))

def whole_rows(page):
    return page.evaluate("""() => {
        const l=document.querySelector('.track-list'), r=l.getBoundingClientRect();
        const buttons=[...l.querySelectorAll('.track-select')];
        const visible=buttons.map(e=>e.getBoundingClientRect()).filter(b=>b.bottom>r.top+.5&&b.top<r.bottom-.5);
        return {partial:visible.filter(b=>b.top<r.top-.5||b.bottom>r.bottom+.5).length,
            count:visible.length, top:l.scrollTop, border:getComputedStyle(l.parentElement).borderBottomWidth,
            overflow:document.documentElement.scrollWidth>innerWidth};
    }""")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000')")
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(1100)
    layouts = []
    for width, height in [(1440,900),(900,600),(390,844),(320,568),(844,390),(768,1024)]:
        page.set_viewport_size({"width":width,"height":height})
        page.wait_for_timeout(600)
        for delta in [0,253,-171]:
            if delta:
                page.locator('.track-list').hover()
                page.mouse.wheel(0,delta)
                page.wait_for_timeout(900)
            rows=whole_rows(page)
            assert rows['partial']==0 and rows['count']>0 and rows['border']=='0px' and not rows['overflow'],(width,height,rows)
        assert not page.locator('.player-caption').is_visible()
        assert not page.locator('.volume-control label').is_visible()
        layouts.append({"width":width,"height":height,**rows})
        page.screenshot(path=str(OUT/f'layout-{width}.png'))

    page.set_viewport_size({"width":1440,"height":900})
    page.locator('#theme-hint').click()
    page.emulate_media(reduced_motion="reduce")
    palettes=[]
    for theme in ['abyss','moss','desert']:
        page.locator('#theme-select').select_option(theme)
        palettes.append(page.evaluate("""()=>({bg:getComputedStyle(document.body).getPropertyValue('--theme-bg'),
            ink:getComputedStyle(document.querySelector('.track-title')).color,
            accent:getComputedStyle(document.querySelector('.listening-intro h1 em')).color})"""))
    assert len({x['bg'] for x in palettes})==3,palettes
    assert len({x['ink'] for x in palettes})==1 and len({x['accent'] for x in palettes})==1,palettes
    page.locator('#theme-close').click()
    page.emulate_media(reduced_motion='no-preference')
    index=page.locator('.track-select').evaluate_all("""es=>es.findIndex(e=>{let r=e.getBoundingClientRect(),v=e.closest('.track-list').getBoundingClientRect();return r.top>=v.top&&r.bottom<=v.bottom})""")
    page.locator('.track-select').nth(index).click()
    page.wait_for_selector('.logo-storm')
    page.wait_for_timeout(4300)
    pieces=page.locator('.logo-storm-piece').evaluate_all("""es=>es.map(e=>{let r=e.getBoundingClientRect();return {outside:r.right<0||r.bottom<0||r.left>innerWidth||r.top>innerHeight,opacity:parseFloat(getComputedStyle(e).opacity)}})""")
    assert 8<sum(x['outside'] for x in pieces)<60,pieces
    assert all(.1<x['opacity']<.6 for x in pieces)
    page.screenshot(path=str(OUT/'shards-distant.png'))
    page.evaluate("document.querySelector('#album-player').currentTime=35")
    levels=[]
    for _ in range(18):
        page.wait_for_timeout(250)
        levels.append(page.locator('#track-progress').evaluate("e=>Number(e.style.getPropertyValue('--seek-bass'))"))
    assert max(levels)>.03 and max(levels)-min(levels)>.025,levels
    page.wait_for_timeout(3000)
    assert page.locator('#logo-rebuild-clip rect').count()>0
    assert 'is-ink-rebuilt' in page.locator('#logo-wrap').get_attribute('class')
    assert 'logo-rebuild-clip' in page.locator('.reactive-logo').evaluate('e=>getComputedStyle(e).clipPath')
    page.screenshot(path=str(OUT/'ink-assembling.png'))
    # Finish the remaining individual arrivals; their finish callbacks reveal live SVG cells.
    page.evaluate("document.getAnimations().filter(a=>a.effect?.target?.matches('.logo-storm-piece')).forEach(a=>a.finish())")
    page.wait_for_timeout(250)
    assert page.locator('.logo-storm').count()==0
    assert page.locator('.logo-grain rect').evaluate('e=>getComputedStyle(e).animationName')=='pigment-drift'
    assert page.locator('.logo-vector').evaluate('e=>getComputedStyle(e).animationName')=='logoVectorDissolve'
    assert page.locator('.reactive-logo').evaluate('e=>getComputedStyle(e).animationName')=='reactiveLogoBreath'
    page.screenshot(path=str(OUT/'ink-complete.png'))
    page.locator('#immersive-play').click()
    assert page.locator('#track-progress').evaluate("e=>e.style.getPropertyValue('--seek-bass')")=='0'
    page.locator('#immersive-play').click()
    page.wait_for_timeout(350)
    assert page.locator('.logo-storm').count()==0
    assert page.evaluate("Number(document.body.dataset.stormNextAt)-Date.now()>270000")
    page.locator('#immersive-play').click()

    phone=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,device_scale_factor=2)
    mobile=phone.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)))
    mobile.goto(URL,wait_until='domcontentloaded');mobile.wait_for_timeout(1100)
    session=phone.new_cdp_session(mobile)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':230,'y':500}]})
    for y in range(480,279,-20):
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':230,'y':y}]})
        mobile.wait_for_timeout(30)
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    mobile.wait_for_timeout(1300)
    assert whole_rows(mobile)['partial']==0
    mobile.screenshot(path=str(OUT/'phone-snap.png'))
    phone.close()

    # Exercise a real wandering arrival, with deterministic choices instead of forcing the pose.
    character=browser.new_page(viewport={"width":1440,"height":900})
    character.on('pageerror',lambda e:errors.append(str(e)))
    character.add_init_script("Math.random=()=>.02; localStorage.setItem('inteonmteca-theme-duration','604800000')")
    character.goto(URL,wait_until='domcontentloaded')
    character.wait_for_selector('.room-resident[data-state="walking"]',timeout=25000)
    character.wait_for_selector('.room-resident[data-state="letter"]',timeout=15000)
    character.wait_for_timeout(1900)
    assert float(character.locator('.resident-mark').evaluate('e=>getComputedStyle(e).opacity'))>.5
    character.screenshot(path=str(OUT/'resident-m.png'))
    assert not errors,errors
    result={"checks":"passed","layouts":layouts,"offscreen_shards":sum(x['outside'] for x in pieces),"bass_levels":levels,"palettes":palettes,"errors":errors,"artifacts":str(OUT)}
    (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
    browser.close()
