"""Exact half-screen layout, whole rows, mobile controls, toolbar and moving fields."""
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(tempfile.mkdtemp(prefix='inteon-edge-grid-'))
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000');sessionStorage.setItem('inteon-storm-last',String(Date.now()))")
    page.goto('http://127.0.0.1:8080/',wait_until='networkidle')
    page.wait_for_selector('.logo-ripples')
    layouts=[]
    for width,height in [(2530,1308),(1440,900),(900,600),(390,844),(320,568),(768,1024),(844,390),(568,320)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(750)
        data=page.evaluate('''()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON(),list=r('.track-list');
            const rows=[...document.querySelectorAll('.track-select')].map(e=>e.getBoundingClientRect()).filter(b=>b.bottom>list.top+.6&&b.top<list.bottom-.6);
            return {width:innerWidth,height:innerHeight,list,logo:r('#logo-wrap'),heading:r('.listening-intro h1'),player:r('.active-player'),toolbar:r('.room-toolbar'),
            buttons:[...document.querySelectorAll('.room-toolbar button,.room-toolbar a')].map(e=>e.getBoundingClientRect().toJSON()),
            controls:[...document.querySelectorAll('#previous-track,#immersive-play,#next-track,#track-volume')].map(e=>e.getBoundingClientRect().toJSON()),
            partial:rows.filter(b=>b.top<list.top-.6||b.bottom>list.bottom+.6).length,rows:rows.length,overflow:document.documentElement.scrollWidth>innerWidth};}''')
        assert not data['overflow'] and data['partial']==0,data
        desktop=width>800 or (width>500 and height<=500)
        assert abs(data['list']['left']-(width/2 if desktop else 0))<1,data
        assert abs(data['list']['right']-width)<1,data
        if desktop:
            assert abs(data['list']['bottom']-height)<1,data
            assert abs(data['heading']['right']-(width/2-16))<1,data
            assert data['player']['right']<width/2 and data['player']['width']>width*.45,data
            assert data['logo']['width']<width*.4,data
        else:
            assert abs(data['list']['bottom']-data['player']['top'])<1,data
            assert data['player']['width']==width,data
            assert data['rows']>=(8 if height>800 else 4),data
        for b in data['buttons']:
            assert b['left']>=data['toolbar']['left']-.5 and b['right']<=width+.5 and b['bottom']<data['list']['top'],data
        for b in data['controls']:
            assert b['left']>=data['player']['left']-.5 and b['right']<=data['player']['right']+.5,data
            assert b['top']>=data['player']['top']-.5 and b['bottom']<=data['player']['bottom']+.5,data
        layouts.append(data);page.screenshot(path=str(OUT/f'layout-{width}.png'))
        page.locator('.track-list').hover();page.mouse.wheel(0,263);page.wait_for_timeout(800)
        assert page.locator('.track-list').evaluate('''e=>{const v=e.getBoundingClientRect();return [...e.querySelectorAll('.track-select')].every(b=>{let r=b.getBoundingClientRect();return r.bottom<=v.top+.7||r.top>=v.bottom-.7||(r.top>=v.top-.7&&r.bottom<=v.bottom+.7)})}''')
    page.set_viewport_size({'width':1440,'height':900});page.wait_for_timeout(700)
    for button,panel in [('#theme-hint','#theme-panel'),('#auth-hint','#auth-panel'),('#chat-hint','#chat-panel')]:
        page.locator(button).click();assert page.locator(panel).is_visible();page.keyboard.press('Escape');assert not page.locator(panel).is_visible()
    before=page.locator('.logo-ripples').evaluate('e=>e.toDataURL()');field=page.locator('.material-field').evaluate('e=>e.toDataURL()')
    page.wait_for_timeout(700)
    assert before!=page.locator('.logo-ripples').evaluate('e=>e.toDataURL()')
    assert field!=page.locator('.material-field').evaluate('e=>e.toDataURL()')
    assert int(page.locator('.logo-ripples').get_attribute('data-particles'))>300
    visible=page.locator('.track-select').evaluate_all('es=>es.findIndex(e=>{const r=e.getBoundingClientRect(),v=e.closest(".track-list").getBoundingClientRect();return r.top>=v.top&&r.bottom<=v.bottom})')
    page.locator('.track-select').nth(visible).click();page.wait_for_function("document.querySelector('#album-player').readyState>=2&&!document.querySelector('#album-player').paused")
    page.locator('#immersive-play').click();page.wait_for_function("document.querySelector('#album-player').paused")
    page.emulate_media(reduced_motion='reduce');assert page.locator('.material-field').evaluate('e=>getComputedStyle(e).display')=='none'
    page.locator('#theme-hint').click();page.locator('#theme-select').select_option('porcelain');page.keyboard.press('Escape')
    page.screenshot(path=str(OUT/'light-desktop.png'))
    phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
    mobile=phone.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)))
    mobile.goto('http://127.0.0.1:8080/',wait_until='networkidle');mobile.wait_for_timeout(600)
    touch=phone.new_cdp_session(mobile)
    touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':220,'y':590}]})
    for y in range(580,299,-20):
        touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':220,'y':y}]});mobile.wait_for_timeout(25)
    touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});mobile.wait_for_timeout(1000)
    mobile.screenshot(path=str(OUT/'touch-mobile.png'))
    assert mobile.locator('.track-list').evaluate('e=>e.scrollTop')>0
    assert not errors,errors
    (OUT/'report.json').write_text(json.dumps({'checks':'passed','layouts':layouts,'errors':errors},indent=2),encoding='utf-8')
    print(json.dumps({'checks':'passed','artifacts':str(OUT),'errors':errors}))
    browser.close()
