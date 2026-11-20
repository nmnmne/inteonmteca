# inteonmteca

The home page combines the original `inteonmteca` listening room, animated wordmark, themes and chat with a two-deck DJ mixer. A pedestrian explores the courtyard behind the controls. The background has no keyboard or pointer controls. Reduced motion shows a still view of the courtyard.

## Structure

- `index.html` opens the decks and mixer in the room's former playlist area. Press **F** or the fullscreen button to expand the console. Load a track via its **A** or **B** library button, or drag it onto a deck.
- Deck A opens with **Echoes Resurface** and B with **High Stage Of Reality**. **Треки** opens the browser on that deck. Use ↑/↓ to select, Enter or **Загрузить** to load, and Escape or **Назад** to return. Each deck has its own list for all tracks, favourites and imports. Loading resets the controls on that deck while preserving the shared crossfader.
- **Скретч** is active on both digital jog wheels. Hold and turn the top surface with a mouse or finger to scratch, or use the ribbed rim to nudge the beat. One turn corresponds to 1.8 seconds. The central display shows time in scratch mode and the adjustment in **Подгонка** or **Темп** mode. Use the waveform or full-track position strip to seek. Use **SYNC** to align beats and the **−** and **+** keys next to **Loop** to halve or double the loop length.
- Catalogue scratches read short, seekable stereo PCM regions prepared from each normalized master. Browser imports use their own audio. Large compressed imports keep a rolling window of roughly 12 seconds of played sound. Play the desired passage first when the deck asks for it.
- Enable **CUT** by the crossfader for a short cut-in distance. Hold **Z** to cut deck A or **M** to cut deck B while using the mouse on the record. The physical and touchscreen crossfaders stay active. **Запись микса** includes the scratches and cuts in the stereo master.
- `dj-engine.js` contains playback, cue points, beat loops, channel processing, pre-fader headphones and the recording bus.
- `dj-decks.js` and `dj-studio.js` provide the instruments, library and keyboard controls. Audio settings include Tap BPM, manual beat-grid correction and MIDI Learn.
- **Импорт** stores local files and their loudness measurements in the browser. The deck applies a separate gain adjustment before channel processing, targeting −14 LUFS while preserving peak headroom. When a compressed file exceeds the browser's analysis budget, playback uses adaptive gain. **Избранное** and cue points are saved on this device.
- **Фонотека → Мастеры** downloads the processed stereo FLAC or the 12-channel WavPack for each catalogue track. The default speaker setting uses discrete 7.1.4 when the system output exposes at least 12 channels. On a stereo device it plays in stereo and switches automatically when a 12-channel output becomes available. Audio settings show the active route, offer individual speaker checks and remember a manual stereo or headphone selection. The spatial mixes are upmixes of the stereo programme.
- `listening-room.html` hosts the original player, themes and chat.

## Run

Double-click `start-site.cmd`, or run:

```bash
python server/app.py
```

Then open `http://127.0.0.1:8080/`. This mode is required for email login,
the database, chat, byte-range audio streaming, and live media-folder refresh.
Serve the studio over HTTP so browser audio processing can access the streamed tracks.

Old links to `yard/` return to the DJ console. The background loads its scene
directly and shows a photograph of the courtyard when WebGL is unavailable.

The default loopback development server shows a guest login code on screen;
SMTP is not required. Its SQLite chat is shared between clients of this development
server and is separate from the public site's chat. Start it with `start-site.cmd`
or `python server/app.py`, not `python -m http.server` (which has no login API).
In production mode, this Python server requires SMTP and does not expose codes.
For an explicitly local demo only, `INTEONMTECA_DEV=1` also enables screen codes.
Never enable that flag or `INTEONMTECA_DIRECT_CODE=1` on a public server.
Opening `listening-room.html` directly runs the legacy browser-local demo.

With Python, NumPy, FFmpeg and FFprobe installed, the local server watches `media/`. Add a FLAC, WAV, MP3, M4A, OGG, Opus or AAC file there. After the file finishes copying, the server prepares the normalized 24-bit stereo FLAC, discrete 7.1.4 WavPack, waveform, beat grid and key estimate. The completed track appears on the next page load. Original files stay in `media/`. The output target is −14 LUFS integrated with a −1 dBTP ceiling. To prepare the same catalogue manually from the project root, run:

```bash
python tools/prepare_dj_library.py
```

## Release checks

```bash
python -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.cjs
python tests/dj-engine_browser.py
python tests/dj-scratch_browser.py
python tests/dj-vinyl_browser.py http://127.0.0.1:8080/
python tests/dj-spatial_browser.py
python tests/browser_import_loudness.py
python tests/dj-studio_browser.py http://127.0.0.1:8080/
node --check dj-studio.js
git diff --check
```

The browser checks need Playwright and Microsoft Edge. Against a **local test server**:

```bash
python tests/browser_release.py http://127.0.0.1:8080/
```

They exercise responsive chat, keyboard focus, playback, themes, the 3D yard,
and the no-WebGL fallback. Synthetic chat fixtures stay inside the test browser;
no messages are submitted to the server. Screenshots are saved under the system
temporary directory, `inteon-release-qa`.

See [release verification](docs/release-check.md) and
[production deployment requirements](docs/release-deployment.md).
The public site uses a shared guest chat at `https://api.inteonmteca.online`:
API Gateway → Cloud Function (`server/cloud/index.py`) → persistent YDB.
Guest codes appear on screen and are also sent through Yandex Postbox. For the
moderator address, a separate email-only code grants message deletion; the
screen code grants only guest access. Email
failure is silent and never blocks the screen code. This guest flow does not
verify ownership of the email address. Public messages contain only the part
before `@`, never the full address.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-chat.ps1`
to update the existing backend, then `deploy-site.ps1` to publish the frontend.
Local HTML keeps same-origin API access for the Python development server.
See [shared chat operations](docs/shared-chat.md). Object-storage publication
alone does **not** update the backend.

## Production bundle (optional)

`tools/build-bundle.mjs` combines the studio stylesheets and deferred scripts into `site.bundle.css` and `site.bundle.js`. Install the optional build dependencies with:

```bash
npm install
```

After that `deploy-site.ps1` bundles automatically. Without Node or `npm install`
it prints a notice and publishes the individual files exactly as before. To look at
the bundled page locally: `npm run build:bundle`, then open `index.bundled.html`
through the dev server. `site.bundle.*`, `index.bundled.html` and `node_modules/`
are git-ignored build output. `tests/site-bundle.test.cjs` checks the bundle and is
skipped until `npm install` has been run.

A script made only of expression statements (an IIFE, `window.x = ...`) is wrapped in
`try/catch` inside the bundle, so a failing file cannot stop the ones after it, as
with separate tags. `script.js` has top-level declarations and stays bare.

## Pointer effects

`pointer-life.js` / `pointer-life.css` add a soft aura that follows a mouse (desktop
only) and short rings on taps and when a track starts. Both are event-driven: nothing
is scheduled while the visitor is idle, at most four rings exist at once, and both are
removed by `prefers-reduced-motion` and by the low graphics tier. Strength: the two
`rgba(..., .17)` / `.07` stops in `.pointer-aura`; ring size: `--ring-scale`.
