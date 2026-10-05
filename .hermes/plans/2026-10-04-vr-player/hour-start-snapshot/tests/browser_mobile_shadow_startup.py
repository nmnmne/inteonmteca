"""Cold coarse-pointer startup, shaders and changed-pose submissions in Edge."""
import functools,json,threading,time
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    delay=0
    def log_message(self,*_): pass
    def do_GET(self):
        if "/shadows/" in self.path and self.path.endswith(".png"): time.sleep(self.delay)
        try: super().do_GET()
        except (ConnectionAbortedError,ConnectionResetError,BrokenPipeError): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
out=ROOT/'tests/artifacts/mobile-shadow-startup';out.mkdir(parents=True,exist_ok=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type in ('error','warning') else None)
  start=time.monotonic();page.goto(f'http://127.0.0.1:{server.server_port}/yard/',wait_until='domcontentloaded')
  try: page.wait_for_function('window.__yard && __yard.renderer.info.render.frame > 0',timeout=90000)
  except Exception:
   print(json.dumps({'timeout':True,'elapsed':time.monotonic()-start,'errors':errors,'text':page.locator('body').inner_text()}),flush=True);raise
  elapsed=time.monotonic()-start
  page.wait_for_function('__yard.scene.userData.bakedLightingStatus === "ready"',timeout=15000)
  page.wait_for_timeout(300)
  page.screenshot(path=str(out/'spawn.png'))
  row=page.evaluate('''() => ({coarse:matchMedia('(pointer:coarse)').matches,frame:__yard.renderer.info.render.frame,baked: __yard.scene.userData.bakedLighting && {bytes:__yard.scene.userData.bakedLighting.gpuBytes},programs:__yard.renderer.info.programs.map(p=>p.diagnostics?.runnable ?? true),resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/shadows/')).map(x=>({url:x.name,duration:x.duration,bytes:x.transferSize}))})''')
  page.evaluate('__yard.body.pitch=-0.85');page.wait_for_timeout(700);page.screenshot(path=str(out/'down.png'))
  before=page.evaluate('__yard.renderer.info.render.frame');page.wait_for_timeout(500)
  row['idleFrames']=page.evaluate('__yard.renderer.info.render.frame')-before
  page.evaluate('__yard.body.yaw+=0.5;__yard.body.x+=2');page.wait_for_timeout(700)
  row['movementFrames']=page.evaluate('__yard.renderer.info.render.frame')-before
  page.screenshot(path=str(out/'moved.png'))
  row['audit']=page.evaluate("async()=> (await import('../tests/audit_baked_depth.js')).audit(__yard)")
  assert row['audit']['matches']/row['audit']['samples']>.94
  page.evaluate('Object.assign(__yard.body,__yard.layout.photoView)');page.wait_for_timeout(500)
  page.screenshot(path=str(out/'photo.png'))
  page.keyboard.down('w');page.wait_for_timeout(600)
  walkStart=page.evaluate('({x:__yard.body.x,z:__yard.body.z,frame:__yard.renderer.info.render.frame})')
  page.wait_for_timeout(600);page.keyboard.up('w')
  walkEnd=page.evaluate('({x:__yard.body.x,z:__yard.body.z,frame:__yard.renderer.info.render.frame})')
  row['walking']={'start':walkStart,'end':walkEnd}
  assert walkEnd['frame']>walkStart['frame']+2 and (walkEnd['x'],walkEnd['z'])!=(walkStart['x'],walkStart['z'])
  row.update(startupSeconds=elapsed,errors=errors)
  (out/'report.json').write_text(json.dumps(row,indent=2));print(json.dumps(row),flush=True)
  assert row['coarse'] and row['movementFrames']>0 and all(row['programs'])
  assert not [e for e in errors if 'Shader Error' in e or 'X3595' in e], errors
  assert row['baked']['bytes'] <= 4*1024*1024, row
  delayed=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  Quiet.delay=6
  delayStart=time.monotonic()
  delayed.goto(f'http://127.0.0.1:{server.server_port}/yard/',wait_until='domcontentloaded')
  delayed.wait_for_function('window.__yard && __yard.renderer.info.render.frame>0',timeout=4000)
  row["delayedFirstFrameSeconds"]=time.monotonic()-delayStart
  print("delayed-first-frame",row["delayedFirstFrameSeconds"],flush=True)
  assert delayed.evaluate('__yard.scene.userData.bakedLightingStatus')=="loading"
  delayed.wait_for_function('__yard.scene.userData.bakedLightingStatus=== "ready"',timeout=15000)
  delayed.close()
  Quiet.delay=18
  timed=browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
  timeoutStart=time.monotonic()
  timed.goto(f'http://127.0.0.1:{server.server_port}/yard/',wait_until='domcontentloaded')
  timed.wait_for_function('window.__yard && __yard.renderer.info.render.frame>0',timeout=4000)
  # Extend this isolated test visit so the normal short walk return cannot mask the network timeout.
  timed.evaluate('window.inteonStreet.boundaryPlaybackSucceeded()')
  timed.wait_for_function('__yard.scene.userData.bakedLightingStatus=== "unavailable"',timeout=20000)
  row["assetTimeoutSeconds"]=time.monotonic()-timeoutStart
  row["assetTimeoutError"]=timed.evaluate('__yard.scene.userData.bakedLightingError')
  print("asset-timeout",row["assetTimeoutSeconds"],row["assetTimeoutError"],flush=True)
  (out/'report.json').write_text(json.dumps(row,indent=2))
  assert timed.evaluate('!document.querySelector("#yard-view").hidden && !__yard.renderer.shadowMap.enabled')
  timed.close()
  browser.close()
finally: server.shutdown();server.server_close()
