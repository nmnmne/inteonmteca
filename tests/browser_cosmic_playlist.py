"""Leftward analogue catalog, cosmic background, retained mobile stage and logo menu.

Uses real scroll input and browser animation timing. No chat writes are allowed.
The measurements describe this browser, not delivery FPS over remote desktop.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / 'artifacts' / 'analog-playlist'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8080/'
INIT = r"""(() => {
  const day = new Date();
  localStorage.setItem('inteonmteca-theme-duration', '604800000');
  localStorage.setItem('inteonmteca-theme-duration-day', `${day.getFullYear()}-${day.getMonth()+1}-${day.getDate()}`);
  localStorage.setItem('inteonmteca-debug-enabled', '1');
  sessionStorage.setItem('inteon-storm-last', String(Date.now()));
  window.__cosmicQA = {fieldClears:0, fieldFrames:0, fieldTimes:[], curveFrames:0, edge:0};
  addEventListener('inteon-ambient-change',()=>{__cosmicQA.edge=performance.now();});
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function(...args) {
    if (this.canvas.classList.contains('material-field')) __cosmicQA.fieldClears++;
    return clear.apply(this, args);
  };
  const request = requestAnimationFrame, sources = new WeakMap();
  window.requestAnimationFrame = callback => {
    if (!sources.has(callback)) sources.set(callback, String(new Error().stack));
    const source = sources.get(callback);
    return request(now => {
      const start = performance.now();
      callback(now);
      if (source.includes('energy-field.js')) {
        __cosmicQA.fieldFrames++;
        __cosmicQA.fieldTimes.push(performance.now()-start);
      }
      if (source.includes('playlist-curve.js')) __cosmicQA.curveFrames++;
    });
  };
})();"""

SETUP = r"""() => {
  window.inteonMobileLogo?.stop(); window.inteonLogoStorm?.stop();
  window.inteonLogoAcid?.stop(); window.inteonLogoMaterials?.stop();
  window.inteonAtmosphere?.stop(); window.inteonThemeMorph?.finish();
  if (typeof renderLogoMatrix === 'function') renderLogoMatrix(true);
  if (typeof cancelLogoTimers === 'function') cancelLogoTimers();
  inteonHomeEffects.claim('qa-cosmic');
}"""

SNAP = r"""() => {
  const list=document.querySelector('#track-list'), bounds=list.getBoundingClientRect();
  return {
    viewport:{width:innerWidth,height:innerHeight}, phase:document.documentElement.dataset.ambientPhase,
    scrollTop:list.scrollTop, playlist:bounds.toJSON(), rows:list.children.length,
    visibleRows:[...list.children].map(row=>row.getBoundingClientRect()).filter(r=>r.top>=bounds.top-.5&&r.bottom<=bounds.bottom+.5).length,
    radius:getComputedStyle(list.querySelector('.track-select')).borderRadius,
    logo:document.querySelector('#logo-wrap').getBoundingClientRect().toJSON(),
    chat:document.querySelector('#chat-panel').getBoundingClientRect().toJSON(),
    chatStream:document.querySelector('.chat-stream').getBoundingClientRect().toJSON(),
    bodyWidth:document.body.scrollWidth,
    field:{...document.querySelector('.material-field').dataset},
    letters:window.inteonTextMotion.updates,
    fieldClears:__cosmicQA.fieldClears,fieldFrames:__cosmicQA.fieldFrames,curveFrames:__cosmicQA.curveFrames,
    curve:[...document.querySelectorAll('.playlist-curve')].map(e=>({tag:e.tagName,hidden:e.getAttribute('aria-hidden'),inert:e.inert,
      pointer:getComputedStyle(e).pointerEvents,display:getComputedStyle(e).display,children:e.querySelectorAll('*').length,
      bounds:e.getBoundingClientRect().toJSON(),data:{...e.dataset}})),
    oldAnimations:document.getAnimations().filter(a=>['logo-darkness','logoVectorDissolve'].includes(a.animationName)).map(a=>a.animationName)
  };
}"""


def new_page(browser, width, height, mobile=False):
    context=browser.new_context(viewport={'width':width,'height':height}, device_scale_factor=1,
                                is_mobile=mobile,has_touch=mobile)
    context.add_init_script(INIT)
    def route(r):
        if r.request.method not in ('GET','HEAD','OPTIONS'):
            r.abort()
        elif '/api/chat' in r.request.url:
            r.fulfill(json={'messages':[]})
        else:
            r.continue_()
    context.route('**/*',route)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL,wait_until='domcontentloaded')
    page.wait_for_function('window.inteonGraphicsQuality && window.inteonTextMotion && document.querySelector(".material-field")')
    page.evaluate(SETUP)
    page.wait_for_timeout(400)
    return context,page,errors


def sample_fps(page, duration=1400):
    return page.evaluate(r"""duration => new Promise(resolve => {
      let previous=0,start=0;const intervals=[];
      const frame=now=>{
        if(!start)start=now;
        if(previous)intervals.push(now-previous);
        previous=now;
        if(now-start<duration){requestAnimationFrame(frame);return;}
        const ordered=[...intervals].sort((a,b)=>a-b);
        resolve({fps:intervals.length*1000/(now-start),p95:ordered[Math.floor(ordered.length*.95)],frames:intervals.length});
      };requestAnimationFrame(frame);
    })""",duration)


def desktop(browser):
    context,page,errors=new_page(browser,1440,900)
    try:
        page.evaluate('inteonGraphicsQuality.setManualLevel(5)')
        page.wait_for_function('document.querySelector(".playlist-curve")')
        before=page.evaluate(SNAP)
        assert before['visibleRows']==8,before
        assert not before['oldAnimations'],before
        assert float(before['radius'].split('px')[0])>=10,before['radius']
        assert all(x['hidden']=='true' and x['pointer']=='none' for x in before['curve']),before['curve']
        assert all(x['data']['direction']=='left' and x['bounds']['left']<before['playlist']['left'] for x in before['curve'])
        assert page.locator('.playlist-curve button,.playlist-curve a,.playlist-curve .text-wave-char').count()==0
        page.screenshot(path=str(OUT/'desktop-1440.png'))
        page.mouse.move(1050,350)
        page.mouse.wheel(0,385)
        page.wait_for_timeout(950)
        scrolled=page.evaluate(SNAP)
        assert abs(scrolled['scrollTop']-before['scrollTop'])>100,(before,scrolled)
        assert scrolled['curveFrames']>before['curveFrames']
        assert scrolled['rows']==before['rows']
        assert [x['children'] for x in scrolled['curve']]==[x['children'] for x in before['curve']]
        page.screenshot(path=str(OUT/'desktop-scrolled.png'))
        page.wait_for_timeout(350)
        settled=page.evaluate(SNAP)
        page.wait_for_timeout(650)
        idle=page.evaluate(SNAP)
        assert idle['curveFrames']>settled['curveFrames'],'analogue wind moves while the list stands still'
        for initial,final in zip(settled['curve'],idle['curve']):
            assert 0<int(final['data']['drawCount'])-int(initial['data']['drawCount'])<=26,'wind drawing has a bounded cadence'
            assert final['data']['glyphRevision']!=initial['data']['glyphRevision'],'outside titles keep changing into symbols'
        # A real row still selects the original track and playback advances.
        page.locator('#track-list .track-select').evaluate_all(r"""buttons=>{
          const bounds=document.querySelector('#track-list').getBoundingClientRect();
          const b=buttons.find(e=>{const r=e.getBoundingClientRect();return r.top>=bounds.top+2&&r.bottom<=bounds.bottom-2;});
          b.click();
        }""")
        page.wait_for_function('document.querySelector("#album-player").currentTime>0',timeout=15000)
        audio_before=page.locator('#album-player').evaluate('(e)=>({src:e.currentSrc,time:e.currentTime})')
        # The upper decorative extension must not select a track.
        curve=idle['curve'][0]['bounds']
        page.mouse.click(curve['x']+min(150,curve['width']/2),max(2,curve['y']+curve['height']/2))
        page.wait_for_timeout(300)
        audio_after=page.locator('#album-player').evaluate('(e)=>({src:e.currentSrc,time:e.currentTime})')
        assert audio_after['src']==audio_before['src'] and audio_after['time']>audio_before['time']
        page.locator('#album-player').evaluate('(e)=>e.pause()')
        # Check menu names, plus retained recursion and acid APIs.
        labels=page.locator('.development-effects-menu button').all_text_contents()
        if not labels:
            labels=page.locator('button').all_text_contents()
        assert 'Рекурсия' in labels and 'Растворение' in labels,labels
        assert not any(x in labels for x in ['Тушь вокруг логотипа','Растворение букв','Дыхание логотипа','Кислотное растворение']),labels
        cases=[]
        for level in [1,5,10]:
            page.evaluate('(level)=>inteonGraphicsQuality.setManualLevel(level)',level)
            page.wait_for_function('(level)=>document.documentElement.dataset.ambientPhase==="running" && document.querySelector(".material-field").dataset.graphicsLevel===String(level)',arg=level)
            # Begin each sample early in a running period, so the pause cannot inflate it.
            page.wait_for_function('!inteonHomeEffects.ambientPaused && performance.now()-__cosmicQA.edge<7000',timeout=20000)
            first=page.evaluate(SNAP)
            timing=sample_fps(page)
            last=page.evaluate(SNAP)
            assert last['letters']>first['letters']
            cases.append({'level':level,'before':first,'after':last,'timing':timing})
            page.screenshot(path=str(OUT/f'desktop-level-{level}.png'))
        page.wait_for_function('inteonHomeEffects.ambientPaused && performance.now()-__cosmicQA.edge<2000',timeout=20000)
        frozen=page.evaluate(SNAP)
        page.wait_for_timeout(500)
        frozen_after=page.evaluate(SNAP)
        assert frozen_after['fieldClears']==frozen['fieldClears'],'energy drawing sleeps during freeze'
        assert frozen_after['curveFrames']==frozen['curveFrames'],'analogue wind schedules no RAF during freeze'
        assert [x['data']['drawCount'] for x in frozen_after['curve']]==[x['data']['drawCount'] for x in frozen['curve']]
        assert frozen_after['letters']>frozen['letters'],'letters remain live'
        assert not errors,errors
        return {'before':before,'scrolled':scrolled,'idle':idle,'cases':cases,'frozen':frozen,'frozenAfter':frozen_after,
                'menu':labels,'playback':audio_after,'errors':errors}
    finally:
        context.close()


def mobile(browser,width,height):
    context,page,errors=new_page(browser,width,height,True)
    try:
        snap=page.evaluate(SNAP)
        assert snap['visibleRows']==5,snap
        assert snap['bodyWidth']<=width,snap
        assert snap['chat']['bottom']<=snap['playlist']['top']+1,snap
        assert all(x['display']=='none' for x in snap['curve']),snap
        page.screenshot(path=str(OUT/f'mobile-{width}x{height}.png'))
        assert not errors,errors
        return {'state':snap,'errors':errors}
    finally:
        context.close()


if __name__=='__main__':
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
        report={'desktop':desktop(browser),'mobile':[mobile(browser,*size) for size in [(549,734),(390,844),(320,568)]]}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'desktopFPS':[{ 'level':x['level'],**x['timing']} for x in report['desktop']['cases']],
                          'mobile':[x['state']['viewport'] for x in report['mobile']],'errors':report['desktop']['errors']},ensure_ascii=False))
        browser.close()
