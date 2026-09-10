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

The current mode displays the one-time code inside the login panel after an
email-shaped address is entered. To send real mail later, copy
`server/.env.example` to `server/.env`, fill in SMTP, and keep
`INTEONMTECA_DIRECT_CODE=0`.
