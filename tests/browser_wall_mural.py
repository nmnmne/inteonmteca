"""Check the mural at the start of the actual courtyard route in daylight and after dark."""
import base64
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_ambient_route import BASE, expose_walker


def expose_mural_clock(route):
    url = route.request.url
    if "qa-original" in url:
        route.continue_()
        return
    original = url + ("&" if "?" in url else "?") + "qa-original"
    route.fulfill(content_type="text/javascript", body=f"""
        import {{createWallWordmark as create}} from '{original}';
        export * from '{original}';
        export function createWallWordmark(options) {{
          const epoch = performance.now();
          return create({{...options, clock: () => window.wallTestTime ?? (performance.now() - epoch)}});
        }}
    """)


MARGIN = """map => {
    const im = map.image, rgba = im.getContext('2d').getImageData(0, 0, im.width, im.height).data;
    let count = 0, signature = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < im.width; x++) {
      const alpha = rgba[(y * im.width + x) * 4 + 3];
      if (alpha > 36) count++;
      signature = Math.imul(signature ^ alpha, 16777619);
    }
    return {count, signature};
}"""


def sample(browser, day):
    page = browser.new_page(viewport={"width": 1200, "height": 780})
    page.route("**/yard/auto-walk.js*", expose_walker)
    page.route("**/yard/wall-wordmark.js*", expose_mural_clock)
    stamp = "2026-06-21T00:08:00Z" if day else "2026-11-20T00:21:00Z"
    page.add_init_script(f"Date.now = () => Date.parse('{stamp}') + performance.now()")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=60000)
    page.locator('[data-window-action=minimize][data-app=dj]:visible').first.click()
    page.wait_for_selector('body[data-yard-window=desktop]')
    page.evaluate("""async () => {
      const {Scene} = await import('/yard/vendor/three.module.js');
      const after = Scene.prototype.onAfterRender;
      Scene.prototype.onAfterRender = function(renderer, scene, camera, ...rest) {
        after.call(this, renderer, scene, camera, ...rest);
        if (!renderer.domElement.closest('[data-yard-layer]')) return;
        const logo = scene.getObjectByName('music-logo');
        if (logo?.userData.inkReady) {
          window.mural = logo.material.map;
          window.wallView = {logo, renderer, scene, camera};
          window.muralLight = {day:scene.userData.solarLighting.daylight, color:logo.material.color.getHex()};
        }
        if (window.captureMural && window.mural && !renderer.getRenderTarget()) {
          window.muralPng = renderer.domElement.toDataURL();
          window.captureMural = false;
        }
      };
    }""")
    page.wait_for_function("window.mural?.version > 2")
    first = page.evaluate(f"({MARGIN})(mural)")
    assert first["count"] > 500, first
    page.wait_for_function(f"old => ({MARGIN})(mural).signature !== old", arg=first["signature"])
    light = page.evaluate("muralLight")
    assert light["day"] == (1 if day else 0), light
    if directory := os.environ.get("INTEON_MURAL_SHOTS"):
        path = Path(directory)
        path.mkdir(parents=True, exist_ok=True)
        page.evaluate("window.captureMural = true")
        page.wait_for_function("window.muralPng")
        png = page.evaluate("muralPng.split(',')[1]")
        (path / ("day.png" if day else "night.png")).write_bytes(base64.b64decode(png))
    if day:
        check_score(page)
    page.close()
    return light["color"]


def check_score(page):
    report = page.evaluate("""async () => {
      const {wallLogoScore} = await import('/yard/wall-logo-effects.js');
      const {logo, renderer, scene, camera} = wallView;
      if (document.querySelector('#logo-wrap')?.getBoundingClientRect().width)
        throw Error('Expected the heading to be hidden with the player minimized');
      const image = logo.material.map.image, ctx = image.getContext('2d');
      let start = 0;
      const frames = [];
      for (const cue of wallLogoScore) {
        window.wallTestTime = (start + cue.duration * .53) * 1000;
        logo.onBeforeRender(renderer, scene, camera);
        const pixels = ctx.getImageData(image.width * .13, image.height * .26,
           Math.floor(image.width * .74), Math.floor(image.height * .48)).data;
        let hash = 2166136261, pigment = 0;
        for (let i = 0; i < pixels.length; i += 16) {
          if (pixels[i + 3] > 40) pigment++;
          for (let channel = 0; channel < 4; channel++)
            hash = Math.imul(hash ^ pixels[i+channel],16777619);
        }
        frames.push({cue:cue.name, variant:cue.variant, actual:logo.userData.wallEffect, hash, pigment});
        start += cue.duration;
      }
      delete window.wallTestTime;
      return frames;
    }""")
    variants = {frame["variant"] for frame in report if frame.get("variant")}
    assert variants == {1, 3, 5, 12, 13, 16, 17}, report
    assert all(frame["actual"]["name"] == frame["cue"] and
               frame["actual"].get("variant") == frame.get("variant") for frame in report), report
    assert {frame["cue"] for frame in report} >= {
        "surface", "scatter", "handwriting", "ripples", "recursion", "acid",
        "storm", "symbols", "spectral", "pixels",
    }, report
    assert sum(frame["pigment"] > 80 for frame in report) >= len(report) - 2, report
    assert len({frame["hash"] for frame in report}) >= len(report) - 1, report
    print("Hidden-player wall effects", [(frame["cue"], frame.get("variant")) for frame in report], flush=True)


def reduced_motion(browser):
    page = browser.new_page(reduced_motion="reduce")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_function("""document.body.dataset.yardBackdrop === 'still'
      && document.querySelector('[data-yard-layer] img')?.naturalWidth > 0""")
    assert page.locator("[data-yard-layer] canvas").count() == 0
    # Rendering the same material on demand with reduced motion also freezes
    # the paint (e.g. when generating static versions of the opening view).
    page.evaluate("""async () => {
      const {createWallWordmark} = await import('/yard/wall-wordmark.js');
      const {Scene, PerspectiveCamera} = await import('/yard/vendor/three.module.js');
      const logo = createWallWordmark(), scene = new Scene(), camera = new PerspectiveCamera();
      window.redraw = () => logo.onBeforeRender(null, scene, camera);
      window.mural = logo.material.map;
    }""")
    page.wait_for_function("mural.version > 1")
    page.evaluate("redraw()")
    first = page.evaluate(f"({MARGIN})(mural)")
    page.wait_for_timeout(350)
    page.evaluate("redraw()")
    assert first["count"] > 500 and first == page.evaluate(f"({MARGIN})(mural)")
    page.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"])
        daylight = sample(browser, True)
        night = sample(browser, False)
        assert daylight == 0xffffff and night != daylight, (daylight, night)
        reduced_motion(browser)
        browser.close()
    print("The wall mural animates under both solar states and stays still in reduced motion.")
