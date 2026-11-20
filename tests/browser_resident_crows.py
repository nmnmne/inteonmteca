"""Follow two reciprocal visits in the actual homepage scene and check their rendered silhouettes."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def observe_simulation(route):
    url = route.request.url
    if "qa-visit-original" in url:
        route.continue_()
        return
    original = url + ("&" if "?" in url else "?") + "qa-visit-original"
    # Only seed the two simulation clocks. Both actors and the camera follow the
    # site's normal fixed-step movement, without moving them into a test pose.
    seed = """let n=3; const random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);"""
    if "auto-walk.js" in url:
        body = f"""
          import {{createAutoWalk as create}} from '{original}'; export * from '{original}';
          export function createAutoWalk(layout, options) {{
            {seed}
            const walk=create(layout,{{...options,random}});
            window.visitQA={{walk,flock:options.flock,frames:0}};
            return {{...walk,update:()=>walk.update(0)}};
          }}
        """
    else:
        body = f"""
          import {{createCrowFlock as create}} from '{original}'; export * from '{original}';
          export function createCrowFlock(layout, opening, options) {{
            {seed}
            return create(layout,opening,{{...options,random}});
          }}
        """
    route.fulfill(content_type="text/javascript", body=body)


OBSERVE = """async () => {
  const T = await import('/yard/vendor/three.module.js');
  const qa = window.visitQA, after = T.Scene.prototype.onAfterRender;
  T.Scene.prototype.onAfterRender = function(renderer,scene,camera,...rest) {
    after.call(this,renderer,scene,camera,...rest);
    if (!renderer.domElement.closest('[data-yard-layer]')) return;
    const model=scene.getObjectByName('courtyard-resident'), plumage=scene.getObjectByName('crow-plumage');
    if (!model || !plumage) return;
    qa.frame={renderer,scene,camera,model,plumage};
    qa.frames++;
  };
  let entry=null, seated=0;
  qa.seek = (kind) => {
    const {flock,walk}=qa;
    for (let i=0;i<1800;i++) {
      walk.update(.1);
      const v=flock.visit;
      if (v.phase==='idle') {entry=null; seated=0; if (kind==='idle') return true; continue;}
      if (!entry || entry.kind!==v.kind) {
        entry={kind:v.kind,x:v.x,z:v.z,birds:flock.birds.map(b=>({x:b.x,z:b.z}))};
        seated=0;
      }
      if (v.phase!=='sitting' || !v.birds.length) {seated=0;continue;}
      seated+=.1;
      if (v.kind!==kind || seated<2.5) continue;
      return {kind:v.kind, seated, residentTravel:Math.hypot(entry.x-v.x,entry.z-v.z),
        ids:flock.birds.map(b=>b.id), neighbours:v.birds.map(id=>{
          const b=flock.birds[id], from=entry.birds[id];
          return {id, height:b.y, speed:b.speed, distance:Math.hypot(v.x-b.x,v.z-b.z),
                  travel:Math.hypot(b.x-from.x,b.z-from.z)};
        })};
    }
    return null;
  };
  qa.silhouettes = () => {
    const {renderer,scene,camera,model,plumage}=qa.frame, visit=qa.flock.visit;
    const width=Math.min(renderer.domElement.width,680), height=Math.round(width/camera.aspect);
    const target=new T.WebGLRenderTarget(width,height);
    const keep=renderer.getRenderTarget(), originalVisible=model.visible;
    const empty=new T.Matrix4().makeScale(0,0,0), transforms=visit.birds.map(id=>{
      const m=new T.Matrix4();plumage.getMatrixAt(id-1,m);return [id-1,m];
    });
    function pixels(showResident,showNeighbours) {
      model.visible=showResident;
      for(const [i,m] of transforms) plumage.setMatrixAt(i,showNeighbours?m:empty);
      plumage.instanceMatrix.needsUpdate=true;
      renderer.render(scene,camera);
      const data=new Uint8Array(width*height*4);
      renderer.readRenderTargetPixels(target,0,0,width,height,data);
      return data;
    }
    const overlay=document.querySelector('.room-resident');
    // The yard freezes static mesh matrices as its distant houses finish loading.
    // A frozen body would leave half the resident underground, despite its pose.
    const body=model.getObjectByName('resident-body');
    const lifted=new T.Vector3().setFromMatrixPosition(body.matrixWorld).y-visit.y;
    const rendered=originalVisible && overlay.hasAttribute('data-in-courtyard')
      && !overlay.checkVisibility({opacityProperty:true,visibilityProperty:true});
    const bottom=document.querySelector('.compact-display').getBoundingClientRect().top/innerHeight;
    const oldNow=Object.getOwnPropertyDescriptor(performance,'now'), fixed=performance.now();
    try {
      Object.defineProperty(performance,'now',{configurable:true,value:()=>fixed});
      renderer.setRenderTarget(target);
      const together=pixels(true,true), withoutResident=pixels(false,true),
            withoutNeighbours=pixels(true,false), again=pixels(true,true);
      function changed(bare) {
        let count=0;
        for(let y=Math.ceil(height*(1-bottom));y<height;y++) for(let x=0;x<width;x++) {
          const i=4*(y*width+x);
          for(let c=0;c<3;c++) if(Math.abs(together[i+c]-again[i+c])<2 && Math.abs(together[i+c]-bare[i+c])>8) {
            count++;break;
          }
        }
        return count;
      }
      return {rendered, lifted, residents:document.querySelectorAll('.room-resident').length,
              residentPixels:changed(withoutResident), neighbourPixels:changed(withoutNeighbours)};
    } finally {
      if(oldNow) Object.defineProperty(performance,'now',oldNow);else delete performance.now;
      model.visible=originalVisible;
      for(const [i,m] of transforms) plumage.setMatrixAt(i,m);
      plumage.instanceMatrix.needsUpdate=true;
      renderer.setRenderTarget(keep); target.dispose();
    }
  };
}"""


def seek(page, kind):
    for _ in range(9):
        result = page.evaluate("kind=>visitQA.seek(kind)", kind)
        if result:
            return result
    raise AssertionError(f"No {kind} encounter in 27 simulated minutes")


def check(browser, mobile):
    device = "phone" if mobile else "desktop"
    page = browser.new_page(viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                            is_mobile=mobile, has_touch=mobile)
    page.route("**/yard/auto-walk.js*", observe_simulation)
    page.route("**/yard/crow-flock.js*", observe_simulation)
    page.add_init_script("Date.now=()=>Date.parse('2026-06-21T00:08:00Z')+performance.now()")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=75000)
    page.evaluate(OBSERVE)
    page.wait_for_function("visitQA.frame && visitQA.frame.scene.userData.detailLoading.status==='ready'", timeout=60000)
    overlay = page.locator(".room-resident")
    assert overlay.is_visible() and not page.evaluate("visitQA.frame.model.visible")
    for kind in ("resident", "crows"):
        meeting = seek(page, kind)
        assert meeting["ids"] == list(range(13)) and meeting["neighbours"], meeting
        assert all(b["id"] > 0 and b["height"] < .4 and b["speed"] < .5 and b["distance"] < 2
                   for b in meeting["neighbours"]), meeting
        if kind == "resident":
            assert meeting["residentTravel"] > .5, meeting
        else:
            assert max(b["travel"] for b in meeting["neighbours"]) > .6, meeting
        frames = page.evaluate("visitQA.frames")
        # Seeking jumps straight to a seated flock. Let the visible body finish
        # moving from the previous layer before checking its seated silhouette.
        page.wait_for_function("""n=>{
          const {model}=visitQA.frame, seat=visitQA.flock.visit;
          return visitQA.frames>=n+6 && document.querySelector('.room-resident[data-in-courtyard]')
            && Math.hypot(model.position.x-seat.x,model.position.y-seat.y,model.position.z-seat.z)<.01
            && model.scale.y>.99;
        }""", arg=frames)
        report = page.evaluate("visitQA.silhouettes()")
        assert report["rendered"] and report["residents"] == 1 and report["lifted"] > .15, report
        assert min(report["residentPixels"], report["neighbourPixels"]) >= 8, (device, kind, report, meeting)
        if folder := os.environ.get("INTEON_VISIT_SHOTS"):
            path = Path(folder)
            path.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=path / f"{device}-{kind}.jpg", type="jpeg", quality=92)
        print(device, kind, meeting["neighbours"], report, flush=True)
        if kind == "crows" and mobile:
            page.emulate_media(reduced_motion="reduce")
            page.wait_for_selector('body[data-yard-backdrop="still"]')
        else:
            seek(page, "idle")
            page.wait_for_function("!visitQA.frame.model.visible")
        page.wait_for_function("""() => {const el=document.querySelector('.room-resident');
          return !el.hasAttribute('data-in-courtyard') && el.checkVisibility({opacityProperty:true,visibilityProperty:true});}""")
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"])
        check(browser, mobile=False)
        check(browser, mobile=True)
        browser.close()
