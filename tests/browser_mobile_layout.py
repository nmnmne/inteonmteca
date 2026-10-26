"""Cold-load and live responsive geometry regression, using production CSS."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/mobile-layout-regression'
OUT.mkdir(parents=True, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def copyfile(self, source, outputfile):
        try: super().copyfile(source, outputfile)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError): pass

MEASURE = """() => {
 const shell=document.querySelector('.playlist-shell');
 const bounds=shell.getBoundingClientRect();
 const rows=[...document.querySelectorAll('.track-item')];
 const row=rows.find(e=>{const r=e.getBoundingClientRect();return r.top>=bounds.top-.5 && r.bottom<=bounds.bottom+.5}) || rows[0];
 const button=row.querySelector('.track-select'), meta=row.querySelector('.track-meta');
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
 const s=getComputedStyle(shell), b=getComputedStyle(button);
 return {viewport:[innerWidth,innerHeight],slots:Number(s.getPropertyValue('--catalog-slots')),tile:parseFloat(s.getPropertyValue('--tile-height')),
 shell:box(shell),row:box(row),button:box(button),meta:box(meta),padding:parseFloat(b.paddingTop)+parseFloat(b.paddingBottom)+parseFloat(b.borderTopWidth)+parseFloat(b.borderBottomWidth),
 toggle:box(document.querySelector('#mobile-chat-toggle')),expanded:document.querySelector('#mobile-chat-toggle').getAttribute('aria-expanded'),
 overflow:document.documentElement.scrollWidth>innerWidth,inlineSlots:shell.style.getPropertyValue('--catalog-slots')};
}"""
def check(page, label):
    page.wait_for_timeout(350)
    m=page.evaluate(MEASURE)
    results.append(dict(label=label, **m))
    print(json.dumps(results[-1]), flush=True)
    page.screenshot(path=str(OUT / f'{label}.png'))
    assert not m['overflow'], label
    if abs(m['tile']-int(m['shell']['height'])/m['slots'])>=.15:
        failures.append(('stale fit or non-mobile bottom space',label,m['tile'],m['shell']['height'],m['slots']))
    assert m['button']['height']+.2>=m['meta']['height']+m['padding'], ('clipped typography',label,m)
    assert m['meta']['y']>=m['button']['y']-.2 and m['meta']['bottom']<=m['button']['bottom']+.2, ('text containment',label,m)
    assert m['toggle']['height']>=44, ('toggle touch target',label,m)
    return m

results=[]
failures=[]
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        for width,height in [(320,568),(390,844),(768,1024),(844,390)]:
            context=browser.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=True)
            page=context.new_page()
            page.add_init_script("window.chatChanges=[]; window.addEventListener('inteon-mobile-chat-change',e=>chatChanges.push(e.detail.collapsed))")
            page.route('https://**/*',lambda r:r.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
            page.wait_for_selector('.track-select')
            page.evaluate("document.querySelector('.playback-status').textContent='Медленное соединение — загрузка аудио'")
            page.wait_for_timeout(50)
            assert page.evaluate("""() => {
              const status=document.querySelector('.playback-status').getBoundingClientRect();
              return [...document.querySelectorAll('.transport-time,.volume-control,.transport-play,.transport-skip')].every(e=>{
                const r=e.getBoundingClientRect(); return status.bottom<=r.top || status.top>=r.bottom || status.right<=r.left || status.left>=r.right;
              });
            }"""), 'playback status overlaps controls'
            collapsed=check(page,f'{width}-cold')
            toggle=page.locator('#mobile-chat-toggle')
            toggle.focus(); page.keyboard.press('Enter')
            opened=check(page,f'{width}-open')
            assert opened['expanded']=='true'
            toggle.focus(); page.keyboard.press('Space')
            closed=check(page,f'{width}-closed')
            assert closed['expanded']=='false'
            assert closed['slots']>=opened['slots']
            assert page.evaluate('chatChanges')==[True,False,True]
            page.evaluate("window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize'))")
            page.wait_for_timeout(100)
            assert page.evaluate('chatChanges')==[True,False,True], 'unchanged resize emitted chat change'
            page.evaluate("""() => {const shell=document.querySelector('.playlist-shell');
              shell.style.setProperty('--catalog-slots','3'); shell.dispatchEvent(new Event('inteon-catalog-refit'));
            }""")
            check(page,f'{width}-slot-only')
            page.evaluate("window.dispatchEvent(new Event('resize'))")
            page.wait_for_timeout(100)
            if width==320:
                # A synthetic visualViewport resize reaches the real keyboard branch;
                # native OS keyboard presentation is outside desktop emulation.
                page.evaluate("Object.defineProperty(visualViewport,'height',{configurable:true,value:280}); visualViewport.dispatchEvent(new Event('resize'))")
                check(page,'320-keyboard')
                assert page.evaluate("document.documentElement.classList.contains('mobile-keyboard-scroll')")
                page.evaluate("delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))")
            page.set_viewport_size({'width':1440,'height':900}); page.wait_for_timeout(350)
            assert page.evaluate("document.querySelector('.playlist-shell').style.getPropertyValue('--catalog-slots')")=='', 'mobile slots leaked into desktop'
            page.set_viewport_size({'width':width,'height':height})
            check(page,f'{width}-return')
            page.reload(wait_until='domcontentloaded'); page.wait_for_selector('.track-select')
            assert check(page,f'{width}-reload')['expanded']=='false'
            context.close()
        browser.close()
    assert not failures, failures
finally:
    (OUT/'measurements.json').write_text(json.dumps(results,indent=2))
    server.shutdown(); server.server_close()
