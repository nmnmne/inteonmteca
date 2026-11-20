"""Exercise shared sound controls and measure the actual Web Audio graph."""
import argparse
import array
import io
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import wave

from playwright.sync_api import expect, sync_playwright
from studio_window import open_full_studio


ROOT = Path(__file__).resolve().parents[1]


def check_player_outputs(browser, base, mobile=False):
    # Replace the chosen music with one stable 12 kHz tone. Real media elements,
    # playback gestures and the player's entire signal routing remain in use.
    samples = array.array("h", (round(5200 * math.sin(2 * math.pi * 12000 * i / 48000)) for i in range(48000)))
    stream = io.BytesIO()
    with wave.open(stream, "wb") as out:
        out.setparams((1, 2, 48000, 0, "NONE", ""))
        out.writeframes(samples.tobytes() * 20)
    audio = stream.getvalue()

    def serve_audio(route):
        headers = {"Accept-Ranges": "bytes"}
        match = re.match(r"bytes=(\d+)-(\d*)", route.request.headers.get("range", ""))
        if match:
            start, end = int(match[1]), min(int(match[2] or len(audio) - 1), len(audio) - 1)
            headers["Content-Range"] = f"bytes {start}-{end}/{len(audio)}"
            route.fulfill(body=audio[start:end + 1], status=206, content_type="audio/wav", headers=headers)
        else:
            route.fulfill(body=audio, content_type="audio/wav", headers=headers)

    for path, button in (("", "#deck-a .dd-play"), ("listening-room.html", ".track-select")):
        with browser.new_context(viewport={"width": 390 if mobile else 1440, "height": 844},
                                 has_touch=mobile, is_mobile=mobile, reduced_motion="reduce") as context:
            context.add_init_script("""window.measureOutput = () => 0;
              window.AudioContext = class extends AudioContext {
                constructor(options) {
                  super(options);
                  const output = this.createGain(), meter = this.createAnalyser(), mute = this.createGain();
                  mute.gain.value = 0;
                  output.connect(meter).connect(mute).connect(this.destination);
                  Object.defineProperty(output, 'maxChannelCount', {value:this.destination.maxChannelCount});
                  Object.defineProperty(this, 'destination', {value:output});
                  const samples = new Float32Array(meter.fftSize);
                  window.measureOutput = () => {
                    meter.getFloatTimeDomainData(samples);
                    return Math.sqrt(samples.reduce((sum,x) => sum+x*x,0)/samples.length);
                  };
                }
              };""")
            page = context.new_page()
            page.route(re.compile(r"/[^?]+\.(?:flac|wav|mp3)(?:\?.*)?$"), serve_audio)
            page.goto(base + path, wait_until="domcontentloaded")
            if not path:
                open_full_studio(page)
            assert not page.evaluate("InteonSoundFilter.getSettings().enabled")
            play = page.locator(button).first
            if path == "listening-room.html":
                # The room repeats its playlist. Only one copy of a row is on screen.
                page.wait_for_function("""Array.from(document.querySelectorAll('.track-select')).some(e => {
                  const r=e.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button') === e;
                })""")
                index = page.locator(button).evaluate_all("""list=>list.findIndex(e=>{
                  const r=e.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button') === e;
                })""")
                play = page.locator(button).nth(index)
            (play.tap if mobile else play.click)()
            page.wait_for_function("measureOutput() > .002")
            page.wait_for_timeout(650)
            before = page.evaluate("measureOutput()")
            trigger = page.locator('[data-sound-open]')
            (trigger.tap if mobile else trigger.click)()
            for key in ('treble', 'frequency'):
                control = page.locator('#sound-' + key)
                (control.tap if mobile else control.click)(position={'x': 2, 'y': 12})
            expect(page.locator('#sound-enabled')).to_be_checked()
            page.wait_for_timeout(550)
            attenuated = page.evaluate("measureOutput()")
            switch = page.locator('.sound-switch')
            (switch.tap if mobile else switch.click)()
            expect(page.locator('#sound-enabled')).not_to_be_checked()
            page.wait_for_timeout(550)
            bypass = page.evaluate("measureOutput()")
            change_db = 20 * math.log10(attenuated / before)
            assert -12.5 < change_db < -11.4 and abs(20 * math.log10(bypass / before)) < .4, (path, change_db, bypass)
            print(f"{path or '/'} {'touch' if mobile else 'mouse'} player output: {change_db:.2f} dB at 12 kHz")


def measure_response(page):
    result = page.evaluate("""async () => {
      const fx = window.InteonSoundFilter;
      const initial = fx.getSettings();
      const rate = 48000;
      const frames = rate;
      const measure = async (frequency, peak, patch) => {
        fx.setSettings({enabled:true, frequency:5000, treble:0, bass:0, compression:0, ...patch});
        const context = new OfflineAudioContext(2, frames, rate);
        const source = context.createBufferSource();
        const buffer = context.createBuffer(2, frames, rate);
        for (let ch = 0; ch < 2; ++ch) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < frames; ++i) data[i] = peak * Math.sin(2*Math.PI*frequency*i/rate);
        }
        source.buffer = buffer;
        const disconnect = fx.connect(source, context.destination);
        source.start();
        const rendered = await context.startRendering();
        disconnect();
        const gains = [0, 1].map(channel => {
          let inputPower = 0, outputPower = 0;
          const input = buffer.getChannelData(channel), output = rendered.getChannelData(channel);
          for (let i = frames / 2; i < frames; ++i) {
            inputPower += input[i] ** 2;
            outputPower += output[i] ** 2;
          }
          return 10 * Math.log10(outputPower / inputPower);
        });
        if (Math.abs(gains[0]-gains[1]) > .02) throw Error('Unequal stereo output: '+gains);
        return gains[0];
      };
      try {
        return {
          bypass: await measure(12000, .05, {enabled:false, bass:8, treble:-9, compression:80}),
          flat: await measure(12000, .05, {}),
          darkLow: await measure(60, .05, {treble:-9}),
          darkHigh: await measure(14000, .05, {treble:-9}),
          bright: await measure(14000, .05, {treble:6}),
          bass: await measure(40, .05, {bass:6}),
          lowCorner: await measure(6000, .05, {treble:-10, frequency:3000}),
          highCorner: await measure(6000, .05, {treble:-10, frequency:12000}),
          quiet: await measure(750, .004, {compression:100}),
          loud: await measure(750, .8, {compression:100}),
        };
      } finally {
        fx.setSettings(initial);
      }
    }""")
    assert all(abs(result[key]) < .15 for key in ("bypass", "flat", "darkLow")), result
    assert result["darkHigh"] < -7 and result["bright"] > 4 and result["bass"] > 4, result
    assert result["highCorner"] - result["lowCorner"] > 4, result
    assert result["quiet"] - result["loud"] > 3, result
    print("Web Audio response (dB)", {k: round(v, 2) for k, v in result.items()})


def open_controls(page, base, route):
    page.goto(base + route, wait_until="domcontentloaded")
    if page.locator('#studio').count():
        open_full_studio(page)
    trigger = page.locator("[data-sound-open]")
    expect(trigger).to_be_visible()
    trigger.click()
    panel = page.locator("dialog[open]").filter(has=page.locator("#sound-frequency"))
    expect(panel).to_be_visible()
    return panel


def check_controls(browser, base, home, mobile):
    context = browser.new_context(viewport={"width": 390 if mobile else 1440,
                                            "height": 844 if mobile else 900},
                                  is_mobile=mobile, has_touch=mobile)
    try:
        page = context.new_page()
        panel = open_controls(page, base, home)
        enabled = panel.locator("#sound-enabled")
        enabled.check()
        panel.locator("#sound-preset").select_option("night")
        state = page.evaluate("InteonSoundFilter.getSettings()")
        assert state["enabled"] and state["compression"] > 0 and state["treble"] < 0, state
        expected = {k: state[k] for k in ("frequency", "bass", "treble", "compression")}

        for route in ("listening-room.html", "yard/"):
            panel = open_controls(page, base, route)
            expect(panel.locator("#sound-preset")).to_have_value("night")
            expect(panel.locator("#sound-enabled")).to_be_checked()
            for key, value in expected.items():
                control = panel.locator("#sound-" + key)
                assert float(control.input_value()) == value, (route, key)
                assert control.evaluate("""e => {
                  const b=e.getBoundingClientRect();
                  return b.width>0 && b.left>=0 && b.right<=innerWidth+1;
                }"""), (route, key, mobile)

        # A change in another open tab must reach an already visible control.
        other = context.new_page()
        other_panel = open_controls(other, base, "listening-room.html")
        other_panel.locator("#sound-preset").select_option("flat")
        expect(panel.locator("#sound-preset")).to_have_value("flat")
        treble = other_panel.locator("#sound-treble")
        treble.focus()
        treble.press("ArrowLeft")
        adjusted = float(treble.input_value())
        assert adjusted < 0, adjusted
        expect(panel.locator("#sound-treble")).to_have_value(treble.input_value())
        other_panel.locator("#sound-enabled").uncheck()
        expect(panel.locator("#sound-enabled")).not_to_be_checked()
        panel = open_controls(page, base, home)
        expect(panel.locator("#sound-enabled")).not_to_be_checked()
        assert float(panel.locator("#sound-treble").input_value()) == adjusted
        if not mobile:
            measure_response(page)
        print(f"Controls and persistence on {home or '/'}, room and the yard redirect ({'mobile' if mobile else 'desktop'})")
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("base", nargs="?", default="http://127.0.0.1:8080/")
    parser.add_argument("--bundle", action="store_true", help="Also exercise the production homepage bundle")
    args = parser.parse_args()
    base = args.base.rstrip("/") + "/"
    with tempfile.TemporaryDirectory() as path, sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=os.getenv("DJ_TEST_BROWSER", "msedge"), headless=True,
                                             args=["--enable-unsafe-swiftshader"])
        try:
            check_controls(browser, base, "", mobile=False)
            check_controls(browser, base, "", mobile=True)
            check_player_outputs(browser, base)
            check_player_outputs(browser, base, mobile=True)
            if args.bundle:
                output = Path(path)
                html = output / "index.html"
                subprocess.run(["node", "tools/build-bundle.mjs", "--root", ".", "--html", "index.html",
                                "--out-dir", str(output), "--out-html", str(html)], cwd=ROOT, check=True)
                with browser.new_context() as context:
                    for name, file in (("qa-sound-bundle.html", html), ("site.bundle.js", output / "site.bundle.js"),
                                       ("site.bundle.css", output / "site.bundle.css")):
                        context.route(base + name, lambda route, *, file=file: route.fulfill(path=file))
                    page = context.new_page()
                    panel = open_controls(page, base, "qa-sound-bundle.html")
                    panel.locator("#sound-preset").select_option("night")
                    measure_response(page)
                    print("Production homepage bundle passed")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
