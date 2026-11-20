"""Follow the leader's roll call through the homepage camera and the rendered flock."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_resident_crows import BASE, observe_simulation


OBSERVE = """async () => {
  const T = await import('/yard/vendor/three.module.js');
  const qa = window.visitQA;
  const {walk, flock} = qa;
  const previous = T.Scene.prototype.onAfterRender;
  T.Scene.prototype.onAfterRender = function(renderer, scene, camera, ...args) {
    previous.call(this, renderer, scene, camera, ...args);
    if (!renderer.domElement.closest('[data-yard-layer]')) return;
    const mesh = scene.getObjectByName('crow-plumage');
    if (mesh) { qa.frame = {renderer, scene, camera, mesh}; qa.frames++; }
  };
  const reports = [], sampled = new Set();
  let landing = -1, partners = {}, answered = [];
  const angle = (a,b) => Math.abs(Math.atan2(Math.sin(a-b), Math.cos(a-b)));
  qa.next = () => {
    for (let step=0; step<3600; step++) {
      const pose = walk.update(1/30), {state, birds, rollCall} = flock;
      if (state.landingCount !== landing) {
        landing = state.landingCount;
        partners = {}; answered = [];
      }
      if (state.phase !== 'mission' && rollCall.answered.length) answered = [...rollCall.answered];
      const id = rollCall.targetId, phase = rollCall.phase;
      if (id != null && ['look','signal','reply'].includes(phase)) {
        const b = birds[id], gaze = b.gazePose;
        const p = partners[id] ||= {phases:[], together:0, longest:0};
        if (p.phases.at(-1) !== phase) p.phases.push(phase);
        const look = Math.atan2(b.x-pose.x, pose.z-b.z);
        const pitch = Math.atan2(b.y+.116-pose.y, Math.hypot(b.x-pose.x,b.z-pose.z));
        const aligned = gaze && angle(look, pose.yaw) < .22 && angle(pitch,pose.pitch) < .18
          && angle(look+Math.PI, b.yaw+gaze.glance) < .24;
        p.together = aligned ? p.together + 1/30 : 0;
        p.longest = Math.max(p.longest, p.together);
        if (phase === 'reply' && aligned && !sampled.has(landing) && Math.abs(gaze.wingTip) > .4) {
          sampled.add(landing);
          return {type:'frame', id};
        }
      }
      if (state.missionCount > reports.length) {
        const members = birds.filter(b => b.id && b.inParty).map(b => b.id);
        reports.push({landing, members, answered, partners});
        if (reports.length === 2) return {type:'departures', reports};
      }
    }
    return {type:'continue', landing, phase:flock.rollCall.phase};
  };
  qa.renderedReply = id => {
    const {renderer, scene, camera, mesh} = qa.frame;
    const bird = flock.birds[id], gaze = bird.gazePose;
    const index = id-1, matrix = new T.Matrix4();
    mesh.getMatrixAt(index, matrix);
    const eye = new T.Vector3(0,.116,-.200).applyMatrix4(matrix).project(camera);
    const panel = document.querySelector('.compact-display').getBoundingClientRect();
    const screenY = (1-eye.y)*.5*innerHeight;
    const stride = mesh.geometry.getAttribute('crowStride'), wingTip = mesh.geometry.getAttribute('crowWingTip');
    const width = Math.min(640,renderer.domElement.width), height = Math.round(width/camera.aspect);
    const target = new T.WebGLRenderTarget(width,height), original = renderer.getRenderTarget();
    const fixed = performance.now(), clock = Object.getOwnPropertyDescriptor(performance,'now');
    const frame = visible => {
      mesh.setMatrixAt(index, visible ? matrix : new T.Matrix4().makeScale(0,0,0));
      mesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene,camera);
      const data = new Uint8Array(width*height*4);
      renderer.readRenderTargetPixels(target,0,0,width,height,data);
      return data;
    };
    try {
      Object.defineProperty(performance,'now',{configurable:true,value:()=>fixed});
      renderer.setRenderTarget(target);
      const off = frame(false), on = frame(true), again = frame(false);
      let ink = 0;
      for (let i=Math.ceil(height*(1-panel.top/innerHeight))*width*4; i<on.length; i+=4) {
        if ([0,1,2].some(c=>Math.abs(off[i+c]-again[i+c])<3 && Math.abs(on[i+c]-off[i+c])>8)) ink++;
      }
      return {ink, centered: Math.abs(eye.x)<.5 && screenY>0 && screenY<panel.top,
        glance:[stride.getY(index), gaze.glance], dip:[stride.getZ(index), gaze.dip || 0],
        wing:[wingTip.getX(index), gaze.wingTip || 0]};
    } finally {
      if (clock) Object.defineProperty(performance,'now',clock); else delete performance.now;
      mesh.setMatrixAt(index,matrix); mesh.instanceMatrix.needsUpdate = true;
      renderer.setRenderTarget(original); target.dispose();
    }
  };
}"""


def check(browser, mobile):
    device = "phone" if mobile else "desktop"
    page = browser.new_page(viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 800},
                            is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if "Shader Error" in message.text else None)
    page.route("**/yard/auto-walk.js*", observe_simulation)
    page.route("**/yard/crow-flock.js*", observe_simulation)
    page.add_init_script("Date.now=()=>Date.parse('2026-06-21T06:08:00Z')+performance.now()")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_function("window.visitQA && document.body.dataset.yardBackdrop==='live'", timeout=75000)
    assert page.evaluate("Boolean(visitQA.flock.rollCall)"), "The loaded courtyard has no roll call"
    page.evaluate(OBSERVE)
    page.wait_for_function("visitQA.frame", timeout=45000)
    samples = []
    for _ in range(16):
        result = page.evaluate("visitQA.next()")
        if result["type"] == "departures":
            break
        if result["type"] == "frame":
            frames = page.evaluate("visitQA.frames")
            page.wait_for_function("n=>visitQA.frames>=n+5", arg=frames)
            pose = page.evaluate("id=>visitQA.renderedReply(id)", result["id"])
            assert pose["centered"] and pose["ink"] >= 6, (device, result, pose)
            for key in ("glance", "dip", "wing"):
                actual, expected = pose[key]
                assert abs(actual-expected) < .035, (key, pose)
            samples.append((result["id"], pose["ink"]))
            if folder := os.getenv("INTEON_FLOCK_SHOTS"):
                path = Path(folder)
                path.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=path / f"{device}-roll-call-{len(samples)}.jpg", type="jpeg", quality=92)
    else:
        raise AssertionError((device, "Two departures timed out", result))
    for report in result["reports"]:
        assert sorted(report["members"]) == sorted(report["answered"]), report
        assert {int(item) for item in report["partners"]} == set(report["members"]), report
        for partner in report["partners"].values():
            assert partner["phases"] == ["look", "signal", "reply"] and partner["longest"] >= .25, report
    assert len(samples) == 2 and not errors, (device, samples, errors)
    print(device, "acknowledgements", [r["answered"] for r in result["reports"]],
          "rendered replies (crow, pixels)", samples, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"]) as browser:
            check(browser, False)
            check(browser, True)
