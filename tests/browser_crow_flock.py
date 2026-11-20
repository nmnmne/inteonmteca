"""Exercise the live courtyard's flock through the ordinary homepage and WebGL camera."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def observe_walk(route):
    url = route.request.url
    if "qa-flock-source" in url:
        route.continue_()
        return
    source = url + ("&" if "?" in url else "?") + "qa-flock-source"
    # Only the clock is controlled. Advance the same walker and flock used by
    # the real page, including its physical recruitment and landing checks.
    route.fulfill(content_type="text/javascript", body=f"""
        import {{createAutoWalk as create}} from '{source}';
        export * from '{source}';
        export function createAutoWalk(layout, options) {{
          const walk=create(layout, options);
          const qa=window.crowQA={{walk, flock:options.flock, hold:true, frames:0}};
          return {{...walk, update:dt=>walk.update(qa.hold ? 0 : dt)}};
        }}
    """)


OBSERVE = """async () => {
  const T = await import('/yard/vendor/three.module.js');
  const qa = window.crowQA;
  const previous = T.Scene.prototype.onAfterRender;
  T.Scene.prototype.onAfterRender = function(renderer, scene, camera, ...args) {
    previous.call(this, renderer, scene, camera, ...args);
    const group = scene.getObjectByName('crow-flock');
    if (!group || !renderer.domElement.closest('[data-yard-layer]')) return;
    qa.frame = {renderer, scene, camera, group, plumage:group.getObjectByName('crow-plumage')};
    qa.frames++;
  };
  qa.measure = () => {
    const {renderer, scene, camera, plumage} = qa.frame;
    const width = Math.min(720, renderer.domElement.width);
    const height = Math.round(width / camera.aspect);
    const target = new T.WebGLRenderTarget(width, height);
    const previousTarget = renderer.getRenderTarget(), previousVisible = plumage.visible;
    const time = performance.now(), clock = Object.getOwnPropertyDescriptor(performance, 'now');
    function pixels(show) {
      plumage.visible = show;
      renderer.render(scene, camera);
      const rgba = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba);
      return rgba;
    }
    try {
      Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
      renderer.setRenderTarget(target);
      const bare = pixels(false), birds = pixels(true), again = pixels(false);
      const top = document.querySelector('.compact-titlebar').getBoundingClientRect().bottom / innerHeight;
      const bottom = document.querySelector('.compact-display').getBoundingClientRect().top / innerHeight;
      let ink = 0;
      for (let y=Math.ceil((1-bottom)*height); y<(1-top)*height; y++) {
        for (let x=0; x<width; x++) {
          const i=(y*width+x)*4;
          for (let c=0; c<3; c++) {
            const j=i+c;
            if (Math.abs(bare[j]-again[j])<3 && Math.abs(birds[j]-bare[j])>9) { ink++; break; }
          }
        }
      }
      const members=qa.flock.birds, matrix=new T.Matrix4(), at=new T.Vector3();
      const positionsMatch=members.slice(1).every((bird,i)=>{
        plumage.getMatrixAt(i,matrix); at.setFromMatrixPosition(matrix);
        return Math.hypot(at.x-bird.x,at.z-bird.z)<.01;
      });
      return {ink, width, height, ids:members.map(b=>b.id), instances:plumage.count, positionsMatch,
              pov:Math.hypot(camera.position.x-members[0].x,camera.position.z-members[0].z),
              virtual:scene.userData.virtuality, camera:[camera.position.x,camera.position.z]};
    } finally {
      if (clock) Object.defineProperty(performance,'now',clock); else delete performance.now;
      plumage.visible=previousVisible; renderer.setRenderTarget(previousTarget); target.dispose();
    }
  };
  qa.trace = {solo:false, joined:false, phases:[], landings:[], missions:[]};
  qa.advance = (wantFlight, seconds, skip = 0) => {
    const {birds,state} = qa.flock, trace=qa.trace;
    const camera = qa.frame.camera.clone(), point = new T.Vector3();
    let lastPhase = state.phase, lastMission = state.missionCount, lastLanding = state.landingCount;
    for (let t=0; t<seconds; t+=.1) {
      const pose=qa.walk.update(.1);
      if (state.phase!==lastPhase) {
        trace.phases.push(state.phase); lastPhase=state.phase;
      }
      if (state.phase==='gather') {
        if (state.partySize===1) trace.solo=true;
        else trace.joined=true;
      }
      if (state.landingCount!==lastLanding) {
        trace.landings.push({n:state.landingCount, seniors:birds.filter(b=>b.senior).map(b=>b.id)});
        lastLanding=state.landingCount;
      }
      if (state.missionCount!==lastMission) {
        trace.missions.push({target:state.targetSize, members:birds.filter(b=>b.inParty).map(b=>b.id)});
        lastMission=state.missionCount;
      }
      if (!wantFlight && trace.landings.length>=2 && trace.missions.length) return true;
      if (!wantFlight || t<skip || state.phase!=='mission' || pose.y<2) continue;
      camera.position.set(pose.x,pose.y,pose.z);
      camera.rotation.set(pose.pitch,-pose.yaw,pose.roll,'YXZ');
      camera.fov=pose.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const framed=birds.filter(b=>{
        if (!b.inParty || b.id===0) return false;
        point.set(b.x,b.y,b.z).project(camera);
        return Math.abs(point.x)<.94 && Math.abs(point.y)<.7 && Math.abs(point.z)<1;
      });
      if (framed.length>=2) return true;
    }
    return false;
  };
}"""


def check(browser, mobile):
    device = "phone" if mobile else "desktop"
    context = browser.new_context(viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                                  is_mobile=mobile, has_touch=mobile)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.route("**/yard/auto-walk.js*", observe_walk)
    epoch = "2026-06-21T00:08:00Z" if not mobile else "2026-11-20T00:21:00Z"
    page.add_init_script(f"Date.now = () => Date.parse('{epoch}') + performance.now()")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=75000)
    page.evaluate(OBSERVE)
    page.wait_for_function("window.crowQA?.frame?.plumage", timeout=40000)
    first = page.evaluate("crowQA.measure()")
    assert first["ids"] == list(range(13)) and first["instances"] == 12, first
    assert first["pov"] < .001 and first["positionsMatch"], first
    assert first["ink"] >= 8, first

    def shot(name):
        if folder := os.environ.get("INTEON_FLOCK_SHOTS"):
            path = Path(folder)
            path.mkdir(parents=True, exist_ok=True)
            if name == "opening":
                page.wait_for_function("crowQA.frame.scene.userData.detailLoading.status==='ready'", timeout=60000)
            page.screenshot(path=path / f"{device}-{name}.jpg", type="jpeg", quality=90)

    shot("opening")
    page.evaluate("crowQA.hold=false")
    page.wait_for_function("p => Math.hypot(crowQA.walk.pose.x-p[0],crowQA.walk.pose.z-p[1])>.15", arg=first["camera"])
    page.evaluate("crowQA.hold=true")
    # Playback is the only pointer gesture. Flocking and camera movement are autonomous.
    page.locator(".compact-play").click()
    page.wait_for_function("DJEngine.snapshot().A.playing && DJEngine.snapshot().A.time>.2")
    before = page.evaluate("DJEngine.snapshot().A.time")
    page.evaluate("window.inteonGraphicsQuality.setManualLevel(" + ("1" if mobile else "8") + ")")
    best = 0
    for attempt in range(12):
        if not page.evaluate("skip=>crowQA.advance(true,180,skip)", 2.5 if attempt else 0):
            continue
        frame = page.evaluate("crowQA.frames")
        page.wait_for_function("n=>crowQA.frames>=n+4", arg=frame)
        flight = page.evaluate("crowQA.measure()")
        assert flight["positionsMatch"] and flight["pov"] < .001, flight
        best = max(best, flight["ink"])
        if best >= 16:
            break
    assert best >= 16, (device, best, page.evaluate("crowQA.trace"))
    shot("flight")
    for _ in range(8):
        if page.evaluate("crowQA.advance(false,180)"):
            break
    trace = page.evaluate("crowQA.trace")
    assert trace["solo"] and trace["joined"] and "ready" in trace["phases"], trace
    assert len(trace["landings"]) >= 2 and all(0 in item["seniors"] for item in trace["landings"]), trace
    assert trace["missions"] and all(len(m["members"]) == m["target"] for m in trace["missions"]), trace
    page.wait_for_function("prev=>DJEngine.snapshot().A.playing && DJEngine.snapshot().A.time>prev", arg=before)
    assert not errors, errors
    print(device, "opening/flight silhouette pixels", first["ink"], best, trace, flush=True)
    context.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"])
        check(browser, mobile=False)
        check(browser, mobile=True)
        browser.close()
