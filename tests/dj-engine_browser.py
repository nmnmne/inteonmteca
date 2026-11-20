"""Exercise the DJ signal path and transport with two native, seekable audio files."""
import base64
import io
import math
import os
import struct
import wave
from pathlib import Path

from playwright.sync_api import sync_playwright


def tone(frequency):
    rate = 22050
    with io.BytesIO() as buffer:
        with wave.open(buffer, "wb") as wav:
            wav.setparams((1, 2, rate, 0, "NONE", ""))
            samples = (round(14500 * math.sin(2 * math.pi * frequency * i / rate)) for i in range(16 * rate))
            wav.writeframes(struct.pack("<" + "h" * (16 * rate), *samples))
        return base64.b64encode(buffer.getvalue()).decode("ascii")


def exercise(page):
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    script = (Path(__file__).resolve().parents[1] / "dj-engine.js").read_bytes()
    page.route("http://localhost/dj-engine.js", lambda r: r.fulfill(content_type="text/javascript;charset=utf-8", body=script))
    page.route("http://localhost/test", lambda r: r.fulfill(body="""<!doctype html><meta charset=utf-8>
        <button onclick="DJEngine.toggle('A'); DJEngine.toggle('B')">Play both</button>
        <script src="/dj-engine.js"></script>""", content_type="text/html"))
    page.goto("http://localhost/test")
    page.evaluate("""waves => {
      window.engine = DJEngine;
      window.reported = [];
      window.addEventListener('dj-error', e => reported.push(e.detail));
      window.addEventListener('dj-recorded', e => window.recorded = e.detail);
      window.tracks = waves.map((data,i) => {
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        return {id:'test'+i, title:'Tone '+i, bpm:i ? 100 : 120, offset:0,
          src:URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}))};
      });
      engine.load('A',tracks[0]); engine.load('B',tracks[1]);
    }""", [tone(180), tone(3200)])
    page.wait_for_function("engine.snapshot().A.duration === 16 && engine.snapshot().B.duration === 16")
    page.get_by_text("Play both").click()
    page.wait_for_function("engine.snapshot().A.time > .15 && engine.snapshot().B.time > .15 && engine.snapshot().meters.left > .1")

    # The tempo/phase of the playing reference deck also applies to a paused target.
    page.evaluate("""() => {
      engine.toggle('A'); engine.toggle('B');
      engine.seek('A',3.25); engine.seek('B',5.45);
      engine.setKeyLock('B',false); engine.sync('B');
    }""")
    b = page.evaluate("engine.snapshot().B")
    assert abs(b["bpm"] - 120) < .001 and abs(b["time"] - 5.7) < .005 and not b["keyLock"], b
    page.evaluate("() => {engine.setBPM('B',60); engine.sync('B')}")
    assert abs(page.evaluate("engine.snapshot().B.bpm") - 60) < .001
    page.evaluate("() => {engine.setBPM('A',75); engine.setBPM('B',150); engine.sync('B')}")
    assert page.evaluate("engine.snapshot().B.bpm === 150 && engine.snapshot().B.tempo === 0")
    page.evaluate("engine.setBPM('A',120)")
    page.evaluate("() => {engine.setBPM('B',10); engine.sync('B')}")
    assert page.evaluate("reported.pop().id === 'B' && engine.snapshot().B.bpm === 10")
    page.evaluate("() => {engine.setBPM('B',100); engine.setTempo('B',0)}")

    # Aborted play promises from the previous load must never pause its replacement.
    page.evaluate("""() => {
      engine.toggle('A'); engine.toggle('A'); engine.toggle('A');
      engine.load('A',tracks[0]); engine.seek('A',1.2);
      engine.setCue('A'); engine.hotCue('A',1); engine.toggle('A');
    }""")
    page.wait_for_function("engine.snapshot().A.playing && engine.snapshot().A.time > 1.4")
    page.evaluate("engine.cue('A')")
    a = page.evaluate("engine.snapshot().A")
    assert not a["playing"] and abs(a["time"] - 1.2) < .01 and abs(a["hotCues"][0] - 1.2) < .01, a
    page.evaluate("""() => {
      engine.load('A', tracks[0]); engine.seek('A',2.12);
      engine.loop('A',1); engine.toggle('A');
    }""")
    page.wait_for_timeout(1600)
    a = page.evaluate("engine.snapshot().A")
    assert a["playing"] and 2 <= a["time"] < 2.57 and abs(a["hotCues"][0] - 1.2) < .01, a
    page.evaluate("() => {engine.loop('A',0); engine.hotCue('A',1,true); engine.toggle('B'); engine.setCross(-1)}")
    assert page.evaluate("engine.snapshot().A.hotCues[0] === null")

    # A stopped source still has an audible delay tail routed through its own channel.
    page.evaluate("engine.setEcho('A',1)")
    page.wait_for_timeout(850)
    page.evaluate("engine.toggle('A')")
    page.wait_for_timeout(170)
    assert page.evaluate("!engine.snapshot().A.playing && engine.snapshot().meters.left > .06")

    # Loading a record clears even the old delayed samples and scheduled fader moves.
    # B continues playing at the closed end of the shared crossfader.
    page.evaluate("""() => {
      engine.setChannel('A', 0); engine.setCut('A', true); engine.setFilter('A', 1);
      engine.setEQ('A','low',-30); engine.setKeyLock('A',false); engine.setTempo('A', 12);
      engine.load('A', tracks[0]);
    }""")
    page.wait_for_timeout(180)
    reset = page.evaluate("engine.snapshot()")
    assert reset["meters"]["left"] < .002 and reset["B"]["playing"] and reset["cross"] == -1, reset
    assert reset["A"]["channel"] == .8 and reset["A"]["filter"] == reset["A"]["echo"] == 0
    assert reset["A"]["eq"]["low"] == reset["A"]["tempo"] == 0 and reset["A"]["keyLock"]
    page.evaluate("engine.toggle('A')")

    # B keeps playing behind the closed crossfader. Every level below is post-master.
    page.wait_for_function("engine.snapshot().meters.left > .15")
    page.evaluate("engine.setEQ('A','low',-30)")
    page.wait_for_function("engine.snapshot().meters.left < .07")
    page.evaluate("() => {engine.setEQ('A','low',0); engine.setFilter('A',1)}")
    page.wait_for_function("engine.snapshot().meters.left < .01")
    page.evaluate("() => {engine.setFilter('A',0); engine.setChannel('A',0)}")
    page.wait_for_function("engine.snapshot().meters.left < .001")
    page.evaluate("engine.setCross(1)")
    page.wait_for_function("engine.snapshot().meters.left > .15")
    page.evaluate("engine.setMaster(0)")
    page.wait_for_function("engine.snapshot().meters.left < .001")
    page.evaluate("engine.setMaster(1)")
    page.wait_for_function("engine.snapshot().meters.right > .15")

    # A missing track must leave the existing deck usable. An unassigned headphone
    # send or selecting the master device must never duplicate output on the master.
    page.evaluate("engine.load('B',{title:'Missing'})")
    assert page.evaluate("reported.pop().id === 'B' && engine.snapshot().B.track === tracks[1]")
    assert not page.evaluate("engine.setMonitor('B',true)")
    assert page.evaluate("reported.pop().id === 'B'")
    assert not page.evaluate("engine.setMonitorDevice('default')")
    assert page.evaluate("reported.pop().id === null && engine.snapshot().monitorDevice === ''")
    assert page.evaluate("reported.length === 0")

    page.evaluate("engine.toggleRecording()")
    page.wait_for_function("engine.snapshot().recordingSeconds > 1.05")
    with page.expect_download() as download:
        page.evaluate("engine.toggleRecording()")
    assert download.value.suggested_filename.startswith("inteonmteca-mix-")
    decoded = page.evaluate("""async () => {
      const audio = new AudioContext();
      const buffer = await audio.decodeAudioData(await window.recorded.blob.arrayBuffer());
      let peak = 0;
      for (const sample of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
      await audio.close();
      return {length:buffer.duration, peak};
    }""")
    assert decoded["length"] > .8 and decoded["peak"] > .15, decoded
    assert not errors, errors
    print("DJ transport, native audio mixing and downloaded recording passed.", decoded)


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=os.getenv("DJ_TEST_BROWSER", "msedge"), headless=True)
        try:
            exercise(browser.new_page(accept_downloads=True))
        finally:
            browser.close()
