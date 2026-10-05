"""Baseline comparison, renderer breakpoint checks and dialog screenshot evidence."""
from pathlib import Path
exec(compile((Path(__file__).parent/'qa_home.py').read_text(encoding='utf-8').split('results=[]; mode=')[0],__file__,'exec'))
report={}
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel='msedge')
        for baseline in [True,False]:
            ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            ctx.add_init_script(INIT);page=ctx.new_page()
            if baseline:
                page.route(URL,lambda r:r.fulfill(body=(OUT/'before-index.html').read_bytes(),content_type='text/html'))
                for name in ['styles.css','home-player.css']:
                    page.route(f'**/{name}*',lambda r,request,n=name:r.fulfill(body=(OUT/('before-'+n)).read_bytes(),content_type='text/css'))
            page.goto(URL,wait_until='networkidle')
            page.locator('.track-select').filter(has_text='Last Eclipse (Negative Space Resonance)').first.click()
            page.wait_for_function('!player.paused && player.currentTime>.1')
            page.locator('#immersive-play').click();page.wait_for_function('player.paused')
            src=page.evaluate('player.src')
            page.reload(wait_until='networkidle');page.wait_for_timeout(500)
            state=page.evaluate('({paused:player.paused,hasTrack:currentTrack!==null,origin:inteonPlayback.read()?.origin,title:document.querySelector("#now-playing-title").textContent})')
            state['sameAudio']=page.evaluate('player.src')==src
            report['baselineReload' if baseline else 'redesignReload']=state
            ctx.close()
        assert report['baselineReload']==report['redesignReload'],report
        report['reloadBehaviorPreserved']=True
        ctx=browser.new_context(viewport={'width':1440,'height':900});ctx.add_init_script(INIT);page=ctx.new_page();page.goto(URL,wait_until='networkidle')
        report['resize']=[]
        for width in [390,1440,800,801,390]:
            page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(350)
            start=page.evaluate('audit.draw');page.wait_for_timeout(650);delta=page.evaluate('audit.draw')-start
            mode=page.locator('html').get_attribute('data-background-mode')
            assert (delta==0 and mode=='static') if width<=800 else (delta>0 and mode=='live')
            report['resize'].append({'width':width,'mode':mode,'canvasDraws':delta})
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(350)
        report['reducedMotionRunningAnimations']=page.evaluate('document.getAnimations().filter(a=>a.playState==="running").map(a=>a.animationName)')
        assert not report['reducedMotionRunningAnimations']
        ctx.close()
        for width,height,touch in [(1440,900,False),(390,844,True),(320,740,True)]:
            ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch);ctx.add_init_script(INIT);page=ctx.new_page();page.goto(URL,wait_until='networkidle')
            for name in ['theme','auth','chat']:
                page.locator(f'#{name}-hint').click();page.wait_for_timeout(250)
                page.screenshot(path=str(OUT/f'dialog-{width}-{name}.png'))
                box=page.locator(f'#{name}-panel').bounding_box()
                assert box['x']>=0 and box['x']+box['width']<=width+1,(name,box)
                assert box['y']>=0 and box['y']+box['height']<=height+1,(name,box)
                page.keyboard.press('Escape')
                assert page.locator(f'#{name}-panel').is_hidden()
            ctx.close()
        report['dialogsWithinViewport']=True
        report['browsers']={'edge':browser.version}
        browser.close()
finally:
    (OUT/'detail-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    server.shutdown();server.server_close();store.close();scratch.cleanup()
print(json.dumps(report,ensure_ascii=False,indent=2))
