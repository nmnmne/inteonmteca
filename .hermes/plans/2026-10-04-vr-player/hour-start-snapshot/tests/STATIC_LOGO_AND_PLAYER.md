# Homepage: static mobile logo and player layout

## Implemented
- `assets/logo-fragmented.png`: 1160 × 280 transparent alpha image, 32,129 bytes. Derived from the real `assets/logo-wordmark.svg`, thickened slightly and deterministically sliced/displaced. No playlist or other UI pixels. Rebuild with `python tools/bake_mobile_logo.py` (Pillow + Playwright/Edge).
- CSS mask uses existing palette tokens, so the baked image changes color with themes.
- Mobile renderer chosen before canvas context acquisition; removes decorative logo/canvas nodes, skips particle/wind/smoke construction, does not schedule scene RAF or logo cycle. Low-frequency text updates every 150 ms, shorter 4.2-second title cycle; reduced-motion stops text mutation.
- Responsive, aligned track rows and dedicated now-playing transport; original infinite randomized scroll loop restored in BOTH directions. Desktop retains animated logo. Lightweight chromatic text/hover accents; mobile backdrop remains static.
- Original copy checked against `git show HEAD:index.html`: `от всех наших`, `music label`, `Музыка, люди, вайб. Уже здесь`, `from all ours`. Preserved verbatim. User-approved `Выбери свой звук.` retained. Invented slogan removed. Search metadata and robots untouched.
- Removed chat teaser DOM/CSS/keyframes. Accessible compact opener and complete dialog remain.

## Verification
`node --test tests/static-mobile-logo.test.cjs`: 4 passed.
`python tests/browser_static_logo.py`: six real Edge contexts passed: 390×844, 844×390, 1440×900, reduced motion 390×844, 320×568, 667×375. Uses actual local app backend and media, not mocked responses. Covers:
- zero decorative nodes, zero scene RAF callbacks and zero logo subtree mutations on mobile;
- live text mutation, reduced-motion stops, desktop live logo;
- palette recoloring (oxblood → glacier);
- actual wheel input across both ends, no hard stop and bounded repeated row count;
- media time advances; play/pause, previous/next, seek, desktop volume, close;
- chat open/close and focus/ARIA state;
- list and transport geometry without overlap/viewport overflow.

Screenshots and JSON: `C:/Users/user/static-logo-audit/` (`portrait-playing.png`, `landscape-playing.png`, `desktop-playing.png`, `small-playing.png`, theme and chat variants, `results.json`).
`node --check script.js` and `git diff --check`: passed (existing CRLF warnings only).

## Performance evidence (emulated, not a physical-phone FPS claim)
Same six-second `tests/browser_render_cost.py` homepage audit:
- Before: TaskDuration 2.480085 s; ScriptDuration .07335 s; LayoutDuration .392707 s; RecalcStyleDuration .737346 s; LayoutCount 533.
- Final infinite-list layout: TaskDuration .742269 s; ScriptDuration .017838 s; LayoutDuration .024326 s; RecalcStyleDuration .26277 s; LayoutCount 41.
Raw files: `C:/Users/user/render-cost-audit/static-logo-before.json` and `static-logo-final.json`. Refresh cadence varied between runs and concurrent local work can affect timing; do not claim a universal percentage/FPS improvement. Harness intentionally blocks external network and its simple server emits an API 404; dedicated browser test uses the real backend and has zero page exceptions.

## Scope / known suite state
No commit, publication or deployment. Deployment already includes `assets/*`, so the PNG needs no deploy-script change. Did not modify yard or street-return work.
Latest aggregate Node run: 61 tests, 57 pass, 4 failures outside this feature (existing auth fallback and three minimap assertions). Latest aggregate Python run: 54 tests, one failure in concurrently edited `test_baked_shadow_assets.test_twelve_actual_depth_textures`; homepage/content assertions pass. Re-run aggregate suites after other agents finish.
