"""Watch the visiting flocks and their intervention from the homepage's own camera."""
import os
from pathlib import Path

from courtyard_phase import fixed_courtyard_phase
from playwright.sync_api import sync_playwright

from browser_crow_flock import BASE, OBSERVE
from browser_resident_crows import observe_simulation


SEEK = """async (phase) => {
  const T = await import('/yard/vendor/three.module.js');
  const qa = window.crowQA, {allBirds, dispute} = qa.flock;
  const camera = qa.frame.camera.clone(), point = new T.Vector3();
  const panel = document.querySelector('.compact-display')?.getBoundingClientRect();
  const cover = panel?.height ? panel.top / innerHeight : 1;
  function visible(id) {
    const b = allBirds[id];
    point.set(b.x,b.y,b.z).project(camera);
    return Math.abs(point.x)<.95 && point.y>1-2*cover && point.y<.95 && Math.abs(point.z)<1;
  }
  for (let i=0; i<6000; i++) {
    const pose = qa.walk.update(.1);
    qa.seconds = (qa.seconds || 0) + .1;
    if (dispute.phase!==phase) continue;
    camera.position.set(pose.x,pose.y,pose.z);
    camera.rotation.set(pose.pitch,-pose.yaw,pose.roll,'YXZ');
    camera.fov=pose.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const {actors,elders} = dispute;
    if (!actors.every(visible)) continue;
    if (phase==='intervention' && !elders.some(id=>{
      const elder=allBirds[id];
      return visible(id) && elder.y>.65 && Math.hypot(elder.x-dispute.x,elder.z-dispute.z)<4;
    })) continue;
    return {actors,elders,flocks:actors.map(id=>allBirds[id].flockId),
            senior:allBirds[elders[0]].senior,spot:[dispute.x,dispute.z]};
  }
  return null;
}"""

AFTERMATH = """ids => {
  const qa = window.crowQA, {allBirds, dispute} = qa.flock;
  const [a,b]=ids.map(id=>allBirds[id]);
  const gap = () => Math.hypot(a.x-b.x,a.z-b.z);
  const startingGap=gap();
  let remaining=0, endingGap=startingGap;
  for (let i=0; i<450; i++) {
    qa.walk.update(.1);
    qa.seconds+=.1;
    if (!remaining && dispute.phase==='scatter') {
      remaining=Math.min(a.quietUntil,b.quietUntil)-qa.seconds;
    } else if (remaining && dispute.phase==='idle') {
      endingGap=Math.max(endingGap,gap());
    } else if (remaining && dispute.phase==='challenge' && ids.some(id=>dispute.actors.includes(id))) {
      throw Error('A dispersed crow immediately returned to another challenge');
    }
  }
  return {remaining,startingGap,endingGap};
}"""


def check(browser, mobile):
    device = "phone" if mobile else "desktop"
    page = browser.new_page(viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                            is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.route("**/yard/auto-walk.js*", observe_simulation)
    page.route("**/yard/crow-flock.js*", observe_simulation)
    fixed_courtyard_phase(page)
    page.add_init_script("Date.now=()=>Date.parse('2026-06-21T06:08:00Z')+performance.now()")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_function("window.visitQA && document.body.dataset.yardBackdrop==='live'", timeout=75000)
    page.evaluate("() => {window.crowQA=window.visitQA}")
    page.evaluate(OBSERVE)
    page.wait_for_function("crowQA.frame && crowQA.frame.scene.userData.detailLoading.status==='ready'", timeout=75000)
    for phase in ("challenge", "intervention"):
        sighting = page.evaluate(SEEK, phase)
        assert sighting, (device, phase)
        assert len(set(sighting["flocks"])) == 2, sighting
        if phase == "intervention":
            assert sighting["senior"] and all(0 < elder < 13 for elder in sighting["elders"]), sighting
        frames = page.evaluate("crowQA.frames")
        page.wait_for_function("n=>crowQA.frames>=n+3", arg=frames)
        for subject in (["actors", "elders"] if phase == "intervention" else ["actors"]):
            result = page.evaluate("ids=>crowQA.measure(ids)", sighting[subject])
            assert result["instances"] == 18 and result["positionsMatch"] and result["ink"] >= 8, (sighting, result)
            print(device, phase, subject, sighting[subject], result["ink"], "pixels", flush=True)
        if folder := os.getenv("INTEON_FLOCK_SHOTS"):
            path = Path(folder)
            path.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=path / f"{device}-{phase}.jpg", type="jpeg", quality=92)
    aftermath = page.evaluate(AFTERMATH, sighting["actors"])
    assert aftermath["remaining"] > 45 and aftermath["endingGap"] > aftermath["startingGap"] + 3, aftermath
    print(device, "after intervention", aftermath, flush=True)
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"]) as browser:
            check(browser, False)
            check(browser, True)
