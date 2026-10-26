"""Automatic palette fades, live letters at heavy rest, queueing and interruption.

Finite visual/functional QA; calibrated performance lives in calibrated_benchmark.py.
Only mocked chat GET, no real account or message writes.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).parent/'artifacts'/'fps-priority-20261026'/'theme-visual'
OUT.mkdir(parents=True,exist_ok=True)
INIT="""(() => {
  let seed=1234567;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const d=new Date();localStorage.setItem('inteonmteca-theme-duration-day',[d.getFullYear(),d.getMonth()+1,d.getDate()].join('-'));
  localStorage.setItem('inteonmteca-theme-duration','8000');sessionStorage.setItem('inteon-storm-last',String(Date.now()));
  window.themeQA={commits:0,glyphChanges:0,heavyClears:0};
  window.addEventListener('inteon-theme-frame',()=>themeQA.commits++);
  new MutationObserver(rs=>{for(const r of rs)if(r.attributeName==='data-glyph'&&r.target.classList?.contains('text-wave-mask'))themeQA.glyphChanges++;}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-glyph']});
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.matches('#perception-visual,#logo-reactive-canvas,.material-field,.logo-ripples'))themeQA.heavyClears++;return clear.apply(this,args);};
})();"""
SNAP="""()=>({phase:document.documentElement.dataset.ambientPhase,native:document.documentElement.classList.contains('is-theme-native'),active:inteonThemeMorph.active,owner:inteonHomeEffects.active,commits:themeQA.commits,glyphChanges:themeQA.glyphChanges,heavyClears:themeQA.heavyClears,audio:document.querySelector('#album-player').currentTime,glyphs:[...document.querySelectorAll('.text-wave-mask')].map(e=>e.dataset.glyph||'').join(''),drift:[...document.querySelectorAll('.material-field,.perception-visual,.logo-ripples')].map(e=>({cls:e.className,translate:getComputedStyle(e).translate,scale:getComputedStyle(e).scale,animation:getComputedStyle(e).animationName}))})"""

def settle(page):
    page.wait_for_function("!inteonThemeMorph.active&&!inteonThemeMorph.pending&&inteonHomeEffects.active!=='theme'",timeout=6500)

report=[]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
    for mobile in (False,True):
        label='mobile' if mobile else 'desktop';folder=OUT/label;folder.mkdir(exist_ok=True)
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
        context.add_init_script(INIT)
        def route(r):
            if r.request.method not in ('GET','HEAD','OPTIONS'):r.abort();return
            if '/api/chat' in r.request.url:r.fulfill(json={'messages':[]});return
            r.continue_()
        context.route('**/*',route)
        page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
        page.evaluate("window.inteonPlayTrack(window.INTEONMTECA_PLAYLIST.find(t=>t.title==='Слишком холод'))")
        page.wait_for_function("document.querySelector('#album-player').currentTime>0")
        initial=page.evaluate('document.documentElement.dataset.theme');initial_time=page.evaluate("document.querySelector('#album-player').currentTime")
        page.screenshot(path=str(folder/'before.png'))
        # The eight-second fixture crosses the natural ten-second heavy-rest edge.
        page.wait_for_function('inteonThemeMorph.active',timeout=13000)
        assert page.evaluate("inteonHomeEffects.active==='theme'")
        native_supported=page.evaluate("typeof document.startViewTransition==='function'")
        page.wait_for_function("document.documentElement.dataset.ambientPhase==='frozen'&&inteonThemeMorph.active",timeout=6000)
        page.wait_for_timeout(150)
        before=page.evaluate(SNAP);page.screenshot(path=str(folder/'fade-rest-a.png'))
        page.wait_for_timeout(450)
        after=page.evaluate(SNAP);page.screenshot(path=str(folder/'fade-rest-b.png'))
        assert before['phase']==after['phase']=='frozen',(before,after)
        assert after['heavyClears']==before['heavyClears'],(before,after)
        assert after['glyphChanges']>before['glyphChanges'] and after['glyphs']!=before['glyphs'],(before,after)
        assert after['audio']>before['audio'] and after['audio']>initial_time
        if native_supported:assert before['native'] and after['native'],(before,after)
        settle(page)
        assert page.evaluate('document.documentElement.dataset.theme')!=initial
        assert not page.evaluate("document.querySelector('#album-player').paused")
        page.screenshot(path=str(folder/'after.png'))
        # Prevent the next automatic timer from competing with the interaction cases.
        page.locator('#theme-duration').evaluate("e=>{e.value='1000';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));}")
        page.evaluate("inteonMobileLogo.stop();inteonLogoStorm.stop();inteonAtmosphere.stop();inteonLogoAcid.stop();")

        page.evaluate('randomizeTheme()');page.wait_for_function('inteonThemeMorph.active')
        page.locator('#auth-hint').click()
        page.wait_for_function('!inteonThemeMorph.active',timeout=1000)
        assert page.locator('#auth-panel').is_visible()
        page.locator('#auth-email').fill('snapshot-check@example.com')
        assert page.locator('#auth-email').input_value()=='snapshot-check@example.com'
        page.locator('#auth-close').click()

        page.evaluate("inteonHomeEffects.claim('qa-queue');setTheme(themeNames[1]);setTheme(themeNames[2]);")
        assert page.evaluate("inteonThemeMorph.pending&&inteonHomeEffects.active==='qa-queue'")
        page.evaluate("inteonHomeEffects.release('qa-queue')");settle(page)
        assert page.evaluate('document.documentElement.dataset.theme===themeNames[2]')

        page.evaluate('setTheme(themeNames[3]);setTheme(themeNames[4]);');settle(page)
        assert page.evaluate('document.documentElement.dataset.theme===themeNames[4]')
        page.evaluate('window.__nativeTransition=document.startViewTransition;document.startViewTransition=undefined;setTheme(themeNames[0]);')
        assert page.evaluate('inteonThemeMorph.active')
        assert not page.evaluate("document.documentElement.classList.contains('is-theme-native')")
        settle(page)
        assert page.evaluate('document.documentElement.dataset.theme===themeNames[0]')
        page.evaluate('void(document.startViewTransition=window.__nativeTransition)')
        assert not errors,errors
        item={'mobile':mobile,'nativeSupported':native_supported,'automaticTransition':True,'restBefore':before,'restAfter':after,'pointerInterruption':True,'latestQueued':True,'supersededNative':True,'fallbackFinished':True,'errors':errors}
        report.append(item);(folder/'report.json').write_text(json.dumps(item,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'case':label,'native':native_supported,'restGlyphChanges':after['glyphChanges']-before['glyphChanges'],'restHeavyDraws':after['heavyClears']-before['heavyClears'],'interruptionAndQueue':'passed','errors':errors}),flush=True)
        context.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
