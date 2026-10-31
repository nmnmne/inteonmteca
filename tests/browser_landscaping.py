"""Local desktop/mobile rendering and authored lawn clearance checks."""
import base64
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from shapely.geometry import Polygon, LineString, Point
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8080')
parser.add_argument('--label', default='local')
args = parser.parse_args()
sys.path.insert(0, str(ROOT / 'tools'))
from build_landscaping import road_polygon

layout = json.loads((ROOT/'yard/data/site-layout.json').read_text(encoding='utf-8'))
data = layout['landscaping']
lawns = [Polygon(p['polygon'],p['holes']) for p in data['patches']]
expected_entries = {e['id'] for e in layout['entrances'] if e['buildingId'] in ('house-14','house-46-1','house-46-2','house-26','house-36','house-46-a','house-46-b')}
# A door already facing continuous asphalt needs no separate lawn path.
import math
for entry in layout['entrances']:
    if entry['id'] not in expected_entries: continue
    building = next(b for b in layout['buildings'] if b['id']==entry['buildingId'])
    ring = building['footprint']; edge = entry['edgeIndex']
    a,b = ring[edge],ring[(edge+1)%len(ring)]
    dx,dz = b[0]-a[0],b[1]-a[1]; length=math.hypot(dx,dz)
    x,z=a[0]+dx/length*entry['alongM'],a[1]+dz/length*entry['alongM']
    nx,nz=-dz/length,dx/length
    if Polygon(ring).contains(Point(x+nx,z+nz)): nx,nz=-nx,-nz
    access=LineString([(x+nx*.85,z+nz*.85),(x+nx*3,z+nz*3)]).buffer(.65,cap_style=2)
    assert all(access.intersection(lawn).area < .001 for lawn in lawns), entry['id']
for lawn in lawns:
    assert lawn.is_valid
    for building in layout['buildings']:
        assert lawn.intersection(Polygon(building['footprint'])).area < .001
    for road in layout['roads']:
        if road.get('render',True):
            assert lawn.intersection(road_polygon(road)).area < .001
    for path in data['paths']:
        assert lawn.intersection(Polygon(path['polygon'],path['holes'])).area < .001
out = ROOT/'tests/artifacts/landscaping'/args.label
out.mkdir(parents=True,exist_ok=True)
report = []
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    for mobile in [False,True]:
        page=browser.new_page(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script("localStorage.setItem('inteon.yard.lighting.next.v1','0')")
        page.goto(args.base_url.rstrip('/')+'/yard/',wait_until='domcontentloaded')
        page.wait_for_function('window.__yard?.scene.getObjectByName("lawn-curbs") && __yard.scene.userData.bakedLightingStatus === "ready"')
        page.evaluate('yardWalkClock.enteredAt=Date.now()+1000000; inteonStreet.boundaryPlaybackSucceeded()')
        page.evaluate('Object.assign(__yard.body,{x:-32,z:117,yaw:-.65,pitch:-.18})')
        page.wait_for_timeout(500)
        page.screenshot(path=str(out/('mobile.png' if mobile else 'ground.png')))
        state=page.evaluate('''() => ({curbs:__yard.scene.getObjectByName('lawn-curbs').count,
            programs:__yard.renderer.info.programs.every(p=>p.diagnostics?.runnable !== false)})''')
        assert not errors and state['programs'], errors
        if not mobile:
            page.evaluate('Object.assign(__yard.body,{x:50,z:-18,yaw:2.6,pitch:-.12})')
            page.wait_for_timeout(200)
            page.screenshot(path=str(out/'house-46-curbs.png'))
            png=page.evaluate('''async () => {
                const T=await import('./vendor/three.module.js');
                const y=__yard, camera=new T.OrthographicCamera(-130,130,145,-145,.1,600);
                camera.position.set(15,320,15); camera.up.set(0,0,-1);camera.lookAt(15,0,15);
                const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
                renderer.setSize(1300,1450);renderer.outputColorSpace=T.SRGBColorSpace;
                const fog=y.scene.fog;y.scene.fog=null;
                renderer.render(y.scene,camera);const png=renderer.domElement.toDataURL();
                y.scene.fog=fog;renderer.dispose();return png.split(',')[1];
            }''')
            (out/'overhead.png').write_bytes(base64.b64decode(png))
        assert not errors, errors
        assert page.evaluate('__yard.layout.landscaping.patches.length') == len(data['patches'])
        report.append({'mobile':mobile,'errors':errors,**state})
        page.close()
    browser.close()
(out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
