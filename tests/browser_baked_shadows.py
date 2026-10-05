"""Real browser: all presets, single resident texture, no runtime depth passes."""
import functools,json,threading,os
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*_): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError,ConnectionAbortedError,BrokenPipeError): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
mobile=os.environ.get('YARD_MOBILE')=='1'
output=ROOT/('tests/artifacts/baked-shadows-mobile' if mobile else 'tests/artifacts/baked-shadows');output.mkdir(parents=True,exist_ok=True)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':390,'height':844} if mobile else {'width':1280,'height':800},has_touch=mobile,is_mobile=mobile)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
        url=f'http://127.0.0.1:{server.server_port}/yard/'
        rows=[]
        for visit in range(13):
            print('visit',visit,flush=True)
            if visit:
                page.evaluate('window.inteonStreet?.endVisit()')
            page.goto(url)
            try:
                page.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus === "ready"',timeout=60000)
            except Exception:
                print('FAILED',page.url,errors,page.locator('body').inner_text(),flush=True)
                raise
            page.wait_for_timeout(200)
            row=page.evaluate('''() => {
              const {scene,renderer,lighting}=__yard, b=scene.userData.bakedLighting;
              return {index:lighting.presetIndex,moment:lighting.localMoment,receivers:b.receivers,
                residentSets:b.residentSets,gpuBytes:b.gpuBytes,version:b.texture.version,
                shadowMap:renderer.shadowMap.enabled,renderTarget:renderer.getRenderTarget(),
                resources:performance.getEntriesByType('resource').filter(x=>/sun-\\d+\\.png/.test(x.name)).map(x=>({name:x.name,bytes:x.transferSize,duration:x.duration})),
                programs:renderer.info.programs.map(p=>p.diagnostics?.runnable ?? true)};
            }''')
            assert row['index']==visit%12,row
            assert row['residentSets']==1 and len(row['resources'])==1,row
            assert not row['shadowMap'] and row['renderTarget'] is None,row
            assert row['receivers']>=163,row
            assert all(row['programs']),row
            page.wait_for_timeout(100)
            assert page.evaluate('__yard.scene.userData.bakedLighting.texture.version')==row['version']
            if visit in (0,5,11):
                audit=page.evaluate("async()=> (await import('../tests/audit_baked_depth.js')).audit(__yard)")
                row['occlusionAudit']=audit
                assert audit['samples']>100 and audit['matches']/audit['samples']>.94,audit
                for i,view in enumerate(audit['views'][:2]):
                    page.evaluate('p=>Object.assign(__yard.body,p)',view)
                    page.wait_for_timeout(300)
                    page.screenshot(path=str(output/f'{visit:02}-wall-{i}.png'))
                for view in ('spawn','photoView','playground'):
                    page.evaluate('''view=> {const {body,layout}=__yard; const p=view==='playground'?layout.playground.view:layout[view]; if(p) Object.assign(body,p); }''',view)
                    page.wait_for_timeout(300)
                    page.screenshot(path=str(output/f'{visit:02}-{view}.png'))
            rows.append(row)
        failed=browser.new_page()
        failed.route('**/data/shadows/sun-*.png',lambda route:route.abort())
        failed.goto(url)
        failed.wait_for_function('window.__yard?.scene.userData.bakedLightingStatus === "unavailable"')
        assert failed.evaluate('__yard.renderer.info.render.frame>0 && !__yard.renderer.shadowMap.enabled'), 'Missing baked assets must retain the lit scene, not enable live shadows'
        failed.close()
        assert not errors,errors
        (output/'report.json').write_text(json.dumps({'visits':rows,'errors':errors},indent=2))
        print(json.dumps({'visits':len(rows),'receivers':rows[0]['receivers'],'gpuBytes':rows[0]['gpuBytes'],'errors':errors}))
        browser.close()
finally:
    server.shutdown();server.server_close()
