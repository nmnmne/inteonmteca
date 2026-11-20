"""Check the legacy 7.1.4 reference and measure adaptive speaker output with native Web Audio."""
import base64
import io
from importlib import import_module
import json
import os
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
    assert actual["enabled"] and actual["layout"] == "7.1.4", actual
    assert actual["virtual"] and actual["headphoneLayout"] == "headphones" and actual["restored"] == "stereo", actual
    print(f"All 12 waveforms matched (worst relative RMS error {max(errors):.5g}). "
          f"Each speaker probe reached only the addressed channel. Physical browser capability: {actual}")


def check_adaptive_buses(page):
    # The index of a calibration tone describes the original 12-stem mix.
    # A physical client can expose any number of discrete slots, including mono.
    results = page.evaluate("""async () => {
      const preset = await DJSpatial.loadPreset();
      const rate = 48000, frames = 12000;
      const amplitude = channel => channel.reduce((sum, x) => sum + x*x, 0) / channel.length;
      const result = [];
      for (let count = 1; count <= 12; count++) {
        const energies = [];
        for (let stem = 0; stem < 12; stem++) {
          const context = new OfflineAudioContext(count, frames, rate);
          const bus = DJSpatial.createBus(context, preset, false, count);
          bus.output.connect(context.destination);
          if (!bus.testChannel(stem, 1)) throw Error('Rejected calibration stem ' + stem);
          const rendered = await context.startRendering();
          energies.push(Array.from({length:count}, (_,i) => amplitude(rendered.getChannelData(i))));
          bus.dispose();
        }

        const context = new OfflineAudioContext(count, frames, rate);
        const bus = DJSpatial.createBus(context, preset, false, count);
        const input = context.createBuffer(2, frames, rate);
        // Distinct positive-phase reference tones reveal a swapped or inverted stereo front.
        const frequencies = [416, 1040];
        for (let side=0; side<2; side++) {
          const samples = input.getChannelData(side);
          for (let i=0; i<frames; i++) samples[i] = .4 * Math.sin(2*Math.PI*frequencies[side]*i/rate)
                                                     + .15 * Math.sin(2*Math.PI*56*i/rate);
        }
        const source = context.createBufferSource();
        source.buffer = input; source.connect(bus.input); bus.output.connect(context.destination);
        source.start();
        const rendered = await context.startRendering();
        const music = Array.from({length:count}, (_,ch) => {
          const samples = rendered.getChannelData(ch);
          const level = Math.sqrt(amplitude(samples));
          const front = frequencies.map(hz => {
            let projection = 0;
            for (let i=0; i<frames; i++) projection += samples[i]*Math.sin(2*Math.PI*hz*i/rate);
            return 2 * projection / frames;
          });
          return {level, front};
        });
        bus.dispose();
        result.push({energies, music});
      }
      return result;
    }""")
    stems = ["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR", "TFL", "TFR", "TBL", "TBR"]
    beds = [[], ["FC"], ["FL", "FR"], ["FL", "FR", "FC"], ["FL", "FR", "SL", "SR"],
            ["FL", "FR", "FC", "SL", "SR"], ["FL", "FR", "FC", "LFE", "SL", "SR"],
            ["FL", "FR", "FC", "LFE", "BC", "SL", "SR"]] + [stems[:n] for n in range(8, 13)]
    for count, result in enumerate(results, 1):
        bed = beds[count]
        for source, energy in zip(stems, result["energies"]):
            reached = {bed[index] for index, value in enumerate(energy) if value > 1e-10}
            assert reached, (count, source, energy)
            if source in bed and count != 1:
                assert reached == {source}, (count, source, reached)
            elif source[-1] in "LR" and count > 1:
                assert all(name.endswith(source[-1]) or name == "BC" for name in reached), (count, source, reached)
        music = result["music"]
        assert all(channel["level"] > .0003 for channel in music), (count, music)
        if count == 1:
            assert min(music[0]["front"]) > .02, music
        else:
            for i in (0, 1):
                own, opposite = music[i]["front"][i], music[i]["front"][1-i]
                assert own > max(.10, abs(opposite) * 1.25), (count, i, own, opposite)
                if count == 12:
                    assert abs(own - .32) < .001 and abs(opposite) < .001, (i, own, opposite)
    print("Every source stem reached the correct side at capacities 1–12; all music channels carried energy.")


def check_peak_protection(page):
    rows = page.evaluate("""async () => {
      const preset = await DJSpatial.loadPreset(), rate = 48000, frames = 16384;
      const rows = [];
      for (const count of [1,2,6,12]) {
        for (const drive of [1,2]) {
          const context = new OfflineAudioContext(count, frames, rate);
          const bus = DJSpatial.createBus(context, preset, false, count);
          const source = context.createBufferSource(), buffer = context.createBuffer(2, frames, rate);
          const samples = buffer.getChannelData(0);
          for (let i=0; i<frames; i++) {
            const t = 2*Math.PI*i/rate;
            const harmonics = Math.sin(61*t) + .65*Math.sin(947*t) + .48*Math.sin(3791*t);
            samples[i] = drive*Math.max(-1,Math.min(1,harmonics));
          }
          buffer.copyToChannel(samples, 1);
          source.buffer=buffer; source.connect(bus.input); bus.output.connect(context.destination);
          source.start();
          const rendered = await context.startRendering();
          const peaks = Array.from({length:count}, (_,i) =>
            rendered.getChannelData(i).reduce((p,x) => Math.max(p,Math.abs(x)),0));
          rows.push([count,drive,peaks]);
          bus.dispose();
        }
      }
      return rows;
    }""")
    for count, drive, peaks in rows:
        assert len(peaks) == count and min(peaks) > .001 and max(peaks) <= .98001, (count, drive, peaks)
        if drive == 2:
            assert max(peaks) > .95, (count, peaks)
    print("Correlated full-scale and +6 dB multitone peaks stayed below 0.981 on all tested outputs.")

def check_output_hotplug(page):
    # Only the destination capability and the device-change notifications are simulated.
    # The engine configures a native Web Audio node and builds its usual graph.
    page.add_init_script("""
      window.fixtureChannels = 12;
      window.fixtureLimit = Infinity;
      window.AudioContext = class extends AudioContext {
        constructor(options) {
          super(options);
          const hardware = this.destination, output = this.createGain();
          // Tap each physical slot, and keep it in the browser's running audio graph.
          const split = this.createChannelSplitter(12), silent = this.createGain();
          silent.gain.value = 0; silent.connect(hardware); output.connect(split);
          const meters = Array.from({length:12}, (_,i) => {
            const meter = this.createAnalyser();
            split.connect(meter, i).connect(silent);
            return meter;
          });
          window.fixtureLevel = i => {
            const samples = new Float32Array(meters[i].fftSize);
            meters[i].getFloatTimeDomainData(samples);
            return Math.sqrt(samples.reduce((sum,x) => sum+x*x,0)/samples.length);
          };
          output.channelCountMode = 'explicit';
          const count = Object.getOwnPropertyDescriptor(AudioNode.prototype, 'channelCount');
          Object.defineProperty(output, 'channelCount', {
            get: () => count.get.call(output),
            set(n) {
              if (n > fixtureLimit) throw new DOMException('Unsupported channel count', 'NotSupportedError');
              count.set.call(output, n);
            }
          });
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

    def expect_route(layout, capacity, accepted=None):
        page.wait_for_function("""([layout,capacity,accepted]) => {
          const state = DJEngine.snapshot(), output = fixtureContext.destination;
          const discrete = layout === '7.1.4' || (layout === 'headphones' && capacity === 1);
          const count = accepted ?? Math.min(layout === '7.1.4' ? 12 : 2, capacity);
          return state.maxOutputChannels === capacity && state.outputLayout === layout &&
            state.activeOutputChannels === count && output.channelCount === count &&
            output.channelInterpretation === (discrete ? 'discrete' : 'speakers');
        }""", arg=[layout, capacity, accepted], timeout=5000)

    def hotplug(capacity, event="sinkchange"):
        page.evaluate("""([number,name]) => {
          fixtureChannels = number;
          const target = name === 'sinkchange' ? fixtureContext : navigator.mediaDevices;
          target.dispatchEvent(new Event(name));
        }""", [capacity, event])

    page.goto("http://localhost/test")
    page.get_by_role("button").click()
    expect_route("7.1.4", 12)
    for count in (4, 6, 3, 2, 1, 5, 7, 9, 10, 11, 16, 8):
        hotplug(count)
        expect_route("7.1.4", count)
    page.evaluate("fixtureLimit = 6; fixtureContext.destination.channelCount = 2")
    hotplug(12)
    expect_route("7.1.4", 12, accepted=6)
    page.evaluate("fixtureLimit = Infinity")
    hotplug(8)
    expect_route("7.1.4", 8)
    assert page.evaluate("DJEngine.setOutputLayout('stereo')")
    expect_route("stereo", 8)
    hotplug(1)
    expect_route("stereo", 1)
    hotplug(6, "devicechange")
    expect_route("stereo", 6)
    assert page.evaluate("DJEngine.setOutputLayout('headphones')")
    expect_route("headphones", 6)
    hotplug(1)
    expect_route("headphones", 1)
    hotplug(8)
    expect_route("headphones", 8)
    assert page.evaluate("DJEngine.setOutputLayout('7.1.4')")
    expect_route("7.1.4", 8)

    # Exercise actual HTMLMediaElement deck sources through the shared output bus.
    # Repeat a sample-aligned fixture long enough to cover the two hotplug events.
    sound = io.BytesIO()
    with wave.open(sound, "wb") as wav:
        wav.setparams((2, 2, RATE, 0, "NONE", ""))
        wav.writeframes(np.tile(stimulus(), (48, 1)).tobytes())
    encoded = base64.b64encode(sound.getvalue()).decode("ascii")
    page.evaluate("""encoded => {
      const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
      const src = URL.createObjectURL(new Blob([bytes], {type:'audio/wav'}));
      for (const id of ['A','B']) DJEngine.load(id,{id, title:'Fixture '+id, src});
      DJEngine.setCross(-1);
      DJEngine.toggle('A');
    }""", encoded)
    page.wait_for_function("DJEngine.snapshot().A.time > .2 && fixtureLevel(7) > .001")
    position = page.evaluate("DJEngine.snapshot().A.time")
    hotplug(4)
    expect_route("7.1.4", 4)
    page.wait_for_function("t => DJEngine.snapshot().A.time > t+.1 && fixtureLevel(3) > .001", arg=position)
    page.evaluate("DJEngine.toggle('B'); DJEngine.setCross(1); DJEngine.toggle('A')")
    hotplug(12, "devicechange")
    expect_route("7.1.4", 12)
    page.wait_for_function("""() => {
      const {A,B} = DJEngine.snapshot();
      return !A.playing && B.audioRunning && B.time>.25 && fixtureLevel(11)>.001;
    }""")
    page.reload()
    assert page.evaluate("DJEngine.snapshot().preferredLayout") == "7.1.4"
    page.get_by_role("button").click()
    expect_route("7.1.4", 12)
    print("Live deck audio reached the rear channels across handoff and device changes; explicit stereo/headphones and saved preference passed.")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        path = os.environ.get("CHROMIUM_PATH")
        browser = playwright.chromium.launch(executable_path=path, channel=None if path else "msedge")
        try:
            page = browser.new_page()
            exercise(page)
            check_adaptive_buses(page)
            check_peak_protection(page)
            check_output_hotplug(browser.new_page())
        finally:
            browser.close()
