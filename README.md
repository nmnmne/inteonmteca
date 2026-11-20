# inteonmteca

The home page combines the original `inteonmteca` listening room, animated wordmark, themes and chat with a two-deck DJ mixer. The camera sees the courtyard of 14 Zhdanova Street, Uralsk, through the eyes of the lead crow in a flock of 13. Two neighbouring flocks of three forage nearby. When two neighbours challenge each other, older birds from the home flock fly in and split them up. The rivals then keep the peace for a while. After landing, the lead bird chooses how many companions to recruit and waits for them to gather before taking off. Other birds can peel away and forage with newly chosen elders. The wall at the starting point echoes the header's wordmark effects. Flying through a facade reveals its digital interior. At the map boundary a three-dimensional city appears, giving way to sparse, pulsing lines as the camera crosses it. Reduced motion shows a still view of the courtyard.

## Structure

- `index.html` opens a compact player between two narrow panels overlooking the live courtyard. Expand the player to use both decks and the mixer. Each full deck has one display with a waveform above four rows of its searchable playlist. Drag a track from either list onto the desired deck.
- Deck A opens with **Матт — Memphis** and deck B with **Матт — Виртуальная реальность**. At the listener’s local midnight, deck A returns to Memphis. During playback, scratching or recording, the reset waits until the mix is idle.
- Minimize the player to keep the mix playing over the courtyard, or close it to stop playback. The desktop dock reopens the player or launches Eng-Rus, which cycles through 48 English phrases and their Russian translations. Idle desktop panels retract after 20 seconds.
- Use ↑/↓ to select a track, then Enter or **Загрузить** to load it. Both lists stay open during playback. Each has independent search, sorting and filters for all tracks, favourites and imports. Mark the selected track with the star. Loading resets the controls on that deck while preserving the shared crossfader.
- **Скретч** is active on both digital jog wheels. Hold and turn the top surface with a mouse or finger to scratch, or use the ribbed rim to nudge the beat. One turn corresponds to 1.8 seconds. The central display shows time in scratch mode and the adjustment in **Подгонка** or **Темп** mode. Tap or drag the waveform to seek anywhere at 1×. Zoom to 2×, 4× or 8× for finer placement. On the waveform, use ←/→ to move one beat, or hold Shift for an eighth of a beat. Use **SYNC** to align beats and the **−** and **+** keys next to **Loop** to halve or double the loop length.
- Catalogue scratches read short, seekable stereo PCM regions prepared from each normalized master. Browser imports use their own audio. Large compressed imports keep a rolling window of roughly 12 seconds of played sound. Play the desired passage first when the deck asks for it.
- Enable **CUT** by the crossfader for a short cut-in distance. Hold **Z** to cut deck A or **M** to cut deck B while using the mouse on the record. The physical and touchscreen crossfaders stay active. **Запись микса** includes the scratches and cuts in the stereo master.
- `dj-engine.js` contains playback, cue points, beat loops, channel processing, pre-fader headphones and the recording bus.
- `dj-decks.js` and `dj-studio.js` provide the instruments, library and keyboard controls. Audio settings include Tap BPM, manual beat-grid correction and MIDI Learn.
- Drop one or more audio files on either deck or the mixer, or select them with **Импорт**. The browser analyzes the audio locally and stores the original files and measurements in IndexedDB. Imports appear in both playlists and survive a reload. Choose a track to load it onto a deck. The deck applies a gain adjustment before channel processing, targeting −14 LUFS while preserving peak headroom. When a compressed file exceeds the browser's analysis budget, playback uses adaptive gain. **Избранное** and cue points are saved on this device.
- **Мастеры** downloads the processed stereo FLAC or the 12-channel WavPack for each catalogue track. The default 7.1.4 mix keeps the original left and right programme in front. On a 12-channel output each speaker receives its own feed. On smaller outputs the player folds the missing speakers into the available channels, including stereo and mono, and adapts when the output device changes. Audio settings show the active route, offer individual speaker checks and remember a manual stereo or headphone selection. The spatial mixes are upmixes of the stereo programme.
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
directly and shows a rendered still of the courtyard when WebGL is unavailable.

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

On devices with a mouse, `pointer-life.js` and `pointer-life.css` draw an inertial ink spot.
It drifts in a slow current and occasionally leans towards the moving pointer. Drag damps
each impulse. While visible, it displays a newly generated eight-digit code each second.
The low graphics tiers keep a smaller spot.
Touch uses the existing tap response, and reduced motion turns off the moving ink.

## Courtyard wall inscriptions

To save the current handwriting in slot 0, run this in the browser console with the live courtyard open.
The snapshot holds the painted fragments (`inkChunks`), their stage of mistranslation (`pass`),
and an approximate transcription (`chunks`). Its ordering key separates the two lyric fragments.
The transcription loses punctuation, case, some inner vowels and repeated letters.

```js
const {readWallInscription} = await import('/yard/wall-inscriptions.js');
const snapshot = readWallInscription(0);
const {separateWallPhrase} = await import('/yard/wall-ink-codec.js');
if (snapshot) console.log(separateWallPhrase(snapshot.chunks, snapshot.key));
```

Copy the result of `JSON.stringify(snapshot)` to keep that sample after leaving the page.
