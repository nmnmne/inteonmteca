"""Follow a full 24-minute day in the public courtyard renderer with a controlled wall clock."""
import os
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

from browser_ambient_route import expose_walker

BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
MIDNIGHT = int(datetime(2026, 3, 20, tzinfo=timezone.utc).timestamp() * 1000)
MINUTE = 60_000


def observe(page):
    page.evaluate("""async () => {
      const { Scene, WebGLRenderTarget } = await import('/yard/vendor/three.module.js');
      const after = Scene.prototype.onAfterRender;
      Scene.prototype.onAfterRender = function(renderer, ...args) {
        after.call(this, renderer, ...args);
        const s = this.userData.solarLighting;
        if (!s || !renderer.domElement.closest('[data-yard-layer]')) return;
        window.qaCount = (window.qaCount || 0) + 1;
        window.qaReady = this.userData.detailLoading.status === 'ready' && s.receivers > 150;
        if (!window.qaCapture) return;
        window.qaCapture = false;
        const sun = this.children.find(o => o.isDirectionalLight);
        const scene = this, camera = args[1];
        // Compare the same rendered receivers with the native solar shadow
        // switched on and off. A depth texture alone doesn't prove visible shade.
        window.qaShadowFootprint = () => {
          const width=320, height=Math.round(width/camera.aspect);
          const probe = new WebGLRenderTarget(width,height);
          const keep=renderer.getRenderTarget(), intensity=sun.shadow.intensity;
          function pixels(value) {
            sun.shadow.intensity=value;
            renderer.render(scene,camera);
            const result=new Uint8Array(width*height*4);
            renderer.readRenderTargetPixels(probe,0,0,width,height,result);
            return result;
          }
          try {
            renderer.setRenderTarget(probe);
            const shaded=pixels(intensity), full=pixels(0), repeat=pixels(intensity);
            let visible=0;
            for(let i=0;i<full.length;i+=4) {
              const delta=full[i]+full[i+1]+full[i+2]-shaded[i]-shaded[i+1]-shaded[i+2];
              if (delta>12 && Math.abs(shaded[i]-repeat[i])<3) visible++;
            }
            return visible / (width*height);
          } finally {
            sun.shadow.intensity=intensity; renderer.setRenderTarget(keep); probe.dispose();
          }
        };
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
          x:s.direction.x,elevation:s.elevationDeg,updates:s.shadowUpdates,receivers:s.receivers, map:s.mapSize,
          night:this.userData.windowNight.value, intensity:sun.intensity, auto:renderer.shadowMap.autoUpdate,
          detail:this.userData.detailLoading.status};
      };
    }""")


def capture(page, real_epoch_ms):
    page.evaluate("""time => {
      window.qaTime = time; window.qaResult = null; window.qaCapture = true;
    }""", real_epoch_ms)
    page.wait_for_function("window.qaResult?.epoch === window.qaTime", timeout=45000)
    return page.evaluate("qaResult")


def exercise(browser, mobile):
    viewport = {"width":390, "height":844} if mobile else {"width":1100, "height":740}
    page = browser.new_page(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    errors, shadow_downloads = [], []
    page.on("pageerror", lambda error: errors.append(error.stack))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.on("request", lambda req: shadow_downloads.append(req.url) if "/data/shadows/" in req.url else None)
    page.route("**/yard/auto-walk.js*", expose_walker)
    # At the equinox the sun crosses the southern meridian near 08:42 UTC in Oral.
    noon_at = MIDNIGHT + 8*MINUTE + 42000
    dawn_at = noon_at - 6*MINUTE
    evening_at = noon_at + 6*MINUTE
    night_at = noon_at + 12*MINUTE
    morning_at = MIDNIGHT + 4*MINUTE
    page.add_init_script(f"window.qaTime={morning_at}; Date.now = () => window.qaTime;")
    page.goto(BASE + "/#studio", wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=90000)
    observe(page)
    page.wait_for_function("window.qaReady", timeout=60000)
    morning = capture(page, morning_at)
    assert morning["x"] > .9 and morning["levels"] > 3 and morning["receivers"] > 150, morning
    cached = capture(page, morning_at + 20)
    assert cached["updates"] == morning["updates"] and not cached["auto"], cached
    dawn = capture(page, dawn_at)
    noon = capture(page, noon_at)
    footprint = page.evaluate("qaShadowFootprint()")
    assert footprint > .002, (footprint, noon)
    # Sample real browser frames across two seconds at 16 Hz. The solar
    # position advances, while intervening frames reuse the previous depth map.
    moving = [capture(page, noon_at + step*125//2) for step in range(1, 33)]
    depth_passes = moving[-1]["updates"] - noon["updates"]
    assert 1 <= depth_passes <= 16 and moving[-1]["x"] < noon["x"] - .007, (depth_passes, moving[-1])
    afternoon = capture(page, MIDNIGHT + 13*MINUTE + 20000)
    dusk = capture(page, evening_at)
    assert abs(dawn["elevation"]) < 1 and dawn["x"] > .95, dawn
    assert noon["elevation"] > 37 and afternoon["x"] < -.9, (noon, afternoon)
    assert abs(dusk["elevation"]) < 1 and dusk["x"] < -.95, dusk
    assert len({row["depthHash"] for row in (morning,noon,afternoon)}) == 3
    # Jump the clock while rendering is paused, then return to the same page.
    before = page.evaluate("""time => {
      Object.defineProperty(document, 'hidden', {configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.qaTime=time;
      return window.qaCount;
    }""", night_at)
    page.wait_for_timeout(120)
    assert page.evaluate("qaCount") == before
    page.evaluate("""() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));}""")
    night = capture(page, night_at)
    assert night["night"] == 1 and night["intensity"] == 0 and night["updates"] == dusk["updates"], night
    assert 2 < night["brightness"] < noon["brightness"]*.7, (noon, night)
    next_dawn = capture(page, noon_at + 18*MINUTE)
    next_noon = capture(page, noon_at + 24*MINUTE)
    for original, next_day in ((dawn, next_dawn), (noon, next_noon)):
        assert abs(original["elevation"] - next_day["elevation"]) < .03, (original, next_day)
        assert abs(original["x"] - next_day["x"]) < .001, (original, next_day)
    # Pagehide releases the GPU and the history entry creates a fresh rig on
    # pageshow. The returned scene must use the clock at the time of return.
    page.goto(BASE + "/yard/solar-clock.js")
    page.go_back(wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=90000)
    observe(page)
    returned = capture(page, noon_at)
    assert returned["elevation"] == noon["elevation"] and returned["levels"] > 3, returned
    assert not errors and not shadow_downloads, (errors, shadow_downloads)
    print("phone" if mobile else "desktop", "elevations at 6-minute intervals",
          [round(row["elevation"], 3) for row in (dawn,noon,dusk,night,next_dawn,next_noon)],
          "visible noon shadow", f"{footprint:.1%}", "map", noon["map"],
          "depth passes in 2 seconds", depth_passes, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"])
        exercise(browser, mobile=False)
        exercise(browser, mobile=True)
        browser.close()
