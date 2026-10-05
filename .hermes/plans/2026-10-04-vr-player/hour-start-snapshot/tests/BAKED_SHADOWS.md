# Offline courtyard shadow sets

## What is actually baked

This implementation uses **precomputed projected RGB24 depth textures**, not per-object UV lightmaps or GI irradiance atlases. Each preset stores the nearest actual scene surface seen from the sun, plus its exact world-to-light texture matrix. The build uses `createYardScene()` and real mesh/instance transforms: 162 caster mesh objects representing 5,974 instances/ordinary meshes. Runtime attaches the selected texture to 163 receiver mesh objects, including courtyard/exterior ground, facades, pitched/flat roofs, windows, balconies, utility structures, pipes, playground and trees. Decorative sky/grid and the music logo are excluded. The enormous movable outside plane receives inside the light frustum but does not enlarge the caster bounds.

No scene traversal for occlusion, render-to-texture, shadow-map pass, Canvas shadow painting, or baking happens at entrance or during frames. Runtime shader code samples the already-built depth (nine nearest comparisons with receiver-plane correction) and attenuates direct sunlight; ambient/hemisphere light remains. Basic physical signage gets a bounded brightness attenuation. Normal material lighting is still realtime, as before. Three's shadow-map system remains disabled.

A per-object lightmap route would require unique UV2 atlases (including distinct UV regions for thousands of instances), de-instancing or additional instance attributes, and substantially different material batching. Projected depth was chosen to preserve the existing instancing and cover all assembled geometry without fabricated silhouettes.

## Reference and lifecycle

Unchanged reference: 20 April 2026, Asia/Oral; origin 51.230186 N, 51.439256 E, X-east/Y-up/Z-south. Existing fixed-declination solar rotation is retained, not the current wall clock. Twelve slots, 16:20 through 20:00 in 20-minute increments, wrap to 16:20. A chosen sun vector is checked against the asset before use; the same preset drives sky/fog/lights. Exactly one depth PNG is loaded for the active scene. No other preset is prefetched. A failed asset load exposes the ordinary-player fallback instead of silently producing live or ground-only shadows.

## Reproduce

Requires Python Pillow + Playwright and installed Microsoft Edge:

```
python tools/bake_yard_shadows.py
python tests/test_baked_shadow_assets.py
node --test tests/yard-lighting.test.cjs tests/yard-lighting-cycle.test.cjs
python tests/browser_baked_shadows.py
python tests/browser_yard_lighting.py
```

Baker starts its own loopback HTTP server, renders only offline in Edge, packs depth into opaque RGB24, flips GL bottom-up rows explicitly, exports lossless PNGs and records source/asset SHA256 hashes. Two consecutive runs produced identical byte sizes for all presets. Source-hash tests detect geometry/lighting changes requiring a rebake. Rebuild after scene geometry, model/instancing, layout or solar changes. Do not resize, color-convert, recompress lossily, or optimize these images through an image CDN.

## Measured results

- 12 PNGs, each 4096x4096. Total 16,730,835 bytes; selected file 886,691–1,788,980 bytes.
- Active GPU texture allocation budget: 67,108,864 bytes (64 MiB), no mipmaps; decoded CPU image memory is additional. This is not a low-memory mobile lightmap implementation.
- Projected texel size varies with the sun: approximately 7.4–9.5 cm on the horizontal texture axis; the second axis varies with altitude. Very thin rails/pipes can therefore alias or vanish as casters.
- Latest local-loopback browser resource durations were 0.7–13 ms. These are local transfer observations, NOT internet/mobile performance promises; texture decode/upload and shader costs are additional.
- Real browser verified 13 entrances, every slot + wrap, exactly one PNG resource per page, 163 receivers, fixed texture version, disabled shadow maps, default framebuffer rendering and no shader/page errors.
- Existing browser entrance regression also passed home/yard navigation, synthetic BFCache restoration, visibility changes and blocked localStorage.
- Independent exact mesh ray intersections versus nearest baked texel depth at facade samples: 1523/1600 (95.19%) at 16:20; 2736/2880 (95.00%) at 18:00; 2766/2880 (96.04%) at 20:00. These are not claims of exact ray-traced quality: finite texels, 18 mm receiver bias and silhouette edges account for approximation, and the test accepts >94% agreement.
- Screenshots inspected from normal spawn/photo/playground and navigation-valid exterior wall viewpoints. `00-wall-1.png` shows balcony shadows on facade; `05-wall-1.png` shows long slanted balcony shadows; `11-wall-0.png` shows a large building occlusion boundary across a facade. All are in `tests/artifacts/baked-shadows/`, with resource/audit details in `report.json`.
- Lighting-specific tests pass. Full Node suite: 54/58 pass; failures outside this lighting work are account-backend fallback and three existing minimap expectations (heading-up/frame cadence). Those features were not changed here.

## Deployment handoff

No publish or commit performed. Deploy the modified lighting modules and **all of `yard/data/shadows/` including manifest and twelve PNGs** together. Preserve the other agents' dirty changes. Tools/tests/evidence need not be public. Current missing-asset behavior intentionally fails the 3D view rather than substitutes unbaked lighting.
