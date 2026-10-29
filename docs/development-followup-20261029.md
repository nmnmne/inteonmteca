# Local follow-up verification

No commit, push or deployment was performed by this implementation task. Existing cover-removal edits and unrelated artifacts were retained. Publication is delegated to the parent task.

## Implemented

- Home/yard diagnostics require a successful same-origin `/api/runtime` response with strict `debug: true`. Static hosting (including localhost), production, failures and malformed responses fail closed. Production Python server returns 404 for the debug scripts. Development starts off each visit/reload.
- Deployment strips marked development scripts from both entry pages, excludes raw debug assets and retires old raw/hashed debug objects. Gzip generation now uses explicit include entries instead of treating an exclusion filename as an included asset. Release tests execute PowerShell in a sandbox with AWS stubbed; no real upload occurs.
- Desktop/fine-pointer playlist rows have 14–26px left padding (20.16px at 1440px). Touch layouts retain their existing 6px padding, verified against the previous CSS without the new rule.
- Search metadata already matched the agreed description and newer Cyrillic title introduced in d1e6694; it was deliberately preserved, not replaced with invented copy. Title: `Интеонмтека — Погрузись в глубину звука`. Canonical: `https://inteonmteca.online/`. Description: `Погрузись в глубину звука. Почувствуй волновую природу мира — музыку, которая остаётся внутри.`
- MediaSession code/handlers were not modified by this follow-up. Real playback of two different tracks verified changing title/artist, unchanged document title and empty artwork. This is browser/API verification, not a physical car test or a guarantee of Yandex's chosen snippet.
- Saved courtyard position resets on local date change and before outing 11, 21, etc. Outing 10 and its reload retain the pose; reload never increments the outing counter. Existing daily visit/duration counter is reused. A stale yard open across midnight cannot write yesterday's position back during periodic/pagehide saving.
- Shared ambient duty cycle is now 5 seconds moving / 2 seconds resting, with JS-derived boundaries and CSS fallbacks/cache versions updated together.
- The white/lime-edge treatment was identified as alternate logo **12, “Лаймовый край”**. Only that treatment receives `brightness(.82)` on its compositing wrapper; other variants, original artwork, geometry and animation logic are unchanged.

## Executed checks

- `python -m unittest discover -s tests -p 'test_*.py'`: **72 passed** after all changes.
- Full Node `--test` run over `tests/*.cjs`: **226 passed, 1 failed**. Only failure is the pre-existing `tests/test_theme_registry.cjs` (expects nine palettes; current registry contains six).
- Focused debug + MediaSession suite: **16 passed**.
- Focused street lifecycle/bonus, ambient and alternate-logo suite: **27 passed**.
- `python tests/browser_dev_debug_metadata.py`: actual static, production and development servers on loopback, home + yard; production script 404s; desktop 1440×900/900×500, touch 768×1024/390×844/844×390; metadata separation with real playback. Passed.
- `python tests/browser_no_track_artwork.py`: real audio playback desktop/portrait/landscape, zero track-art requests/elements, empty system artwork, no page errors/overflow. Passed.
- `python tests/browser_spawn_cadence.py`: real home→yard links, tenth outing/reload, eleventh base spawn, next local day base spawn, stale midnight save prevention; natural running/frozen transitions and public alternate-logo show/hide. Passed.
- JS syntax checks, PowerShell parser and `git diff --check`: passed (Git reports existing LF/CRLF advisories).

## Browser artifacts (outside repository)

- `C:/Users/user/AppData/Local/Temp/inteon-dev-debug-kca8rp9k`: JSON and five viewport screenshots.
- `C:/Users/user/AppData/Local/Temp/inteon-no-artwork-6v93ozwb`: playback evidence.
- `C:/Users/user/AppData/Local/Temp/inteon-spawn-cadence-ftfomhba`: spawn/phase JSON and dimmed variant-12 screenshot.
- Node full output: `C:/Users/user/AppData/Local/Temp/inteon-node-followup.log`.
