"""Real Edge regression for the spatial homepage; uses local server on 8080."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/spatial-player'
OUT.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for name, w, h, mobile in [('desktop',1440,900,False),('laptop',1024,768,False),('portrait',390,844,True),('small',320,568,True),('landscape',844,390,True),('small-landscape',667,375,True)]:
        ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
        page=ctx.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script('''window.auditRaf={};const raf=window.requestAnimationFrame;window.requestAnimationFrame=function(fn){auditRaf[fn.name]=(auditRaf[fn.name]||0)+1;return raf.call(window,fn)};
const d=new Date();localStorage.setItem('inteonmteca-street-day',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);localStorage.setItem('inteonmteca-street-rule','10..65');localStorage.setItem('inteonmteca-street-return-sec','65');''')
        page.goto('http://127.0.0.1:8080/')
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT/f'{name}-idle.png'))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),name
        # Real pointer selection of a visible track (not an offscreen duplicate).
        box=page.locator('#track-list').bounding_box()
        page.mouse.click(box['x']+box['width']/2,box['y']+42)
        page.wait_for_timeout(1000)
        assert page.locator('#active-player').is_visible(),name
        page.wait_for_function('document.querySelector("#album-player").readyState>=1',timeout=15000)
        assert not page.locator('#album-player').evaluate('(a)=>a.paused'),name
        page.screenshot(path=str(OUT/f'{name}-playing.png'))
        geometry=page.evaluate('''() => { const ids=['previous-track','next-track','immersive-play','track-progress']; const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {controls:Object.fromEntries(ids.map(id=>[id,rect(id)])),list:rect('track-list'),player:rect('active-player'),mode:document.documentElement.dataset.backgroundMode,raf:auditRaf,overflow:document.documentElement.scrollWidth>innerWidth}; }''')
        for id,r in geometry['controls'].items():
            assert r['w']>=44 and r['h']>=44,(name,id,r)
            assert r['x']>=0 and r['x']+r['w']<=w+1 and r['y']>=0 and r['y']+r['h']<=h,(name,id,r)
        a,b=geometry['list'],geometry['player']
        assert a['x']+a['w']<=b['x'] or b['x']+b['w']<=a['x'] or a['y']+a['h']<=b['y'] or b['y']+b['h']<=a['y'],(name,'overlap',a,b)
        page.locator('#immersive-play').click()
        assert page.locator('#album-player').evaluate('(a)=>a.paused')
        page.locator('#immersive-play').focus(); page.keyboard.press('Enter')
        page.wait_for_timeout(150)
        assert not page.locator('#album-player').evaluate('(a)=>a.paused')
        title=page.locator('#now-playing-title').inner_text()
        page.locator('#next-track').click();page.wait_for_timeout(850)
        assert page.locator('#now-playing-title').inner_text()!=title
        page.locator('#track-progress').focus();page.keyboard.press('ArrowRight')
        assert float(page.locator('#track-progress').input_value())>0
        page.locator('#immersive-play').click();page.wait_for_timeout(300)
        page.keyboard.press('Escape')
        assert page.locator('#active-player').is_visible()
        assert page.locator('#close-track').count()==0
        assert page.locator('#album-player').evaluate('(a)=>a.paused')
        # Force both recycling boundaries, retaining bounded DOM.
        for edge in [0,1,0,1]:
            page.locator('#track-list').evaluate('(e,end)=>{e.scrollTop=end?e.scrollHeight:0;e.dispatchEvent(new Event("scroll"));}',edge)
            page.wait_for_timeout(180)
            state=page.locator('#track-list').evaluate('(e)=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight,n:e.children.length})')
            assert state['top']>0 and state['top']<state['max'] and state['n']<=150,(name,state)
        page.locator('#theme-hint').click();page.locator('#theme-select').select_option('glacier');page.locator('#theme-close').click();page.wait_for_timeout(800)
        assert page.locator('html').get_attribute('data-theme')=='glacier'
        page.screenshot(path=str(OUT/f'{name}-glacier.png'))
        page.locator('#chat-hint').click();assert page.locator('#chat-panel').is_visible()
        page.screenshot(path=str(OUT/f'{name}-chat.png'))
        close=page.locator('#chat-close').bounding_box();page.mouse.click(close['x']+close['width']/2,close['y']+close['height']/2)
        assert page.locator('#chat-panel').is_hidden()
        assert page.locator('#chat-hint').evaluate('(e)=>e===document.activeElement')
        if mobile: assert geometry['mode']=='static' and not geometry['raf'].get('tickVisuals',0)
        assert not errors,errors
        results.append({'viewport':name,'geometry':geometry,'infinite':state,'errors':errors})
        ctx.close()
    browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(results),'evidence':str(OUT)},indent=2))
