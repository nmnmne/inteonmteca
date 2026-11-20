"""Verify that the passive courtyard moves behind uninterrupted browser playback."""
import os
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
LAYER = "[data-yard-layer]"


def instrument_renderer(page, disable_webgl=False):
    # Track off-DOM Audio instances used by the DJ engine as well as DOM players.
    page.add_init_script("""
        window.qaYard = { matrices: 0, lastMatrix: '', players: [] };
        window.Audio = new Proxy(window.Audio, {
          construct(target, args) {
            const audio = Reflect.construct(target, args);
            qaYard.players.push(audio);
            return audio;
          }
        });
    """)
    if disable_webgl:
        page.add_init_script("""
            const get = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
              if (/webgl/i.test(type) && this.closest('[data-yard-layer]')) return null;
              return get.call(this, type, ...args);
            };
        """)


def exercise(browser, route, mobile=False, fallback=False):
    context = browser.new_context(
        viewport={"width": 390 if mobile else 1180, "height": 844},
        is_mobile=mobile, has_touch=mobile, device_scale_factor=1,
    )
    page = context.new_page()
    errors, scene_failures = [], []
    page.on("pageerror", lambda error: errors.append(error.stack))
    page.on("response", lambda res: scene_failures.append((res.status, res.url))
            if "/yard/" in res.url and res.status >= 400 else None)
    instrument_renderer(page, fallback)
    page.goto(BASE + route, wait_until="domcontentloaded")
    page.locator(LAYER).wait_for(state="attached")
    assert page.locator("[data-yard-toggle], #street-link").count() == 0
    studio = route != "/listening-room.html"
    if studio:
        play = page.locator("#deck-a .dd-play")
        (play.tap if mobile else play.click)()
        page.wait_for_function("DJEngine.snapshot().A.time > .2 && DJEngine.snapshot().meters.left > .001")
    else:
        # The room uses three copies of its circular catalogue. Select a row
        # actually reachable by a real pointer, rather than tapping an offscreen copy.
        visible = page.locator(".track-select")
        visible.first.wait_for(state="attached")
        page.wait_for_function("""() => [...document.querySelectorAll('.track-select')].some(button => {
          const r = button.getBoundingClientRect();
          return document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)?.closest('button') === button;
        })""")
        index = visible.evaluate_all("""buttons => buttons.findIndex(button => {
          const r=button.getBoundingClientRect();
          return document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)?.closest('button') === button;
        })""")
        if mobile:
            visible.nth(index).tap()
        else:
            visible.nth(index).click()
        page.wait_for_function("!document.querySelector('#album-player').paused && document.querySelector('#album-player').currentTime > .2")

    baseline = page.evaluate("""() => {
        const players = new Set([...document.querySelectorAll('audio'), ...qaYard.players]);
        const player = [...players].find(el => !el.paused);
        window.qaAudio = {player, src:player.currentSrc, interruptions:[]};
        for(const name of ['pause','emptied','abort','seeking']) {
          player.addEventListener(name, () => qaAudio.interruptions.push(name));
        }
        return {time:player.currentTime, players:players.size, frames:frames.length, history:history.length,
                visits:window.inteonStreet?.visits()};
    }""")
    current_url = page.url
    state = "fallback" if fallback else "live"
    page.wait_for_selector(f'body[data-yard-backdrop="{state}"]', timeout=45000)
    if fallback:
        page.wait_for_function("""() => {
          const img = document.querySelector('[data-yard-layer] img');
          return img && img.complete && img.naturalWidth > 0;
        }""")
    else:
        # Observe genuine camera-transform changes on the scene's own Three
        # module. The courtyard shaders can optimize away a viewMatrix uniform.
        page.evaluate("""async () => {
          const { PerspectiveCamera, Scene } = await import('./yard/vendor/three.module.js');
          const renderScene = Scene.prototype.onBeforeRender;
          Scene.prototype.onBeforeRender = function(renderer, ...args) {
            if (renderer.domElement.closest('[data-yard-layer]') && this.userData.solarLighting) {
              const {mapSize, receivers} = this.userData.solarLighting;
              qaYard.shadows = {mapSize, receivers, autoUpdate:renderer.shadowMap.autoUpdate,
                                detail:this.userData.detailLoading.status};
            }
            return renderScene.call(this, renderer, ...args);
          };
          const update = PerspectiveCamera.prototype.updateMatrixWorld;
          PerspectiveCamera.prototype.updateMatrixWorld = function(...args) {
            const result = update.apply(this,args);
            const signature = this.matrixWorld.elements.map(n => n.toFixed(4)).join();
            if (signature !== qaYard.lastMatrix) {
              qaYard.lastMatrix = signature;
              qaYard.matrices++;
            }
            return result;
          };
        }""")
        page.wait_for_function("qaYard.matrices >= 3", timeout=25000)
        if studio:
            # The lacquer samples the live courtyard frame. A fixed poster or
            # a transparent canvas must not satisfy this check.
            page.evaluate("""() => {
              const canvas = document.querySelector('#studio > .console-reflection');
              const ctx = canvas.getContext('2d');
              window.qaReflection = () => {
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let hash = 0, lit = 0;
                for (let i = 0; i < data.length; i += 508) {
                  if (data[i + 3] && data[i] + data[i+1] + data[i+2] > 30) lit++;
                  hash = Math.imul(hash, 31) + data[i] | 0;
                }
                return lit > 20 ? hash : null;
              };
            }""")
            page.wait_for_function("qaReflection() !== null")
            frame_hash = page.evaluate("qaReflection()")
            page.wait_for_function("previous => qaReflection() !== previous", arg=frame_hash)
    assert page.url == current_url
    assert page.locator(LAYER).evaluate("""el => el.inert && getComputedStyle(el).pointerEvents === 'none'
            && el.getAttribute('aria-hidden') === 'true'""")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    if studio:
        control = page.locator("#mobile-cross" if page.locator("#mobile-cross").is_visible() else "#cross")
        control.focus()
        page.keyboard.press("ArrowRight")
        page.wait_for_function("DJEngine.snapshot().cross > 0")
        deck = page.locator("#deck-a")
        deck.locator(".dd-browse-search").fill("Deadsouls")
        assert deck.get_by_role("listbox").get_by_role("option").count() == 1
        assert deck.locator(".dd-wave").is_visible() and page.url == current_url
    else:
        page.locator("#theme-hint").click()
        page.locator("#theme-panel").wait_for()
        page.keyboard.press("Escape")
    assert page.locator(LAYER).count() == 1
    page.wait_for_function("start => qaAudio.player.currentTime > start + .15", arg=baseline["time"])
    assert page.evaluate("""before => {
        const players=new Set([...document.querySelectorAll('audio'), ...qaYard.players]);
        return !qaAudio.player.paused && players.has(qaAudio.player) && qaAudio.src===qaAudio.player.currentSrc &&
            !qaAudio.interruptions.length && frames.length===before.frames && players.size===before.players &&
            (window.inteonStreet?.visits() ?? null)===(before.visits ?? null) && !document.pointerLockElement;
    }""", baseline), page.evaluate("qaAudio.interruptions")
    if not studio:
        assert page.evaluate("history.length") == baseline["history"]
    if not fallback:
        page.wait_for_function("qaYard.shadows?.detail === 'ready'", timeout=45000)
        shadows = page.evaluate("qaYard.shadows")
        assert shadows["mapSize"] == 1024 and shadows["receivers"] > 150 and not shadows["autoUpdate"], shadows
        before = page.evaluate("qaYard.matrices")
        page.wait_for_function("n => qaYard.matrices > n", arg=before)
    assert not errors and not scene_failures, (errors, scene_failures)
    print(route, "mobile" if mobile else "desktop", state, flush=True)
    context.close()


if __name__ == "__main__":
    if urlsplit(BASE).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Pass a local preview in INTEON_BASE_URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True, args=["--enable-unsafe-swiftshader"])
        for path in ("/", "/listening-room.html"):
            exercise(browser, path)
            exercise(browser, path, mobile=True)
            exercise(browser, path, mobile=True, fallback=True)
        browser.close()
