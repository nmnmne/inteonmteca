"""Check real automatic theme changes during audio and snapshot cancellation."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

report = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for mobile in (False, True):
        page = browser.new_page(
            viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
            is_mobile=mobile, has_touch=mobile,
        )
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("""
            localStorage.setItem('inteonmteca-theme-duration', '8000');
            sessionStorage.setItem('inteon-storm-last', String(Date.now()));
            window.__themeCommits = 0;
            window.addEventListener('inteon-theme-frame', () => __themeCommits++);
        """)
        page.goto("http://127.0.0.1:8080/", wait_until="domcontentloaded")
        page.locator(".track-select").first.click()
        page.wait_for_function("!document.querySelector('#album-player').paused")
        initial = page.evaluate("document.documentElement.dataset.theme")
        initial_time = page.evaluate("document.querySelector('#album-player').currentTime")
        page.wait_for_function("inteonThemeMorph.active", timeout=11000)
        assert page.evaluate("inteonHomeEffects.active") == "theme"
        client = page.context.new_cdp_session(page)
        client.send("Performance.enable")
        before = {item["name"]: item["value"] for item in client.send("Performance.getMetrics")["metrics"]}
        commits = page.evaluate("__themeCommits")
        frames = page.evaluate("""() => new Promise(resolve => {
            let last=performance.now(), start=last, times=[];
            const tick=now=>{times.push(now-last);last=now;
                if(inteonThemeMorph.active)requestAnimationFrame(tick);
                else{times.sort((a,b)=>a-b);resolve({fps:times.length/((now-start)/1000),
                    p95:times[Math.floor(times.length*.95)], frames:times.length, duration:now-start});}};
            requestAnimationFrame(tick);
        })""")
        after = {item["name"]: item["value"] for item in client.send("Performance.getMetrics")["metrics"]}
        assert page.evaluate("document.documentElement.dataset.theme") != initial
        assert page.evaluate("document.querySelector('#album-player').currentTime") > initial_time + 5
        assert not page.evaluate("document.querySelector('#album-player').paused")
        assert page.evaluate("__themeCommits") - commits <= 1
        assert page.evaluate("inteonHomeEffects.active") is None
        report.append({"mobile": mobile, "automatic_theme": True, "frames": frames,
                       "metrics": {key: round(after[key]-before[key], 4) for key in
                                   ("TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "LayoutCount")}})

        # A real control click cancels a snapshot so its updated content is live.
        page.evaluate("randomizeTheme()")
        assert page.evaluate("inteonThemeMorph.active")
        page.locator("#auth-hint").click()
        assert not page.evaluate("inteonThemeMorph.active")
        assert page.locator("#auth-panel").is_visible()
        page.locator("#auth-email").fill("snapshot-check@example.com")
        assert page.locator("#auth-email").input_value() == "snapshot-check@example.com"
        page.locator("#auth-close").click()

        # Superseded callbacks and unsupported browsers still commit the newest theme.
        page.evaluate("setTheme(themeNames[1]);setTheme(themeNames[2]);")
        page.wait_for_function("!inteonThemeMorph.active", timeout=3000)
        assert page.evaluate("document.documentElement.dataset.theme === themeNames[2]")
        page.evaluate("window.__nativeTransition=document.startViewTransition;document.startViewTransition=undefined;setTheme(themeNames[3]);")
        assert not page.evaluate("inteonThemeMorph.active")
        assert page.evaluate("document.documentElement.dataset.theme === themeNames[3]")
        page.evaluate("void (document.startViewTransition=window.__nativeTransition)")
        assert not errors, errors
        page.close()
    browser.close()

output = Path(__file__).parent / "artifacts" / "home-optimization" / "theme-snapshot-performance.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
