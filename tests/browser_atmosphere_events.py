"""Verify rare effects with an accelerated scheduling clock and real rendered transitions."""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(tempfile.mkdtemp(prefix='inteon-atmosphere-qa-'))
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    mobile='--mobile' in sys.argv
    page=browser.new_page(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.install()
    page.add_init_script("sessionStorage.setItem('inteon-storm-last',String(Date.now()));localStorage.setItem('inteonmteca-theme-duration','604800000')")
    page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
    page.wait_for_timeout(900)
    index=page.locator('.track-select').evaluate_all("es=>es.findIndex(e=>{let r=e.getBoundingClientRect(),v=e.closest('.track-list').getBoundingClientRect();return r.top>=v.top&&r.bottom<=v.bottom})")
    page.locator('.track-select').nth(index).click()
    page.wait_for_function("!document.querySelector('#album-player').paused")
    try:
        page.wait_for_function("Number(document.body.dataset.interludeNextAt)>0 && Number(document.body.dataset.stormNextAt)>0")
    except Exception:
        print(page.evaluate("()=>{const a=document.querySelector('#album-player');return {paused:a.paused,ready:a.readyState,network:a.networkState,src:a.currentSrc,error:a.error?.message,interlude:document.body.dataset.interludeNextAt,storm:document.body.dataset.stormNextAt}}"))
        print(errors)
        raise
    plan=page.evaluate("()=>({first:Number(document.body.dataset.interludeNextAt)-Date.now(),storm:Number(document.body.dataset.stormNextAt)-Date.now(),cloud:Number(document.body.dataset.cloudNextAt)-Date.now()})")
    assert 119000<=plan['first']<=240000,plan
    assert 295000<=plan['storm']<=300000,plan
    assert 255000<=plan['cloud']<=260000,plan
    assert page.locator('.logo-storm').count()==0
    page.clock.fast_forward(int(plan['first'])+1200)
    page.wait_for_function("document.body.dataset.interludePhase==='dark'")
    next_delay=page.evaluate("Number(document.body.dataset.interludeNextAt)-Date.now()")
    assert 717000<=next_delay<=720000,next_delay
    page.wait_for_timeout(3100)
    dark=page.evaluate("""()=>({curtain:getComputedStyle(document.querySelector('.scene-curtain')).opacity,
        heading:getComputedStyle(document.querySelector('.listening-intro')).opacity,
        controls:getComputedStyle(document.querySelector('#immersive-play')).opacity,
        progress:getComputedStyle(document.querySelector('.transport-seek-field')).opacity,
        tracks:[...document.querySelectorAll('.track-item')].map(e=>getComputedStyle(e).opacity)})""")
    assert float(dark['curtain'])>.95 and float(dark['heading'])<.05 and float(dark['controls'])<.05,dark
    assert float(dark['progress'])==1 and all(float(x)<.05 for x in dark['tracks']),dark
    page.screenshot(path=str(OUT/'dark-digits-progress.png'))
    # The complete phase rendering is covered by browser_charged_scene.py.
    page.clock.fast_forward(58000)
    page.wait_for_function("document.body.dataset.interludePhase==='idle'")
    assert page.locator('.scene-curtain').count()==0
    if not page.locator('.sky-clouds').count():
        delta=page.evaluate('Number(document.body.dataset.cloudNextAt)-Date.now()')
        page.clock.fast_forward(max(1,int(delta)+1200))
    page.wait_for_selector('.sky-clouds',state='attached')
    page.evaluate("document.querySelector('.sky-clouds').getAnimations()[0].currentTime=40000")
    page.screenshot(path=str(OUT/'clouds.png'))
    assert float(page.locator('.sky-clouds').evaluate('e=>getComputedStyle(e).opacity'))>.1
    assert page.evaluate('Number(document.body.dataset.cloudNextAt)-Date.now()>200000')
    page.clock.fast_forward(81000)
    assert page.locator('.sky-clouds').count()==0
    page.evaluate("document.querySelector('#album-player').pause()")
    assert not errors,errors
    report={'checks':'passed','initial_schedule':plan,'repeat_interlude_ms':next_delay,'errors':errors,'artifacts':str(OUT)}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
    browser.close()
