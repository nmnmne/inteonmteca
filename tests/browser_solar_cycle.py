"""Check the real courtyard renderer against a controlled UTC clock."""
import os
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from browser_ambient_route import expose_walker

BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def observe(page):
    page.evaluate("""async () => {
      const { Scene } = await import('/yard/vendor/three.module.js');
      const after = Scene.prototype.onAfterRender;
      Scene.prototype.onAfterRender = function(renderer, ...args) {
        after.call(this, renderer, ...args);
        const s = this.userData.solarLighting;
        if (!s || !renderer.domElement.closest('[data-yard-layer]')) return;
        window.qaCount = (window.qaCount || 0) + 1;
        if (!window.qaCapture) return;
        window.qaCapture = false;
        const sun = this.children.find(o => o.isDirectionalLight);
        const target = sun.shadow.map;
        let depthHash = null, levels = 0;
        if (target) {
          const strip = new Uint8Array(128 * 128 * 4);
          renderer.readRenderTargetPixels(target, target.width/2-64, target.height/2-64, 128,128,strip);
          const values = new Set();
          depthHash = 17;
          for (let i=0; i<strip.length; i+=4) {
            values.add(strip[i]);
            depthHash = Math.imul(depthHash,31) + strip[i] | 0;
          }
          levels = values.size;
        }
        const c = document.createElement('canvas');
        c.width = 32; c.height = 24;
        const ctx = c.getContext('2d');
        ctx.drawImage(renderer.domElement,0,0,32,24);
        const image = ctx.getImageData(0,0,32,24).data;
        let luminance=0;
        for(let i=0;i<image.length;i+=4) luminance += .213*image[i]+.715*image[i+1]+.072*image[i+2];
        window.qaResult = {depthHash,levels,brightness:luminance/(32*24), epoch:Date.now(),
          x:s.direction.x,elevation:s.elevationDeg,updates:s.shadowUpdates,receivers:s.receivers,
          night:this.userData.windowNight.value, intensity:sun.intensity, auto:renderer.shadowMap.autoUpdate,
          detail:this.userData.detailLoading.status};
      };
    }""")


def capture(page, iso):
    page.evaluate("""iso => {
      window.qaTime = Date.parse(iso); window.qaResult = null; window.qaCapture = true;
    }""", iso)
    page.wait_for_function("window.qaResult?.epoch === window.qaTime", timeout=45000)
    return page.evaluate("qaResult")


def exercise(browser):
    page = browser.new_page(viewport={"width": 900, "height": 620})
    errors, shadow_downloads = [], []
    page.on("pageerror", lambda error: errors.append(error.stack))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.on("request", lambda req: shadow_downloads.append(req.url) if "/data/shadows/" in req.url else None)
    page.route("**/yard/auto-walk.js*", expose_walker)
    page.add_init_script("""window.qaTime=Date.parse('2026-03-20T04:00Z'); Date.now = () => window.qaTime;""")
    page.goto(BASE + "/#studio", wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=90000)
    observe(page)
    morning = capture(page, "2026-03-20T04:00Z")
    # LOD is populated during playback. Wait for the final native shadow pass.
    while morning["detail"] != "ready":
        page.wait_for_timeout(500)
        morning = capture(page, "2026-03-20T04:00Z")
    assert morning["x"] > .9 and morning["levels"] > 3 and morning["receivers"] > 150, morning
    cached = capture(page, "2026-03-20T04:00:05Z")
    assert cached["updates"] == morning["updates"] and not cached["auto"], cached
    noon = capture(page, "2026-03-20T08:42Z")
    evening = capture(page, "2026-03-20T13:20Z")
    assert noon["elevation"] > 37 and evening["x"] < -.9, (noon, evening)
    assert len({row["depthHash"] for row in (morning,noon,evening)}) == 3
    # Jump the clock while rendering is paused, then return to the same page.
    before = page.evaluate("""() => {
      Object.defineProperty(document, 'hidden', {configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.qaTime=Date.parse('2026-03-20T20:35Z');
      return window.qaCount;
    }""")
    page.wait_for_timeout(120)
    assert page.evaluate("qaCount") == before
    page.evaluate("""() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));}""")
    night = capture(page, "2026-03-20T20:35Z")
    assert night["night"] == 1 and night["intensity"] == 0 and night["updates"] == evening["updates"], night
    assert 2 < night["brightness"] < noon["brightness"]*.7, (noon, night)
    # Pagehide releases the GPU and the history entry creates a fresh rig on
    # pageshow. The returned scene must use the clock at the time of return.
    page.goto(BASE + "/yard/solar-clock.js")
    page.go_back(wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=90000)
    observe(page)
    returned = capture(page, "2026-03-20T08:42Z")
    assert returned["elevation"] == noon["elevation"] and returned["levels"] > 3, returned
    assert not errors and not shadow_downloads, (errors, shadow_downloads)
    for label, row in zip(("morning","noon","evening","night"), (morning,noon,evening,night)):
        print(label, row, flush=True)
    page.close()


if __name__ == "__main__":
    if urlsplit(BASE).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Pass the local preview URL in INTEON_BASE_URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"])
        exercise(browser)
        browser.close()
