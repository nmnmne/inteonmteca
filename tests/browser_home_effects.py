"""Exercise exclusive scenes, continuous ambient motion and readable text in a browser."""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for mobile in (False, True):
        context = browser.new_context(
            viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
            is_mobile=mobile, has_touch=mobile,
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("""
            // Automatic rotation is covered by browser_theme_morph.py. Keep it
            // from starting a different theme between these lifecycle assertions.
            localStorage.setItem('inteonmteca-theme-duration', '604800000');
            window.__effectDraws = {};
            window.__ownershipErrors = [];
            requestAnimationFrame(function checkOwnership() {
                if (window.inteonThemeMorph?.active && window.inteonHomeEffects?.active !== 'theme')
                    __ownershipErrors.push({at: performance.now(), owner: inteonHomeEffects.active});
                requestAnimationFrame(checkOwnership);
            });
            const clear = CanvasRenderingContext2D.prototype.clearRect;
            CanvasRenderingContext2D.prototype.clearRect = function(...args) {
                const name = this.canvas.className || 'other';
                __effectDraws[name] = (__effectDraws[name] || 0) + 1;
                return clear.apply(this, args);
            };
        """)
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        assert page.locator(".text-wave-char").count() > 100
        page.evaluate("inteonLogoStorm.stop(); inteonAtmosphere.stop(); inteonLogoAcid.stop(); inteonHomeEffects.claim('test');")
        page.wait_for_timeout(100)
        before = page.evaluate("({...__effectDraws})")
        page.wait_for_timeout(350)
        after = page.evaluate("({...__effectDraws})")
        for name in (("material-field",) if mobile else ("material-field", "logo-ripples")):
            assert after.get(name, 0) > before.get(name, 0), (name, before, after)
        assert not page.evaluate("inteonHomeEffects.claim('second')")
        page.evaluate("inteonHomeEffects.release('wrong')")
        assert page.evaluate("inteonHomeEffects.active") == "test"
        page.evaluate("inteonHomeEffects.release('test')")
        page.wait_for_timeout(1000)
        assert page.evaluate("__effectDraws['material-field']") > after.get("material-field", 0)

        # A rejected scene leaves the current one intact. Stops release ownership.
        page.evaluate("void inteonLogoAcid.run()")
        assert page.evaluate("inteonHomeEffects.active") == "acid"
        page.evaluate("inteonAtmosphere.replayScene()")
        assert page.evaluate("inteonHomeEffects.active") == "acid"
        assert page.locator(".scene-curtain").count() == 0
        page.evaluate("inteonLogoAcid.stop(); inteonAtmosphere.replayScene()")
        assert page.evaluate("inteonHomeEffects.active") == (None if mobile else "interlude")
        if not mobile:
            assert page.evaluate("inteonLogoAcid.run() === null")
        page.evaluate("inteonAtmosphere.stop(); inteonLogoStorm.replay()")
        assert page.evaluate("inteonHomeEffects.active") == (None if mobile else "storm")
        page.wait_for_timeout(1100)
        assert page.locator(".logo-storm").count() == (0 if mobile else 1)

        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(100)
        assert not page.evaluate("inteonHomeEffects.suspended")
        assert page.evaluate("inteonHomeEffects.active") is None
        assert page.locator(".logo-storm").count() == 0
        before = page.evaluate("({...__effectDraws})")
        page.wait_for_timeout(350)
        after = page.evaluate("({...__effectDraws})")
        assert after.get("material-field", 0) > before.get("material-field", 0)
        assert page.locator(".reactive-logo").evaluate("e => getComputedStyle(e).animationName") != "none"
        page.wait_for_function("document.querySelector('.is-wave-noisy')", timeout=5000)
        assert page.locator(".is-wave-noisy .text-wave-mask").first.evaluate("e => getComputedStyle(e).display") != "none"
        page.emulate_media(reduced_motion="no-preference")
        page.wait_for_timeout(100)
        page.evaluate("inteonThemeMorph.apply({'--theme-a-rgb':'100, 120, 150'}, 'dark', true)")
        assert page.evaluate("inteonHomeEffects.active") == "theme"
        # Live palette interpolation runs for four seconds.
        page.wait_for_function("!inteonThemeMorph.active && inteonHomeEffects.active !== 'theme'", timeout=6000)
        state = page.evaluate("({owner: inteonHomeEffects.active, active: inteonThemeMorph.active, errors: __ownershipErrors})")
        assert state == {"owner": None, "active": False, "errors": []}, state
        assert page.locator(".listening-intro h1").text_content() == "Выбери свой звук"
        # Recover even if a mobile lifecycle return omits pageshow.
        page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        assert page.evaluate("inteonHomeEffects.suspended")
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        page.wait_for_timeout(350)
        assert not page.evaluate("inteonHomeEffects.suspended")
        before = page.evaluate("({...__effectDraws})")
        page.wait_for_timeout(350)
        after = page.evaluate("({...__effectDraws})")
        assert after.get("material-field", 0) > before.get("material-field", 0)
        assert page.locator(".reactive-logo").evaluate("e => getComputedStyle(e).animationName") != "none"
        # A stopped RAF must be restarted by the watchdog, on either viewport.
        page.evaluate("window.__restarts = 0; inteonHomeEffects.watch('probe', {blocked: () => false, restart: () => ++__restarts})")
        page.wait_for_function("__restarts > 0", timeout=4500)
        if mobile:
            page.locator("#mobile-section-slider").focus()
            page.keyboard.press("End")
            page.wait_for_timeout(100)
            assert not page.evaluate("inteonHomeEffects.suspended")
            page.keyboard.press("Home")
            page.wait_for_timeout(100)
            assert not page.evaluate("inteonHomeEffects.suspended")
        for width, height in ((320, 568), (844, 390), (768, 1024), (1440, 900)):
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(150)
            before = page.evaluate("__effectDraws['material-field']")
            phase = page.locator(".reactive-logo").evaluate("e => e.getAnimations()[0]?.currentTime")
            page.wait_for_timeout(350)
            assert page.evaluate("__effectDraws['material-field']") > before, (width, height)
            later = page.locator(".reactive-logo").evaluate("e => e.getAnimations()[0]?.currentTime")
            assert phase is not None and later > phase, (width, height, phase, later)
        assert not errors, errors
        context.close()
    browser.close()
    print("Desktop/mobile effect ownership, suspend/resume, text and theme checks passed.")
