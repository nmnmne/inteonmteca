"""Check the curated themes, reference composition and pigment animation in Edge."""
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(tempfile.mkdtemp(prefix='inteon-theme-composition-'))
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1440,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000');sessionStorage.setItem('inteon-storm-last',String(Date.now()))")
    page.goto('http://127.0.0.1:8080/', wait_until='domcontentloaded')
    page.wait_for_selector('.track-select')
    page.wait_for_timeout(1100)
    themes=page.locator('#theme-select option').evaluate_all('es=>es.map(e=>e.value)')
    assert len(themes)==20 and len(set(themes))==20, themes
    assert page.locator('#theme-select optgroup').evaluate_all('es=>es.map(e=>e.children.length)')==[2]*10
    layouts=[]
    for width,height in [(2530,1308),(1440,900),(900,600),(390,844),(320,568),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(650)
        data=page.evaluate('''()=>{
            const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();
            const list=r('.track-list');
            const tiles=[...document.querySelectorAll('.track-select')].map(e=>e.getBoundingClientRect()).filter(t=>t.bottom>list.top+.5&&t.top<list.bottom-.5);
            return {player:r('.active-player'),logo:r('#logo-wrap'),list,heading:r('.listening-intro h1'),
              partial:tiles.filter(t=>t.top<list.top-.5||t.bottom>list.bottom+.5).length,
              overflow:document.documentElement.scrollWidth>innerWidth,
              controls:[...document.querySelectorAll('#previous-track,#immersive-play,#next-track,#track-volume')].map(e=>e.getBoundingClientRect().toJSON())};
        }''')
        assert not data['overflow'] and data['partial']==0,(width,data)
        assert data['player']['bottom']<=height,(width,data)
        for c in data['controls']:
            assert c['x']>=data['player']['x'] and c['right']<=data['player']['right']+.5,(width,data)
        if width>800 and height>540:
            assert data['player']['right']<data['list']['left'],(width,data)
            assert data['logo']['bottom']<data['player']['top'],(width,data)
            assert data['heading']['bottom']<data['logo']['top'],(width,data)
            assert data['list']['bottom']>data['player']['bottom']-74,(width,data)
        layouts.append({'width':width,'height':height,**data})
        page.screenshot(path=str(OUT/f'layout-{width}.png'))
    page.set_viewport_size({'width':1440,'height':900})
    page.locator('#theme-hint').click()
    page.emulate_media(reduced_motion="reduce")
    palettes=[]
    for theme in themes:
        page.locator('#theme-select').select_option(theme)
        data=page.evaluate('''()=>({id:document.documentElement.dataset.theme,mood:document.documentElement.dataset.themeMood,
            bg:getComputedStyle(document.body).getPropertyValue('--theme-bg'),ink:getComputedStyle(document.querySelector('.track-title')).color})''')
        assert data['id']==theme,data
        palettes.append(data)
    assert len({t['bg'] for t in palettes})==20,palettes
    for theme in ['porcelain','chalk','abyss','moss','glacier','hibiscus','desert']:
        page.locator('#theme-select').select_option(theme)
        page.locator('#theme-close').click()
        page.wait_for_timeout(1700)
        page.screenshot(path=str(OUT/f'theme-{theme}.png'))
        page.locator('#theme-hint').click()
    page.locator('#theme-close').click()
    page.emulate_media(reduced_motion='no-preference')
    before=page.locator('.logo-ripples').evaluate('e=>e.toDataURL()')
    page.wait_for_timeout(600)
    after=page.locator('.logo-ripples').evaluate('e=>e.toDataURL()')
    assert len(after)>10000 and before!=after,'ripple canvas is painted and changes'
    page.locator('.track-select').first.click()
    page.wait_for_function("!document.querySelector('#album-player').paused")
    page.locator('#immersive-play').click()
    page.wait_for_function("document.querySelector('#album-player').paused")
    page.emulate_media(reduced_motion='reduce')
    page.locator('#theme-hint').click();page.locator('#theme-select').select_option('porcelain');page.locator('#theme-close').click()
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(1700)
    page.screenshot(path=str(OUT/'light-mobile.png'))
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.logo-ripples').evaluate('e=>getComputedStyle(e).display')=='none'
    assert not errors,errors
    report={'checks':'passed','palettes':palettes,'layouts':layouts,'errors':errors,'artifacts':str(OUT)}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'checks':'passed','artifacts':str(OUT),'errors':errors}))
    browser.close()
