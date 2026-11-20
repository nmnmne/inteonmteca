import {sampleWeather} from './weather-field.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const initialView = {x: 39, z: -2.5, yaw: 0};

// A crow has a voiced, rough call: vary the glottal period, then reinforce
// two broad harmonics. Each bird uses a different throat and rasp.
function makeCall(context, variant) {
  const rate = 24000, length = .32 + variant * .047;
  const clip = context.createBuffer(1, Math.round(rate * length), rate);
  const samples = clip.getChannelData(0);
  let phase = 0, rough = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, f = t / length;
    rough = rough * .82 + (Math.random() * 2 - 1) * .18;
    const hz = (223 + variant * 15) * (1.04 + .25 * Math.sin(Math.PI * f) - .34 * f);
    phase += 2 * Math.PI * hz / rate * (1 + .047 * Math.sin(2 * Math.PI * t * 37) + .09 * rough);
    const voice = Math.sin(phase) * .14 + Math.sin(phase*2 + .3) * .25
      + Math.sin(phase*4) * .25 + Math.sin(phase*5 + .8) * .17 + Math.sin(phase*7) * .08;
    const envelope = Math.min(1, t / .028) * Math.min(1, (length - t) / .095);
    samples[i] = (voice + rough * .32) * envelope * (.78 + .22 * Math.sin(2 * Math.PI * 41 * t));
  }
  return clip;
}

function addWindReflections(context, windGain, bus) {
  // Two diminishing reflections from the facing buildings, without feedback.
  let reflected = windGain;
  for (const [travel, level] of [[.19, .24], [.24, .10]]) {
    const delay = context.createDelay(.5), send = context.createGain();
    delay.delayTime.value = travel;
    send.gain.value = level;
    reflected.connect(delay).connect(send).connect(bus);
    reflected = delay;
  }

  const rate = context.sampleRate, length = Math.ceil(rate * .84);
  const impulse = context.createBuffer(2, length, rate);
  const scale = 6 / Math.sqrt(length);
  for (let side = 0; side < 2; side++) {
    const channel = impulse.getChannelData(side);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      channel[i] = (Math.random() * 2 - 1) * scale * Math.min(1, t / .035) * Math.exp(-6 * i / length);
    }
  }
  const reverb = context.createConvolver(), wet = context.createGain();
  reverb.normalize = false;
  reverb.buffer = impulse;
  wet.gain.value = .23;
  windGain.connect(reverb).connect(wet).connect(bus);
}

function makeAmbience(context) {
  const bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(context.destination);
  const noise = context.createBuffer(2, 64000, 16000);
  const grain = context.createBuffer(2, noise.length, noise.sampleRate);
  for (let side = 0; side < 2; side++) {
    const samples = noise.getChannelData(side);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    // A four-bit sample-and-hold clock gives the wind its grain. Rain keeps the full-band noise.
    const stepped = grain.getChannelData(side);
    for (let i = 0; i < samples.length;) {
      const hold = 3 + Math.floor((samples[(i+1) % samples.length] + 1) * 2);
      const level = Math.round((samples[i] + 1) * 7.5) / 7.5 - 1;
      stepped.fill(level, i, i + hold);
      i += hold;
    }
  }
  const air = context.createBufferSource(), rainfall = context.createBufferSource();
  air.buffer = grain; rainfall.buffer = noise;
  air.loop = rainfall.loop = true;
  const wind = context.createBiquadFilter(), rain = context.createBiquadFilter();
  wind.type = 'bandpass'; wind.Q.value = 1.4;
  const windLowCut = context.createBiquadFilter();
  windLowCut.type = 'highpass';
  windLowCut.frequency.value = 390;
  windLowCut.Q.value = Math.SQRT1_2;
  rain.type = 'highpass'; rain.frequency.value = 2350;
  const windGain = context.createGain(), rainGain = context.createGain();
  windGain.gain.value = rainGain.gain.value = 0;
  air.connect(wind).connect(windLowCut).connect(windGain).connect(bus);
  rainfall.connect(rain).connect(rainGain).connect(bus);
  addWindReflections(context, windGain, bus);
  air.start();
  rainfall.start();
  const calls = [0,1,2].map(i => makeCall(context, i));
  const reverse = context.createBuffer(1, calls[2].length, calls[2].sampleRate);
  reverse.getChannelData(0).set(calls[2].getChannelData(0));
  reverse.getChannelData(0).reverse();

  let gustStart = context.currentTime + 1 + Math.random() * 1.8;
  let gustLength = 3 + Math.random() * 2, gustStrength = .8;
  function windEnvelope(t) {
    if (t >= gustStart + gustLength) {
      gustStart = t + 3.5 + Math.random() * 6;
      gustLength = 2.8 + Math.random() * 2.8;
      gustStrength = .62 + Math.random() * .38;
    }
    if (t <= gustStart) return 0;
    return gustStrength * Math.sin(Math.PI * (t - gustStart) / gustLength) ** 2;
  }

  function call(clip, when, rate, volume, pan) {
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = clip;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    const panner = context.createStereoPanner?.();
    if (panner) { panner.pan.value = pan; gain.connect(panner).connect(bus); }
    else gain.connect(bus);
    source.connect(gain);
    source.onended = () => { source.disconnect(); gain.disconnect(); panner?.disconnect(); };
    source.start(when);
  }
  return {
    update(weather, master, playing, bass) {
      const t = context.currentTime, gust = windEnvelope(t);
      bus.gain.setTargetAtTime(master * (playing ? .48 : .95), t, .12);
      // Sweep the resonance with cot(angle), staying clear of its poles even at a gust peak.
      const angle = .85 - .48 * Math.cos(t * .79 + .32 * Math.sin(t * .37));
      const cotangent = 1 / Math.tan(angle);
      const sweep = 125 + gust * (230 + 90 * weather.autumn + 45 * weather.spring + bass * 45);
      wind.frequency.setTargetAtTime(500 + sweep * cotangent, t, .16);
      windGain.gain.setTargetAtTime(.0035 + gust * (.032 + .019 * weather.autumn + .01 * weather.snow), t, .18);
      rainGain.gain.setTargetAtTime(.001 + .035 * weather.rain + .004 * weather.summer, t, .5);
    },
    flockCall(index, pan, volume, delay, beat, magical) {
      const t = context.currentTime + delay + .015, clip = calls[index % calls.length];
      call(clip, t, .93 + Math.random() * .14, volume, pan);
      if (magical) {
        call(reverse, t + beat * 1.5, .82, volume * .52, -pan);
        call(clip, t + beat * 2.5, 1.26, volume * .23, pan * .6);
      } else if (Math.random() < .57) {
        call(clip, t + .42 + Math.random() * .17, .91, volume * .79, pan);
      }
    },
    stop() { air.stop(); rainfall.stop(); air.disconnect(); rainfall.disconnect(); bus.disconnect(); },
  };
}

function readBeat(engine, media) {
  if (engine) {
    const state = engine.snapshot();
    const primary = state.cross > 0 ? state.B : state.A;
    const other = primary === state.A ? state.B : state.A;
    const deck = primary.playing ? primary : other;
    if (deck.playing && deck.bpm > 0 && deck.baseBPM > 0) {
      const beat = 60 / deck.bpm;
      const songBeats = (deck.time - (deck.track?.offset || 0)) * deck.baseBPM / 60;
      return {beat, delay: (Math.ceil(songBeats) - songBeats) * beat};
    }
  }
  const beat = .5, time = media?.currentTime || 0;
  return {beat, delay: beat - time % beat};
}

export function createYardSound(view = () => initialView) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return {dispose() {}};
  const media = document.querySelector('#album-player'), masterControl = document.querySelector('#master');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let context, graph, timer, away = false, disposed = false, resuming = false;
  let nextCall = 0, callNumber = 0, lastBass = 0;
  function update() {
    if (!graph || context.state !== 'running' || document.hidden || away) return;
    const location = view() || initialView, engine = window.DJEngine;
    const bands = window.inteonAudioBands?.read();
    const playing = Boolean(bands?.playing || (engine ? !engine.visuals.paused : media && !media.paused && !media.ended));
    const master = masterControl ? Number(masterControl.value) / 100 : (media?.muted ? 0 : media?.volume ?? 1);
    const weather = sampleWeather(location.x, location.z, performance.now() / 1000);
    const bass = bands?.bass || 0, now = context.currentTime;
    graph.update(weather, clamp(master, 0, 1), playing, bass);
    const accent = bass > .42 && bass - lastBass > .12;
    lastBass = bass;
    if (!master || now < nextCall || (playing && !accent && now < nextCall + 1.1)) return;
    const nearby = (location.birds || []).filter(b => b.id !== 0 && Math.hypot(b.x-location.x, b.z-location.z) < 42);
    const bird = nearby[Math.floor(Math.random() * nearby.length)];
    let pan = .85 * Math.sin(callNumber * 2.4), volume = .20;
    if (bird) {
      const dx = bird.x - location.x, dz = bird.z - location.z, length = Math.hypot(dx, dz);
      pan = clamp((Math.cos(location.yaw) * dx + Math.sin(location.yaw) * dz) / Math.max(3, length), -.93, .93);
      volume = .32 / (1 + length / 31);
    }
    const {beat, delay} = playing ? readBeat(engine, media) : {beat:.5, delay:0};
    const magical = playing && (callNumber % 4 === 2 || (accent && Math.random() < .22));
    graph.flockCall(bird?.id ?? callNumber, pan, volume, delay, beat, magical);
    if (playing && bird && !motion.matches) bird.musicReplyAt = location.elapsed + delay;
    callNumber++;
    nextCall = now + delay + (playing ? 3 + beat * (5 + Math.floor(Math.random() * 7)) : 3.8 + Math.random() * 6);
  }

  async function unlock(event) {
    if (disposed || away || document.hidden || (timer && graph && context.state === 'running')) return;
    // An early resume() may remain pending until Safari receives a real gesture.
    if (resuming) {
      if (event?.isTrusted && context) void context.resume().catch(() => {});
      return;
    }
    resuming = true;
    try {
      context ||= new Context({latencyHint:'playback'});
      if (context.state !== 'running') await context.resume();
      if (disposed || away || document.hidden || context.state !== 'running') return;
      if (!graph) { graph = makeAmbience(context); nextCall = context.currentTime + 1.3; }
      if (!timer) timer = window.setInterval(update, 160);
      update();
    } catch { /* Another user gesture may unlock an interrupted output device. */ }
    finally { resuming = false; }
  }
  function visibility() {
    if (away || document.hidden) {
      window.clearInterval(timer); timer = null;
      if (context && context.state !== 'closed') void context.suspend().catch(() => {});
    } else if (context || navigator.userActivation?.hasBeenActive) void unlock();
  }
  function hide(event) {
    if (!event.persisted) { dispose(); return; }
    away = true; visibility();
  }
  function show() { away = false; visibility(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    window.clearInterval(timer);
    document.removeEventListener('pointerup', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    graph?.stop();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
  document.addEventListener('pointerup', unlock, {capture:true, passive:true});
  document.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  if (navigator.userActivation?.hasBeenActive) void unlock();
  return {dispose};
}
