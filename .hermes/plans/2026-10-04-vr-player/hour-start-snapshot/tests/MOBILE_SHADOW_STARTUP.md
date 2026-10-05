# Mobile projected-shadow startup and receiver regression

## Root causes and changes

- `main.js` awaited the complete shadow manifest and PNG before placing the camera, scheduling the first render, publishing `__yard`, or attaching movement input. A six-second PNG delay reproduced a four-second first-frame timeout. This is now a progressive lighting enhancement started after the first visible frame. Completion increments the render revision so the idle mobile gate submits the changed material. Failed/15-second-timed-out assets leave the normal lit, navigable scene intact and record `scene.userData.bakedLightingStatus/Error`; they never enable live shadow maps.
- Every device previously decoded/uploaded a 4096-square RGB24 depth PNG (RGBA GPU allocation 67,108,864 bytes). Coarse-pointer/narrow-screen devices now select separately rasterized 1024-square assets (4,194,304 bytes). All 162 caster meshes / 5,974 instances remain in each bake and all 163 runtime receiver meshes remain shaded. Desktop still uses 4096. Packed depth was not resized/interpolated. Twelve presets exist for each resolution; only the selected preset is requested.
- Receiver correction used an absolute `abs(det)>1e-10` test on screen derivatives. Projected pixel area changes with camera distance and DPR, so correction switched off across a screen-aligned near-camera boundary, exposing self-shadow bands/rectangles. Derivative vectors are now normalized before the singularity check. The 18-mm world-space comparison bias is unchanged (not increased to hide acne).
- Derivatives now run before divergent frustum rejection and outside light loops. Explicit mip level zero avoids implicit texture gradients in the PCF loop. Edge previously emitted X3595 warnings; current coarse-pointer runs have no console/shader errors or warnings.

## Real verification

Commands:

```
python tests/browser_mobile_shadow_startup.py
python tests/browser_shadow_receiver.py
YARD_MOBILE=1 python tests/browser_baked_shadows.py
python tests/browser_baked_shadows.py
python -m unittest tests/test_baked_shadow_assets.py
node --test tests/yard-lighting.test.cjs tests/yard-lighting-cycle.test.cjs tests/mobile-rendering.test.cjs
```

Headless Microsoft Edge on this Windows host, 390x844, device DPR 3, actual coarse pointer / touch / mobile browser context (renderer DPR remains capped at 1):

- Before: fast-local startup 0.703–0.735 s, 64 MiB depth, X3595 warnings. Slow PNG: no first frame within four seconds (test failed).
- Final run: first renderer submission observed at 0.532 s; six-second server-side PNG delay still produced the first frame at 0.203 s, then installed shadows when the request completed. These are local observations, not a claimed phone speedup.
- Eighteen-second server response: request aborted and graceful lighting fallback recorded at 15.250 s; canvas remained visible and live shadows stayed disabled. The isolated timeout fixture extends its visit through the public visit API so the ordinary short visit return does not obscure network timeout behavior.
- Idle 500 ms: zero additional submissions. Pose change: one additional submission. Held W on the real coarse-pointer movement controller: frame 78 to 151 while body moved from approximately (0.519,-9.511) to (-0.983,-9.014). This is renderer submission evidence, not a physical-phone FPS claim.
- 13 visits per device mode passed the complete 12-slot cycle plus wrap, one asset request/resident set, stable texture versions, runnable programs, 163 receivers, no runtime depth render target. Asset-abort fallback passed.
- Independent wall ray/depth audit for presets 0/5/11: mobile 94.88% / 94.44% / 95.87%; desktop 95.19% / 95.00% / 96.04%. Finite texel/edge error remains, especially small mobile geometry; this is projected depth, not per-object lightmaps.
- Both asset sets passed source-hash, PNG-hash, resolution and preset checks; six focused JS tests passed.

## Receiver visual evidence

`artifacts/shadow-receiver/legacy-{0,1,2}.png` reintroduces only the original absolute derivative threshold in the current runtime. `fixed-{0,1,2}.png` uses the correction. Three sunny, navigation-valid viewpoints include translation and rotation. Legacy shows near-camera self-shadow bands with a hard screen-aligned boundary; corrected images remove them while leaving distant world shadows unchanged. Pixel differences begin at rows 446 / 440 / 446 of the 800-pixel images; near-ground luminance changes from 63.31→71.94, 61.64→68.93, 63.38→71.94. The test asserts these differences instead of merely taking screenshots.

Mobile spawn/down/moved/photo screenshots and raw report are under `artifacts/mobile-shadow-startup/`. Multi-preset reports/screenshots are in `artifacts/baked-shadows/` and `artifacts/baked-shadows-mobile/`.

## Limits / unrelated failures

No physical phone was connected. Fast-local emulation did not reproduce an indefinite stall without network delay; real handset GPU behavior remains to be checked. No commit or deployment was performed.

Full `node --test tests/*.test.cjs` also exposed unrelated existing failures in auth fallback, spatial-player CSS marker and three minimap assertions. These files/behaviors were not changed by this shadow fix. The lighting test's old TextureLoader source-string assertion was updated for the bounded fetch path and passes again.
