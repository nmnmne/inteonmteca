# Astra brief: inhabited retro-future listening room

## Objective

Rebuild the home/listening page as a wide, useful, inhabitable virtual music room. Combine the early-2000s idea of cyberspace (simple geometry, sparse green terminal symbols, black void, perspective lines) with present-day VR material language (optical glass, worn metal, damp stone, subtle refraction). It should feel ancient, occupied and persistent, not like a dashboard or a mockup.

## What the user explicitly wants

- Keep the good current structure and all working behavior.
- Restore the depth that was present before the current uncommitted visual layer.
- Make the useful site substantially wider on desktop.
- Keep the yard as it is now. Do not edit anything under `yard/`.
- Do not change any existing text, SEO, structured data, track data or labels.
- Do not commit, publish or deploy.

## Protected behavior

Do not modify `script.js`, `track-play.js`, `playback-link.js`, `street-return.js`, playlist data or tests. Preserve playback, endless playlist navigation, keyboard/touch behavior, active player, theme/chat/auth controls, animated logo, mobile static mode and the street handoff exactly as they work now.

The intended edit surface is `index.html`, `styles.css` and `home-player.css`. Prefer keeping the current DOM and rebuilding the visual system in CSS. Small semantic wrappers/classes in `index.html` are acceptable, but existing text and IDs must not change.

## Sources to compare

- Current recoverable snapshot: `.hermes/plans/2026-10-05-home-astra-redesign/start/`
- Current desktop screenshot: `C:/Users/user/AppData/Local/Temp/inteon-vr-review-20261005-170331/1440-initial.png`
- Current mobile screenshot: `C:/Users/user/AppData/Local/Temp/inteon-vr-review-20261005-170331/390-initial.png`
- Earlier visual reference: `.hermes/plans/2026-10-04-vr-player/reference.png`
- Committed pre-redesign HTML/CSS are also copied into the new snapshot as `index.HEAD.html` and `styles.HEAD.css`.

Use the reference for spatial hierarchy, width and depth, not for inventing controls, copy, albums or metadata. Keep the real current interface and data.

## Visual direction

- Desktop composition should use nearly the full viewport width, with roughly 32-64 px breathing room rather than a narrow centered card.
- Build a credible room: foreground console/player, middle-distance catalog glass plane, background architecture and floor perspective. These layers must read at a glance.
- The playlist is the primary useful surface. Make it wider and calmer, with high information density and clear active/hover states.
- Keep the player anchored low as a physical console, but not as an oversized opaque rectangle. Let the room remain visible through controlled glass.
- Use thin structural lines, restrained reflections, local edge light, deliberate asymmetry and sparse monospaced system markings.
- Early Matrix cues must be rare and architectural: tiny green glyph traces, terminal ticks, coordinates, scan seams. No green rain, no hacker cliché, no neon overload.
- Modern cues: layered glass thickness, subtle blur only where useful, material edges, refraction-like color separation, soft specular highlights.
- Avoid card soup, rounded SaaS panels, giant empty margins, acid cyberpunk, dense particles, excessive glow, fake 3D controls or unreadable microtype.
- Preserve or improve the sense that the place existed before the visitor and continues after them.
- Keep the current background asset unless the composition can be improved without generating another image. Do not use WebGL for the room background.

## Responsive behavior

- Desktop at 1440x900 and 1920x1080: wide room, playlist and player fully useful without visual dead zones.
- Tablet at 768x1024 and narrow desktop around 800 px: deliberate transition, no accidental overlap.
- Mobile at 390x844 and 320x740: retain depth and identity, but prioritize touch, readable rows and a compact player. No horizontal overflow.
- Preserve reduced-motion and current mobile static rendering behavior.

## Validation

Before finishing:

1. Run focused existing home/player tests and `git diff --check`.
2. Use the existing browser QA scripts or Playwright for desktop and mobile screenshots.
3. Inspect the screenshots visually, not just JSON output.
4. Confirm no files under `yard/` and no protected JS files changed during this task.
5. Leave a concise report in `.hermes/plans/2026-10-05-home-astra-redesign/ASTRA_REPORT.md` with files changed, tests, screenshots and remaining caveats.

Do the implementation now; do not stop at recommendations.

## Mandatory second-pass correction

The first Astra pass is not acceptable as a final design. Its screenshot is `tests/artifacts/home-synthesis/first-1440x900.png`.

- It became a flat monochrome green terminal page. The request is a fusion, not a replacement of modern VR by retro Matrix styling.
- It removed the photographic `room-scene`, which destroyed material depth. Restore the existing desktop/mobile room picture and use it as the modern physical layer.
- It made the wordmark enormous and dominant. Return it to an architectural object in the room rather than a full-width masthead.
- Keep the useful width and calmer denser playlist gained in the first pass.
- Base palette should again be cold charcoal/slate/optical glass. Green phosphor is a sparse signal accent (roughly 5-10% of the image), never a global wash.
- Bring back transparent glass thickness, silver-blue edges and visible near/middle/far planes. The player and catalogue should feel embedded in the scene.
- Default theme must remain `slate`; existing theme controls can still change the palette.
- `script.js` has already been restored. Do not modify any JavaScript under any circumstance.
- Edit only `index.html` and `home-player.css` for this correction.

Make this correction before running another visual review. The corrected desktop should feel closer to `reference.png` in depth and material quality while keeping the real current DOM and data.
