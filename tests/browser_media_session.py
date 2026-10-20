"""Exercise native Media Session metadata and registered remote actions in Edge.

Actions are dispatched without user activation through CDP. This does not emulate
Bluetooth hardware; actual audio playback, track routing and session state are real.
"""
import argparse
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import wave
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.app import Store, make_handler

parser = argparse.ArgumentParser()
parser.add_argument("--base-url")
args = parser.parse_args()
with io.BytesIO() as buffer:
    with wave.open(buffer, "wb") as fixture:
        fixture.setnchannels(1)
        fixture.setsampwidth(2)
        fixture.setframerate(8000)
        fixture.writeframes(b"\0\0" * 8000)
    short_audio = buffer.getvalue()
server = store = scratch = None
if args.base_url:
    base = args.base_url.rstrip("/")
else:
    scratch = tempfile.TemporaryDirectory()
    store = Store(Path(scratch.name) / "test.db")
    os.environ["INTEONMTECA_QUIET"] = "1"

    class Handler(make_handler(ROOT, store, None)):
        def do_GET(self):
            try:
                super().do_GET()
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        for mobile in (False, True):
            context = browser.new_context(
                viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                is_mobile=mobile, has_touch=mobile,
            )
            context.add_init_script("""window.mediaActions = {};
                const native = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
                navigator.mediaSession.setActionHandler = (action, handler) => {
                    native(action, handler);
                    window.mediaActions[action] = handler;
                };
            """)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            cdp = context.new_cdp_session(page)

            def action(name, details=None):
                result = cdp.send("Runtime.evaluate", {
                    "expression": f"window.mediaActions[{json.dumps(name)}]({json.dumps(details or {})})",
                    "userGesture": False,
                })
                assert "exceptionDetails" not in result, result

            def wait(expression):
                try:
                    page.wait_for_function(expression, timeout=30000)
                except Exception:
                    print(page.evaluate("""(() => { const a = document.querySelector('#album-player');
                        return {title:navigator.mediaSession.metadata?.title, src:a.currentSrc,
                            time:a.currentTime, duration:a.duration, paused:a.paused, ended:a.ended,
                            ready:a.readyState, seeking:a.seeking, saved:inteonPlayback.read()}; })()"""), flush=True)
                    raise

            def title():
                return page.evaluate("navigator.mediaSession.metadata.title")

            playing = """(() => { const a = document.querySelector('#album-player');
                const saved = inteonPlayback.read();
                return !a.paused && !a.seeking && a.readyState >= 3 && a.currentTime > 0
                    && a.currentSrc === a.src && saved?.title === navigator.mediaSession.metadata?.title;
            })()"""
            for route in ("/", "/yard/"):
                page.goto(base + route, wait_until="domcontentloaded")
                if route == "/":
                    page.locator(".track-select").first.click()
                else:
                    wait("!!window.__yard && !!window.mediaActions.play")
                    action("play")
                wait(playing)
                wait("navigator.mediaSession.playbackState === 'playing'")
                initial = title()
                assert page.evaluate("navigator.mediaSession.metadata.artist")
                assert page.evaluate("navigator.mediaSession.metadata.title === inteonPlayback.read().title")
                action("pause")
                wait("document.querySelector('#album-player').paused && navigator.mediaSession.playbackState === 'paused'")
                assert not page.evaluate("inteonPlayback.read().playingIntent")
                action("seekto", {"seekTime": 20})
                wait("Math.abs(document.querySelector('#album-player').currentTime - 20) < 1")
                action("seekbackward", {"seekOffset": 5})
                wait("Math.abs(document.querySelector('#album-player').currentTime - 15) < 1")
                action("seekforward", {"seekOffset": 10})
                wait("Math.abs(document.querySelector('#album-player').currentTime - 25) < 1")
                action("play")
                wait("!document.querySelector('#album-player').paused && navigator.mediaSession.playbackState === 'playing'")
                wait("inteonPlayback.read().playingIntent")
                action("nexttrack")
                wait(f"navigator.mediaSession.metadata.title !== {json.dumps(initial)} && ({playing})")
                action("previoustrack")
                wait(f"navigator.mediaSession.metadata.title === {json.dumps(initial)} && ({playing})")
                # Real ended event using a one-second fixture, avoiding a full FLAC
                # download just to seek to its final frame. Earlier checks use real tracks.
                fixture_url = page.evaluate("document.querySelector('#album-player').src")
                page.route(fixture_url, lambda route: route.fulfill(body=short_audio, content_type="audio/wav"))
                page.evaluate("document.querySelector('#album-player').load()")
                action("play")
                wait(f"navigator.mediaSession.metadata.title !== {json.dumps(initial)} && ({playing})")
                page.unroute(fixture_url)
                action("stop")
                wait("document.querySelector('#album-player').paused && document.querySelector('#album-player').currentTime < 1")
                assert not page.evaluate("inteonPlayback.read().playingIntent")
                print(json.dumps({"base": base, "mobile": mobile, "route": route,
                    "metadata": True, "remoteTransport": True, "seek": True,
                    "automaticNextWithShortAudio": True, "stop": True, "pageErrors": errors}), flush=True)
                assert not errors, errors
            context.close()
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
        store.close()
        scratch.cleanup()
