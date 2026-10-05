# Mobile rendering audit

## Scope

Local changes only. Existing edits and playback ownership preserved. No minimap behavior changes, no geometry/material removal, no commit or deployment.

- `script.js` rendering only: 32ms minimum between mobile decorative visual ticks; skip measuring/drawing the already CSS-hidden low-quality logo filament canvas. Existing logo dissolve, slices and music response remain.
- `styles.css`: mobile/coarse-pointer atmosphere blur 6px, logo aura blur 8px, active-player backdrop blur 8px, remove filter will-change hint on reactive logo. Desktop selectors/quality unchanged.
- `yard/quality.js`: retain DPR 1 mobile / 1.25 desktop, also recognize coarse-pointer landscape/tablets; correct mislabeled mean as actual median (mean remains separately available); export pure render gate.
- `yard/main.js`: mobile GPU submission only when camera pose, viewport revision or async logo texture changes; include context-restoration invalidation. Input, minimap and playback still run on their existing cadence. Reapply DPR on resize. Desktop continues rendering every frame.
- `yard/yard.css`: inspected; no change justified (static controls, no repeating costly animation).
- `tests/yard-minimap.test.cjs`: only extraction endpoint changed to recognize the new render conditional, without changing its assertions or minimap behavior.

## Measured results

`python tests/browser_render_cost.py before` was run before these edits, then `python tests/browser_render_cost.py after` after them. Same installed headless Edge, 390x844 CSS viewport, DPR 3, mobile/touch emulation, no CPU throttle, local threaded HTTP server, 2-second warmup and 6-second samples. All remote HTTPS requests blocked in both runs. Automatic courtyard return set to its supported 65-second value. Turning test increments yaw .015 every 32ms; this is a controlled changing-pose workload, not an FPS benchmark.

| Workload | CDP TaskDuration before / after | ScriptDuration before / after | WebGL submissions before / after |
|---|---:|---:|---:|
| Home idle | 2.786449 / 2.749082 s | .111976 / .081944 s | n/a |
| Yard idle | .388187 / .090445 s | .283795 / .030223 s | 451 / 0 |
| Yard turning | .421755 / .278765 s | .310812 / .193478 s | 450 / 187 |

Yard task duration decreased 76.7% idle and 33.9% on this controlled turn workload. Home task duration differs only 1.3%; do **not** claim a meaningful homepage speedup. Homepage style/layout remains the main bottleneck (before style .795556 s/layout .435670 s; after style .839724 s/layout .426100 s). Randomized theme/playlist and animation phases were not frozen, so the small homepage difference is inconclusive. No physical-device GPU, thermal or battery measurement was made.

All mobile samples had rAF median 13.3ms, p95 13.4ms, no >50ms intervals; these are callback intervals, **not FPS**. Yard output remained 390x844 DPR 1, with 50 calls/48874 triangles at the idle view. Geometry was not degraded.

Desktop check: `python tests/browser_render_cost.py desktop desktop`, 1440x900 DPR 2. Yard still uses DPR 1.25 (1800x1125), 451 idle submissions / 450 turning submissions in six seconds.

Raw JSON and screenshots: `C:/Users/user/render-cost-audit/{before,after,desktop}.json` and corresponding PNGs. Before/after mobile home and yard, desktop home and broad yard view, plus mobile 320px portrait and 844px landscape screenshots inspected. Yard before/after appearance is unchanged; homepage preserves logo and atmosphere, with tighter/less diffuse blur. Randomized theme/playlist differs between captures, not evidence of a styling regression.

## Verification

- `node --test tests/mobile-rendering.test.cjs`: 2 passed (first draw, idle skip, pitch, texture and viewport invalidation; desktop continuous rendering). Tests first failed before implementing the gate.
- `python tests/browser_mobile_transition.py`: passed at 320x568, 390x844, 844x390, 568x320. Real touch scrolling/look, overlays/focus, manual/back/timed return, no horizontal overflow and playing after return pass. No page exceptions.
- `node --check script.js`, `yard/main.js`, `yard/quality.js`: pass.
- `git diff --check`: pass; only existing LF/CRLF warnings.
- Benchmark yard console: clean. Homepage has the same local 404 and intentionally blocked external-request console errors before/after; authorization behavior was not changed.
- Existing minimap tests remain 1 pass / 3 failures: unthrottled cadence expected versus current 48/120ms cadence and opposite-rotation expectation. They are outside this task; actual minimap behavior remains untouched.

## Tradeoffs / limits

Decorative JavaScript on mobile updates less frequently, while CSS logo animations and the existing audio-reactive identity remain. Atmosphere/player blur is less diffuse. Desktop quality unchanged. A future time-animated 3D effect must explicitly invalidate the mobile render gate; the current courtyard has pose-driven boundary effects, static baked lighting and an asynchronously loaded static wall logo.
