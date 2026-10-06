"""Rendered interlude phases, true palette interpolation and light glass contrast."""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(tempfile.mkdtemp(prefix='inteon-charged-qa-'))
mobile='--mobile' in sys.argv
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.install()
    page.add_init_script("localStorage.setItem('inteonmteca-theme','desert');localStorage.setItem('inteonmteca-theme-duration','604800000');sessionStorage.setItem('inteon-storm-last',String(Date.now()));sessionStorage.setItem('inteon-interlude-next',String(Date.now()+6000))")
    page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded');page.wait_for_timeout(800)
    page.locator('#theme-hint').click()
    before=page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim()")
    page.locator('#theme-select').select_option('porcelain')
    assert page.evaluate("window.inteonThemeMorph.active")
    initial=page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim()")
    page.clock.fast_forward(7500);page.wait_for_timeout(100)
    middle=page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim()")
    assert middle not in [before,'#e8dfca'],(before,initial,middle)
    assert page.evaluate("window.inteonThemeMorph.active")
    page.screenshot(path=str(OUT/'theme-halfway.png'))
    page.clock.fast_forward(7800);page.wait_for_timeout(100)
    assert not page.evaluate("window.inteonThemeMorph.active")
    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim()")=='#e8dfca'
    page.locator('#theme-close').click();page.wait_for_timeout(800)
    light=page.evaluate('''()=>{let c=s=>getComputedStyle(document.querySelector(s));return {
        title:c('.track-title').color,heading:c('.listening-intro h1').color,em:c('.listening-intro h1 em').color,
        glass:c('.track-select').backgroundColor,art:c('.track-art').color,
        play:c('#immersive-play').backgroundColor,logo:c('.reactive-logo').filter,
        overflow:document.documentElement.scrollWidth>innerWidth};}''')
    assert light['heading']=='rgb(12, 15, 17)' and light['em']=='rgb(12, 15, 17)',light
    assert light['glass']=='rgba(0, 0, 0, 0.024)' and '12, 15, 17' in light['title'] and not light['overflow'],light
    page.screenshot(path=str(OUT/'light-glass.png'))
    # A second choice starts from the current displayed colors, without snapping to an endpoint.
    page.locator('#theme-hint').click();page.locator('#theme-select').select_option('glacier')
    page.clock.fast_forward(4200);page.wait_for_timeout(80)
    interrupted=page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim()")
    page.locator('#theme-select').select_option('amethyst')
    resumed=page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim()")
    assert max(abs(int(interrupted[i:i+2],16)-int(resumed[i:i+2],16)) for i in [1,3,5])<8,(interrupted,resumed)
    page.clock.fast_forward(15300);page.wait_for_timeout(100)
    page.locator('#theme-close').click()
    page.screenshot(path=str(OUT/'charged-color.png'))
    page.locator('.track-select').first.click();page.wait_for_function("!document.querySelector('#album-player').paused")
    page.wait_for_function("document.body.dataset.interludePhase==='dark'")
    started=page.evaluate('Number(document.body.dataset.interludeStartedAt)')
    def advance(ms):
        delta=started+ms-page.evaluate('Date.now()')
        if delta>0: page.clock.fast_forward(int(delta))
        page.wait_for_timeout(80)
    advance(3200)
    page.screenshot(path=str(OUT/'dark.png'))
    advance(5100);page.wait_for_timeout(4800)
    pair=page.locator('.track-item').evaluate_all('es=>es.filter(e=>Number(getComputedStyle(e).opacity)>.95).length')
    assert pair==2,pair
    page.screenshot(path=str(OUT/'two-tracks.png'))
    advance(12100);page.wait_for_timeout(3400)
    heading=float(page.locator('.listening-intro').evaluate('e=>getComputedStyle(e).opacity'))
    assert .1<heading<1,heading
    assert float(page.locator('#logo-wrap').evaluate('e=>getComputedStyle(e).opacity'))==0
    page.screenshot(path=str(OUT/'heading-appears.png'))
    advance(21100);page.wait_for_timeout(2600)
    assert float(page.locator('.active-player').evaluate('e=>getComputedStyle(e).opacity'))<.05
    advance(24100);page.wait_for_timeout(3300)
    solo=page.evaluate('''()=>({phase:document.body.dataset.interludePhase,
        player:getComputedStyle(document.querySelector('.active-player')).opacity,
        heading:getComputedStyle(document.querySelector('.listening-intro')).opacity,
        digits:getComputedStyle(document.querySelector('.scene-digits')).opacity,
        tracks:[...document.querySelectorAll('.track-item')].map(e=>getComputedStyle(e).opacity),
        mode:document.querySelector('.material-field').dataset.mode,pixels:Number(document.querySelector('.material-field').dataset.pixels)})''')
    assert solo['phase']=='energy' and solo['mode']=='pixels' and solo['pixels']>1000,solo
    assert .05<float(solo['player'])<.95,solo
    assert all(float(solo[x])<.01 for x in ['heading','digits']) and all(float(x)<.01 for x in solo['tracks']),solo
    # Sample rendered alpha, not a position variable: the isolated logo stays at home.
    alignment=page.evaluate('''()=>{const c=document.querySelector('.material-field'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let l=c.width,r=0,t=c.height,b=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>100){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
      const scale=c.width/innerWidth,rect=document.querySelector('#logo-wrap').getBoundingClientRect();return {dx:Math.abs((l+r)/2/scale-(rect.left+rect.width/2)),dy:Math.abs((t+b)/2/scale-(rect.top+rect.height/2))};}''')
    assert alignment['dx']<10 and alignment['dy']<10,alignment
    pixels=page.locator('.material-field').evaluate('e=>e.toDataURL()')
    page.wait_for_timeout(250)
    assert pixels!=page.locator('.material-field').evaluate('e=>e.toDataURL()')
    page.screenshot(path=str(OUT/'pixel-energy.png'))
    advance(45100);page.wait_for_timeout(4500)
    curtain=float(page.locator('.scene-curtain').evaluate('e=>getComputedStyle(e).opacity'))
    assert .05<curtain<.95,curtain
    page.screenshot(path=str(OUT/'returning.png'))
    advance(58000)
    assert page.locator('body').get_attribute('data-interlude-phase')=='idle'
    assert not page.locator('.scene-curtain').count()
    page.evaluate("document.querySelector('#album-player').pause()")
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.material-field').evaluate('e=>getComputedStyle(e).display')=='none'
    assert not errors,errors
    report={'checks':'passed','mobile':mobile,'morph':{'before':before,'middle':middle},'light':light,'solo':solo,'errors':errors,'artifacts':str(OUT)}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
    browser.close()
