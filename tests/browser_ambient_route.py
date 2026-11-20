"""Follow the backdrop's real route through a house, out of the map and back."""
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def expose_walker(route):
    url = route.request.url
    if "qa-original" in url:
        route.continue_()
        return
    original = url + ("&" if "?" in url else "?") + "qa-original"
    # The normal homepage creates its own walker. Hold its real clock between
    # samples so the renderer, the lighting and the console reflection catch up.
    route.fulfill(content_type="text/javascript", body=f"""
        import {{ createAutoWalk as create }} from '{original}';
        export * from '{original}';
        export function createAutoWalk(layout, options) {{
          const walk = create(layout, options);
          window.qaRoute = {{ walk, layout, frame: null, count: 0 }};
          return {{ ...walk, update: () => walk.update(0) }};
        }}
    """)


def check_route(browser, mobile):
    context = browser.new_context(viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                                  is_mobile=mobile, has_touch=mobile)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(error.stack))
    page.route("**/yard/auto-walk.js*", expose_walker)
    page.goto(BASE + "/#studio", wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=45000)
    page.evaluate("""async () => {
        const {Scene} = await import('/yard/vendor/three.module.js');
        const {pointInRing, distanceToSegment} = await import('/yard/navigation.js');
        const {virtualAmount} = await import('/yard/digital-boundary.js');
        const qa = window.qaRoute, layout = qa.layout;
        const classify = ({x,z}) => {
            const building = layout.buildings.find(b => pointInRing(x, z, b.footprint));
            const wall = Math.min(...layout.buildings.map(b => Math.min(...b.footprint.map((a,i,ring) => {
                const next = ring[(i+1) % ring.length];
                return distanceToSegment(x, z, a[0], a[1], next[0], next[1]);
            }))));
            return {house:building?.id, wall, inMap:pointInRing(x,z,layout.walkable), edge:virtualAmount(layout,x,z)};
        };
        const render = Scene.prototype.onBeforeRender;
        Scene.prototype.onBeforeRender = function(renderer, scene, camera, ...rest) {
            if (renderer.domElement.closest('[data-yard-layer]')) {
                const proxy = scene.getObjectByName('digital-buildings'), grid = scene.getObjectByName('digital-ground');
                qa.frame = {x:camera.position.x, z:camera.position.z, amount:scene.userData.virtuality,
                            proxy:proxy.visible, grid:grid.material.opacity, sky:scene.background.getHex()};
                qa.count++;
            }
            return render.call(this,renderer,scene,camera,...rest);
        };
        qa.seek = stage => {
            for (let seconds=0; seconds<7200; seconds++) {
                const pose = qa.walk.update(seconds ? 1 : 0), where = classify(pose);
                const clear = !where.house && where.wall > 2 && where.inMap && where.edge < .001;
                if ((stage==='street' && clear) || (stage==='house' && where.house && where.wall > 2 && where.edge < .001)
                    || (stage==='outside' && !where.inMap && where.edge > .99)) {
                    return {x:pose.x,z:pose.z,house:where.house,previousFrame:qa.count};
                }
            }
            throw Error('The real route did not reach ' + stage);
        };
    }""")
    screenshot_dir = os.environ.get("INTEON_ROUTE_SHOTS")
    street_sky = None
    for name, stage in [("01-before", "street"), ("02-inside", "house"), ("03-after", "street"),
                        ("04-outside", "outside"), ("05-back", "street")]:
        target = page.evaluate("stage => qaRoute.seek(stage)", stage)
        page.wait_for_function("""t => qaRoute.count > t.previousFrame && qaRoute.frame
            && Math.hypot(qaRoute.frame.x-t.x, qaRoute.frame.z-t.z)<.05""", arg=target)
        frame = page.evaluate("qaRoute.frame")
        digital = stage != "street"
        assert (frame["amount"] > .98 if digital else frame["amount"] < .002), (target, frame)
        assert frame["proxy"] == digital, (target, frame)
        sky = frame["sky"].to_bytes(3, "big")
        if street_sky is None:
            street_sky = sky
        color_change = max(abs(a - b) for a, b in zip(street_sky, sky))
        assert (color_change > 20 if digital else color_change < 3), (target, frame)
        if stage != "outside":
            assert (frame["grid"] > .7) == digital, (target, frame)
        assert page.locator("body").get_attribute("data-yard-backdrop") == "live"
        if screenshot_dir and not mobile:
            directory = Path(screenshot_dir)
            directory.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=directory / f"{name}.png")
        print("mobile" if mobile else "desktop", name, target.get("house"),
              round(frame["x"], 1), round(frame["z"], 1), round(frame["amount"], 3), flush=True)
    assert not errors, errors
    context.close()


if __name__ == "__main__":
    if urlsplit(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Pass the local studio preview URL in INTEON_BASE_URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", args=["--enable-unsafe-swiftshader"])
        check_route(browser, mobile=False)
        check_route(browser, mobile=True)
        browser.close()
