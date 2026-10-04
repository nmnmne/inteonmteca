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

Email login requires configured SMTP. Without SMTP, the server now refuses login
instead of returning a code that lets anyone impersonate an email address.
For an explicitly local demo only, set `INTEONMTECA_DEV=1` before starting the server.
Never enable that flag or `INTEONMTECA_DIRECT_CODE=1` on a public server.
Opening `index.html` directly retains a browser-local demo; it is not a shared account or chat.

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
Object-storage publication alone does **not** deploy the shared chat/login backend.
