"""Tablet logo scenes must not turn an animated palette change into a flash."""
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

output = Path(tempfile.mkdtemp(prefix="inteon-tablet-palette-"))
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for width, height in ((1280, 800), (800, 1280)):
        context = browser.new_context(viewport={"width": width, "height": height},
                                      is_mobile=True, has_touch=True, device_scale_factor=2)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("localStorage.setItem('inteonmteca-theme-duration', '604800000')")
        page.goto("http://127.0.0.1:8080/", wait_until="domcontentloaded")
        page.wait_for_timeout(800)
        state = page.evaluate("""() => {
            inteonMobileLogo.stop(); inteonLogoAcid.stop();
            setTheme('graphite', {animate:false});
            inteonMobileLogo.run();
            const root=document.documentElement, before=getComputedStyle(root).getPropertyValue('--theme-bg');
            const light=themeRegistry.find(t=>t.mood==='light');
            setTheme(light.id);
            return {before, after:getComputedStyle(root).getPropertyValue('--theme-bg'),
                owner:inteonHomeEffects.active, pending:inteonThemeMorph.pending, theme:root.dataset.theme};
        }""")
        assert state["owner"] == "mobile-scatter", state
        assert state["pending"] and state["before"] == state["after"], state
        assert state["theme"] == "graphite", state
        page.screenshot(path=str(output / f"queued-{width}.png"))
        # The real timed scene release starts the transition automatically.
        page.wait_for_function("inteonThemeMorph.active", timeout=6000)
        samples = page.evaluate("""() => new Promise(resolve => {
            const colors=[]; let last=performance.now();
            const draw=now=>{
                const hex=getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim();
                colors.push({at:now, rgb:hex.slice(1).match(/../g).map(v=>parseInt(v,16))});
                if(inteonThemeMorph.active)requestAnimationFrame(draw);else resolve(colors);
            };requestAnimationFrame(draw);
        })""")
        assert len(samples) > 20, len(samples)
        speed = max(max(abs(a-b) for a,b in zip(current["rgb"], previous["rgb"])) /
                    max(1, current["at"] - previous["at"])
                    for previous,current in zip(samples,samples[1:]))
        assert speed < .35, speed
        assert page.evaluate("document.documentElement.dataset.theme") == "cobalt-tile"
        assert not page.evaluate("inteonThemeMorph.pending || inteonThemeMorph.active")
        page.screenshot(path=str(output / f"finished-{width}.png"))
        # New requests supersede old ones without changing the busy scene's palette.
        page.evaluate("inteonHomeEffects.claim('probe'); setTheme('graphite'); setTheme('warm-carbon')")
        assert page.evaluate("document.documentElement.dataset.theme") == "cobalt-tile"
        page.evaluate("inteonHomeEffects.release('probe')")
        page.wait_for_function("!inteonThemeMorph.active", timeout=6000)
        assert page.evaluate("document.documentElement.dataset.theme") == "warm-carbon"
        # Explicit instantaneous selection cancels an older deferred request.
        page.evaluate("inteonHomeEffects.claim('probe'); setTheme('cobalt-tile'); setTheme('graphite',{animate:false}); inteonHomeEffects.release('probe')")
        page.wait_for_timeout(200)
        assert page.evaluate("document.documentElement.dataset.theme") == "graphite"
        assert not page.evaluate("inteonThemeMorph.pending || inteonThemeMorph.active")
        page.evaluate("inteonMobileLogo.stop();inteonLogoAcid.stop()")
        page.locator(".track-select").first.click()
        page.wait_for_function("!document.querySelector('#album-player').paused")
        audio_start = page.evaluate("document.querySelector('#album-player').currentTime")
        page.evaluate("setTheme('deep-ink')")
        page.wait_for_function("!inteonThemeMorph.active", timeout=6000)
        assert not page.evaluate("document.querySelector('#album-player').paused")
        assert page.evaluate("document.querySelector('#album-player').currentTime") > audio_start + 2
        assert not errors, errors
        reports.append({"width":width,"height":height,"transition_frames":len(samples),"max_channel_change_per_ms":round(speed,3)})
        context.close()
    browser.close()
print(json.dumps({"checks":"passed","tablets":reports,"screenshots":str(output)}))
