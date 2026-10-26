"""Spatial-only river regression: real desktop/mobile layout and interactions.
Run with --capture before before changing geometry; normal run checks the river.
External writes/network are blocked; screenshots use reduced motion for comparison.
"""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/playlist-river'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--capture', default='after')
parser.add_argument('--motion', action='store_true', help='Also capture the natural running/frozen effect phases')
args = parser.parse_args()
URL = 'http://127.0.0.1:8080/'
baseline = subprocess.check_output(['git','show','HEAD:playlist-curve.js'],cwd=ROOT).decode('utf-8') if args.capture=='before' else None
SNAP = """() => {
 const list=document.getElementById('track-list'), r=list.getBoundingClientRect();
 return {viewport:[innerWidth,innerHeight],list:r.toJSON(),rows:list.children.length,
 visible:[...list.children].filter(e=>{const b=e.getBoundingClientRect();return b.top>=r.top-.5&&b.bottom<=r.bottom+.5}).length,
 overflow:document.documentElement.scrollWidth>innerWidth,
 curve:[...document.querySelectorAll('.playlist-curve')].map(e=>({bounds:e.getBoundingClientRect().toJSON(),
 data:{...e.dataset},display:getComputedStyle(e).display,pointer:getComputedStyle(e).pointerEvents,inert:e.inert})),
 scroll:list.scrollTop,phase:document.documentElement.dataset.ambientPhase};
}"""
report=[]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True,args=['--mute-audio'])
 for w,h in [(2296,1325),(1440,900),(390,844),(844,390)]:
  context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,
   is_mobile=w<801,has_touch=w<801,reduced_motion='reduce')
  # Same catalogue shuffle in both versions; no production state is changed.
  context.add_init_script('Math.random=(()=>{let s=7319;return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296)})();')
  context.route('**/*',lambda r:r.continue_() if urlsplit(r.request.url).netloc=='127.0.0.1:8080' and r.request.method in ('GET','HEAD') else r.abort())
  if baseline:
   context.route('**/playlist-curve.js*',lambda r:r.fulfill(body=baseline,content_type='application/javascript'))
  page=context.new_page(); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(URL,wait_until='domcontentloaded')
  page.wait_for_function('document.querySelectorAll("#track-list .track-select").length>8')
  page.wait_for_timeout(1800)
  state=page.evaluate(SNAP)
  assert not state['overflow'],state
  page.screenshot(path=str(OUT/f'{args.capture}-{w}x{h}.png'))
  if args.motion and w>800 and h>540:
   page.emulate_media(reduced_motion='no-preference')
   page.wait_for_function('!inteonHomeEffects.ambientPaused && !inteonHomeEffects.suspended && !document.body.classList.contains("is-interlude")')
   page.wait_for_timeout(300)
   page.screenshot(path=str(OUT/f'{args.capture}-{w}x{h}-running.png'))
   page.wait_for_function('inteonHomeEffects.ambientPaused && !inteonHomeEffects.suspended',timeout=20000)
   page.wait_for_timeout(150)
   frozen=page.evaluate(SNAP)
   page.wait_for_timeout(350)
   still=page.evaluate(SNAP)
   assert [c['data']['drawCount'] for c in frozen['curve']]==[c['data']['drawCount'] for c in still['curve']]
   page.screenshot(path=str(OUT/f'{args.capture}-{w}x{h}-frozen.png'))
   state['naturalFreezeVerified']=True
   page.emulate_media(reduced_motion='reduce')
  if args.capture!='before':
   if w>800 and h>540:
    assert len(state['curve'])==2,state
    assert all(c['data']['trajectory']=='river' and c['pointer']=='none' and c['inert'] for c in state['curve']),state
    top,bottom=state['curve']
    assert top['bounds']['top']<=.5,state
    assert bottom['bounds']['bottom']>=h,state
    assert state['visible']==8,state
   else:
    assert not state['curve'] or all(c['display']=='none' for c in state['curve']),state
   # Native scrolling and the same real row buttons remain available.
   listbox=page.locator('#track-list')
   listbox.evaluate('(e)=>e.scrollTop+=e.clientHeight/2')
   page.wait_for_timeout(250)
   after=page.evaluate(SNAP)
   assert after['scroll']>state['scroll'],(state,after)
   assert after['rows']==state['rows']
   button=page.locator('#track-list .track-select').evaluate_all("""buttons=>{
    const list=document.querySelector('#track-list'),r=list.getBoundingClientRect();
    return buttons.findIndex(e=>{const b=e.getBoundingClientRect();return b.top>=r.top+1&&b.bottom<=r.bottom-1;});
   }""")
   assert button>=0
   page.locator('#track-list .track-select').nth(button).click()
   page.wait_for_function('document.querySelector("#album-player").currentTime>0',timeout=15000)
   audio=page.locator('#album-player').evaluate('(e)=>({src:e.currentSrc,time:e.currentTime})')
   assert audio['src'] and audio['time']>0,audio
   page.locator('#album-player').evaluate('(e)=>e.pause()')
   state['playback']=audio
  assert not errors,errors
  state['errors']=errors
  report.append(state)
  context.close()
 browser.close()
(OUT/f'{args.capture}-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
