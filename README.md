# inteonmteca

Minimal mysterious landing page for the `inteonmteca` music label — [inteonmteca.online](https://inteonmteca.online).

## Structure

- `index.html` - single-page layout
- `styles.css` - visual system, atmosphere, responsive styling
- `script.js` - small ambient interactions
- `assets/logo-inteonmteca.svg` - refined vector logo mark

## Run

Double-click `start-site.cmd`, or run:

```bash
python server/app.py
```

Then open `http://127.0.0.1:8080/`. This mode is required for email login,
the database, chat, byte-range audio streaming, and live media-folder refresh.
Opening `index.html` directly still plays the generated bundled playlist, but a
browser page cannot start the Python account server by itself.

Local startup enables the yard's development pose panel automatically. It copies
position in meters, yaw/pitch in radians, and the world-space look direction.
Use `python server/app.py --production` or `INTEONMTECA_ENV=production` on a server
to disable debugging. Static deployment removes the development panel script
from the published yard page.

The default loopback development server shows a guest login code on screen;
SMTP is not required. Its SQLite chat is shared between clients of this development
server and is separate from the public site's chat. Start it with `start-site.cmd`
or `python server/app.py`, not `python -m http.server` (which has no login API).
In production mode, this Python server requires SMTP and does not expose codes.
For an explicitly local demo only, `INTEONMTECA_DEV=1` also enables screen codes.
Never enable that flag or `INTEONMTECA_DIRECT_CODE=1` on a public server.
Opening `index.html` directly retains a browser-local demo; it is not a shared account or chat.

Track artwork lives in `assets/track-covers/`; `catalog.json` retains its Desktop
source paths and associates each release with a media directory. It also keeps
artwork for releases whose audio is not in the playlist yet. The reviewed import
list is `tools/desktop-cover-sources.json`. To refresh it (requires Pillow):

```powershell
python tools/import_desktop_covers.py --desktop "$([Environment]::GetFolderPath('Desktop'))"
python tools/generate_playlist.py
```

The catalogue and selected player share the current variant. Artwork advances
after 3.5–7 seconds of visible, loaded display time and completes a set in about
a minute. Hidden tabs and offscreen rows pause it; every variant appears before
the cycle repeats. Original files are never changed by the importer.

## Release checks

```bash
python -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.cjs
node --check script.js
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
