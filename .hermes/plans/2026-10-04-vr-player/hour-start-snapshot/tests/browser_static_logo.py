"""Local browser regression: static mobile artwork, live text, palettes and chat."""
import functools, json, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = root / 'tests/artifacts/vr-player/static-logo'
out.mkdir(parents=True, exist_ok=True)
import sys, tempfile, os
sys.path.insert(0, str(root))
from server.app import Store, make_handler
scratch = tempfile.TemporaryDirectory()
store = Store(Path(scratch.name) / 'test.db')
os.environ['INTEONMTECA_QUIET'] = '1'
class Quiet(make_handler(root, store, None)):
    def do_GET(self):
        try: super().do_GET()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Quiet)
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for name, width, height, mobile, reduced in [('portrait',390,844,True,False), ('landscape',844,390,True,False), ('desktop',1440,900,False,False), ('reduced',390,844,True,True), ('small',320,568,True,False), ('small-landscape',667,375,True,False)]:
            ctx = browser.new_context(viewport={'width':width,'height':height}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1, reduced_motion='reduce' if reduced else 'no-preference')
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda e: errors.append(str(e)))
            page.add_init_script('''window.auditRaf={}; const raf=window.requestAnimationFrame; window.requestAnimationFrame=function(fn){auditRaf[fn.name]=(auditRaf[fn.name]||0)+1; return raf.call(window,fn)};
const d=new Date();localStorage.setItem('inteonmteca-street-day',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);localStorage.setItem('inteonmteca-street-rule','10..65');localStorage.setItem('inteonmteca-street-return-sec','65');''')
            page.route('https://**/*',lambda r:r.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            page.wait_for_selector('.track-select')
            page.wait_for_timeout(800)
            page.locator('#theme-hint').click()
            page.locator('#theme-select').select_option('oxblood')
            page.locator('#theme-duration').fill('1000')
            page.locator('#theme-duration').dispatch_event('change')
            page.locator('#theme-close').click()
            page.wait_for_timeout(1800)
            page.evaluate('''window.auditTextChanges=0; window.auditLogoChanges=0;
new MutationObserver(ms=>auditTextChanges+=ms.length).observe(document.querySelector('#track-list'),{childList:true,characterData:true,subtree:true});
new MutationObserver(ms=>auditLogoChanges+=ms.length).observe(document.querySelector('#logo-wrap'),{attributes:true,childList:true,subtree:true});''')
            page.wait_for_timeout(5000)
            state=page.evaluate('''() => ({mode:document.documentElement.dataset.backgroundMode, raf:auditRaf,textChanges:auditTextChanges,logoChanges:auditLogoChanges,decorativeNodes:document.querySelectorAll('#perception-visual,#ink-field,#reactive-logo,#logo-particles').length, animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName,target:a.effect.target.className})), overflow:document.documentElement.scrollWidth>innerWidth,mask:getComputedStyle(document.querySelector('#logo-wrap')).maskImage,paint:getComputedStyle(document.querySelector('#logo-wrap')).backgroundImage})''')
            page.screenshot(path=str(out/f'{name}-oxblood.png'))
            assert not state['overflow'], state
            assert page.locator('.chat-sign').count()==0
            if mobile:
                assert state['mode']=='static', state
                assert page.locator('#perception-visual, #ink-field, #reactive-logo, #logo-particles').evaluate_all('els=>els.every(e=>getComputedStyle(e).display==="none")'), state
                assert not any(a['name'] in ['reactiveLogoBreath', 'logoVectorDissolve'] for a in state['animations']), state
                assert not state['raf'].get('tickVisuals',0) and state['logoChanges']==0, state
                assert ('logo-fragmented.png' in state['mask']), state
                assert state['textChanges']==0, 'Catalogue names stay readable; motion belongs to the heading'
            else:
                assert state['mode']=='live' and state['raf'].get('tickVisuals',0)>0 and state['logoChanges']>0, state
            page.locator('#theme-hint').click()
            page.locator('#theme-select').select_option('glacier')
            page.locator('#theme-close').click()
            page.wait_for_timeout(1800)
            paint2=page.locator('#logo-wrap').evaluate('(el)=>getComputedStyle(el).backgroundImage')
            if mobile: assert state['paint']!=paint2
            page.screenshot(path=str(out/f'{name}-glacier.png'))
            page.locator('#chat-hint').click()
            assert page.locator('#chat-panel').is_visible()
            assert page.locator('#chat-hint').get_attribute('aria-expanded')=='true'
            assert page.locator('#chat-input').is_visible()
            page.screenshot(path=str(out/f'{name}-chat.png'))
            # Desktop panel deliberately floats: click the real current hit target.
            close_box=page.locator('#chat-close').bounding_box()
            page.mouse.click(close_box['x']+close_box['width']/2,close_box['y']+close_box['height']/2)
            assert page.locator('#chat-panel').is_hidden()
            assert page.locator('#chat-hint').get_attribute('aria-expanded')=='false'
            assert page.locator('#chat-hint').evaluate('(el)=>el===document.activeElement')
            # Exercise real media, not a mocked play() or synthetic response.
            # Real wheel input traverses both ends without reaching a hard stop.
            list_box=page.locator('#track-list').bounding_box()
            page.mouse.move(list_box['x']+list_box['width']/2,list_box['y']+list_box['height']/2)
            for delta in [4800,-9600,4800]:
                page.mouse.wheel(0,delta)
                page.wait_for_timeout(1400)
                loop=page.locator('#track-list').evaluate('(el)=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight,count:el.children.length})')
                assert loop['top']>0 and loop['top']<loop['max'] and loop['count']<=128, loop
            visible_index=page.locator('#track-list').evaluate('''el=>{const b=el.getBoundingClientRect();return [...el.children].findIndex(x=>{const r=x.getBoundingClientRect();return r.top>=b.top && r.bottom<=b.bottom})}''')
            if visible_index < 0:
                visible_index=page.locator('#track-list').evaluate('''el=>{const b=el.getBoundingClientRect();return [...el.children].findIndex(x=>{const r=x.getBoundingClientRect();return r.top<=b.top+b.height/2 && r.bottom>b.top+b.height/2})}''')
                page.locator('.track-select').nth(visible_index).scroll_into_view_if_needed()
                page.wait_for_timeout(200)
            assert visible_index>=0
            page.locator('.track-select').nth(visible_index).click()
            page.wait_for_selector('#active-player.is-visible')
            page.wait_for_function('document.querySelector("#album-player").currentTime > .1')
            page.wait_for_timeout(800)
            geometry=page.evaluate('''() => {const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {player:rect('#active-player'),list:rect('#track-list'),transport:rect('.transport'),view:{width:innerWidth,height:innerHeight},count:document.querySelectorAll('.track-item').length,unique:new Set([...document.querySelectorAll('.track-item')].map(x=>x.dataset.trackIndex)).size}}''')
            page.screenshot(path=str(out/f'{name}-playing.png'))
            assert geometry['count']>geometry['unique'], geometry
            assert geometry['player']['x']>=0 and geometry['player']['right']<=width+1, geometry
            assert geometry['player']['bottom']<=height and geometry['list']['bottom']<=geometry['player']['y']+1, geometry
            assert geometry['transport']['right']<=geometry['player']['right'], geometry
            page.locator('#immersive-play').click()
            page.wait_for_function('document.querySelector("#album-player").paused')
            page.locator('#immersive-play').click()
            page.wait_for_function('!document.querySelector("#album-player").paused')
            before_src=page.locator('#album-player').get_attribute('src')
            page.locator('#next-track').click()
            page.wait_for_function('(src)=>document.querySelector("#album-player").getAttribute("src")!==src',arg=before_src)
            page.wait_for_timeout(700)
            page.locator('#previous-track').click()
            page.wait_for_function('(src)=>document.querySelector("#album-player").getAttribute("src")===src',arg=before_src)
            page.wait_for_function('document.querySelector("#album-player").duration>1')
            page.locator('#track-progress').fill('300')
            page.wait_for_function('document.querySelector("#album-player").currentTime > document.querySelector("#album-player").duration*.25')
            if not mobile:
                page.locator('#track-volume').fill('0.35')
                page.locator('#track-volume').dispatch_event('input')
                assert page.locator('#album-player').evaluate('(el)=>Math.abs(el.volume-.35)<.01')
            page.locator('#immersive-play').click()
            page.wait_for_function('document.querySelector("#album-player").paused')
            page.keyboard.press('Escape')
            assert page.locator('#active-player').is_visible()
            assert page.locator('#close-track').count()==0
            assert page.locator('#album-player').evaluate('(el)=>el.paused')
            assert not errors, errors
            state.update(name=name, errors=errors, themeRecolored=state['paint']!=paint2,chatOpenClose=True,geometry=geometry,playbackControls=True)
            results.append(state)
            ctx.close()
        browser.close()
finally:
    server.shutdown();server.server_close()
    store.close()
    scratch.cleanup()
(out/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
