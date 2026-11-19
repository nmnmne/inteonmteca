"""Compare the discrete Web Audio renderer with the FFmpeg release renderer in all 12 channels."""
import base64
import io
from importlib import import_module
import json
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
spatial = import_module("render-dj-spatial")
RATE = 48000
FRAMES = 16000


def stimulus():
    time = np.arange(FRAMES) / RATE
    # Uncorrelated broadband detail, a common bass fundamental and a left-only transient.
    rng = np.random.default_rng(319)
    data = rng.uniform(-0.18, 0.18, (FRAMES, 2))
    data[:, 0] += .22 * np.sin(2 * np.pi * 55 * time) + .17 * np.sin(2 * np.pi * 600 * time)
    data[:, 1] += .22 * np.sin(2 * np.pi * 55 * time) + .14 * np.sin(2 * np.pi * 3100 * time)
    data[150, 0] = .8
    return (data * 32768).astype("<i2")


def offline_reference(pcm, preset):
    stream = io.BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setparams((2, 2, RATE, FRAMES, "NONE", ""))
        wav.writeframes(pcm.tobytes())
    graph = spatial.channel_graph(preset, RATE, FRAMES)
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-filter_complex",
                           graph + "[bed]", "-map", "[bed]", "-f", "f32le", "pipe:1"],
                          input=stream.getvalue(), capture_output=True, check=True)
    return np.frombuffer(proc.stdout, "<f4").reshape(FRAMES, 12).T


def exercise(page):
    preset = json.loads((ROOT / "assets/dj-spatial/preset.json").read_text(encoding="utf-8"))
    page.route("http://localhost/test", lambda r: r.fulfill(body="<html><meta charset=utf-8></html>", content_type="text/html"))
    page.route("**/assets/dj-spatial/preset.json*", lambda r: r.fulfill(json=preset))
    page.goto("http://localhost/test")
    page.add_script_tag(path=ROOT / "dj-spatial.js")
    pcm = stimulus()
    reference = offline_reference(pcm, preset)
    encoded = base64.b64encode(pcm.tobytes()).decode("ascii")
    result = page.evaluate("""async ({encoded,rate,frames})=>{
      const settings=await DJSpatial.loadPreset();
      const ctx=new OfflineAudioContext(12,frames,rate);
      const bus=DJSpatial.createBus(ctx,settings);
      const data=new Int16Array(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)).buffer);
      const source=ctx.createBufferSource(), input=ctx.createBuffer(2,frames,rate);
      for(let ch=0;ch<2;ch++){
        const out=input.getChannelData(ch);
        for(let i=0;i<frames;i++)out[i]=data[i*2+ch]/32768;
      }
      source.buffer=input; source.connect(bus.input); bus.output.connect(ctx.destination); source.start();
      const result=await ctx.startRendering();
      const outputs=[];
      for(let ch=0;ch<12;ch++){
        const raw=new Uint8Array(result.getChannelData(ch).buffer);
        let text='';
        for(let i=0;i<raw.length;i+=4096)text+=String.fromCharCode(...raw.subarray(i,i+4096));
        outputs.push(btoa(text));
      }
      bus.dispose();
      return outputs;
    }""",
        {"encoded": encoded, "rate": RATE, "frames": FRAMES})
    rendered = np.stack([np.frombuffer(base64.b64decode(channel), "<f4") for channel in result])
    rms = np.sqrt(np.mean(rendered ** 2, axis=1))
    errors = np.sqrt(np.mean((rendered-reference)**2, axis=1)) / rms
    assert rms.min() > .001 and np.abs(rendered).max() < .9, rms
    assert np.max(errors) < .006, errors
    # Calibration sends must address just one real PCM channel, without a stereo fold-down.
    tests = page.evaluate("""async () => {
      const preset=await DJSpatial.loadPreset();
      const results=[];
      for(let ch=0;ch<12;ch++) {
        const ctx=new OfflineAudioContext(12,24000,48000);
        const bus=DJSpatial.createBus(ctx,preset);
        bus.output.connect(ctx.destination); bus.testChannel(ch,1);
        const audio=await ctx.startRendering();
        results.push(Array.from({length:12},(_,i)=>Math.max(...audio.getChannelData(i))));
        bus.dispose();
      }
      return results;
    }""")
    for i, row in enumerate(tests):
        assert .059 < row[i] < .061
        assert all(value == 0 for n, value in enumerate(row) if n != i)
    ears = page.evaluate("""async () => {
      const preset=await DJSpatial.loadPreset();
      const probes=[];
      for (const channel of [0,1]) {
        const ctx=new OfflineAudioContext(2,24000,48000);
        const bus=DJSpatial.createBus(ctx,preset,true);
        bus.output.connect(ctx.destination);
        bus.testChannel(channel,1);
        const buffer=await ctx.startRendering();
        probes.push([0,1].map(i=>buffer.getChannelData(i).reduce((sum,x)=>sum+x*x,0)));
        bus.dispose();
      }
      return probes;
    }""")
    left, right = ears
    assert left[0] > left[1] > 0 and right[1] > right[0] > 0, ears
    page.add_script_tag(path=ROOT / "dj-engine.js")
    actual = page.evaluate("""async () => {
      await DJEngine.setOutputLayout('stereo');
      const initial=DJEngine.snapshot();
      const enabled=await DJEngine.setOutputLayout('7.1.4');
      const settled=DJEngine.snapshot();
      const virtual=await DJEngine.setOutputLayout('headphones');
      const headphoneLayout=DJEngine.snapshot().outputLayout;
      await DJEngine.setOutputLayout('stereo');
      return {max:initial.maxOutputChannels,enabled,layout:settled.outputLayout,
              virtual,headphoneLayout,restored:DJEngine.snapshot().outputLayout};
    }""")
    if actual["max"] < 12:
        assert not actual["enabled"] and actual["layout"] == "stereo", actual
    assert actual["virtual"] and actual["headphoneLayout"] == "headphones" and actual["restored"] == "stereo", actual
    print(f"All 12 waveforms matched (worst relative RMS error {max(errors):.5g}). "
          f"Each speaker probe reached only the addressed channel. Physical browser capability: {actual}")


def check_output_hotplug(page):
    # Only the destination capacity and device-change events are simulated.
    # The engine configures a native Web Audio node and builds its usual graph.
    page.add_init_script("""
      window.fixtureChannels = 12;
      window.AudioContext = class extends AudioContext {
        constructor(options) {
          super(options);
          const output = this.createGain();
          output.channelCountMode = 'explicit';
          Object.defineProperty(output, 'maxChannelCount', {get: () => fixtureChannels});
          Object.defineProperty(this, 'destination', {value: output});
          window.fixtureContext = this;
        }
      };
    """)
    page.route("http://localhost/test", lambda r: r.fulfill(content_type="text/html", body="""
      <button onclick="DJEngine.testOutputChannel(0)">Test output</button>
      <script src="/dj-spatial.js"></script><script src="/dj-engine.js"></script>
    """))
    page.route("http://localhost/dj-spatial.js", lambda r: r.fulfill(path=ROOT / "dj-spatial.js"))
    page.route("http://localhost/dj-engine.js", lambda r: r.fulfill(path=ROOT / "dj-engine.js"))
    page.route("**/assets/dj-spatial/preset.json*", lambda r: r.fulfill(path=ROOT / "assets/dj-spatial/preset.json"))

    def expect_route(layout, capacity):
        page.wait_for_function("""([layout,capacity]) => {
          const state = DJEngine.snapshot(), output = fixtureContext.destination;
          const discrete = layout === '7.1.4';
          return state.maxOutputChannels === capacity && state.outputLayout === layout &&
            output.channelCount === (discrete ? 12 : 2) &&
            output.channelInterpretation === (discrete ? 'discrete' : 'speakers');
        }""", arg=[layout, capacity], timeout=5000)

    page.goto("http://localhost/test")
    page.get_by_role("button").click()
    expect_route("7.1.4", 12)
    page.evaluate("fixtureChannels=2; fixtureContext.dispatchEvent(new Event('sinkchange'))")
    expect_route("stereo", 2)
    assert page.evaluate("DJEngine.setOutputLayout('stereo')")
    assert not page.evaluate("DJEngine.setOutputLayout('7.1.4')")
    assert page.evaluate("DJEngine.snapshot().preferredLayout") == "7.1.4"
    expect_route("stereo", 2)
    page.evaluate("fixtureChannels=12; navigator.mediaDevices.dispatchEvent(new Event('devicechange'))")
    expect_route("7.1.4", 12)
    page.evaluate("fixtureChannels=2; fixtureContext.dispatchEvent(new Event('sinkchange'))")
    expect_route("stereo", 2)
    page.reload()
    assert page.evaluate("DJEngine.snapshot().preferredLayout") == "7.1.4"
    page.get_by_role("button").click()
    expect_route("7.1.4", 12)
    print("Discrete 7.1.4 preference survived stereo fallback, device changes and page reload.")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        try:
            exercise(browser.new_page())
            check_output_hotplug(browser.new_page())
        finally:
            browser.close()
