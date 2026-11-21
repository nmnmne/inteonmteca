import {crowPersonality} from './crow-personalities.js';
import {sampleWeather} from './weather-field.js';
import {courtyardEffectSeconds} from './solar-clock.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const initialView = {x: 39, z: -2.5, yaw: 0};
// The walking view and reduced-motion poster have no simulated flock. Keep
// their off-screen residents at fixed world positions as the listener moves.
const distantBirds = [{id:1, x:20, z:-7}, {id:2, x:45, z:-18}, {id:13, x:29, z:10}, {id:16, x:44, z:9}];

// The camera uses rotation.y = -yaw; its right vector in the courtyard is (cos(yaw), sin(yaw)).
function listenerPan(dx, dz, yaw, distance) {
  return clamp((Math.cos(yaw) * dx + Math.sin(yaw) * dz) / Math.max(3, distance), -.93, .93);
}

function routeFrontPair(destination) {
  const count = destination.maxChannelCount;
  if (count > 0 && count !== destination.channelCount) {
    try { destination.channelCount = Math.min(12, count); }
    catch { /* Fixed destinations retain the channel count supplied by the browser. */ }
  }
  // Stereo goes to device slots 0 and 1. Mono uses the speaker downmix (L+R)/2.
  try { destination.channelInterpretation = destination.channelCount === 1 ? 'speakers' : 'discrete'; }
  catch { /* Some fixed hardware layouts lock speaker interpretation as well as the width. */ }
}

// Pre-render a rough, voiced sound once per individual. Its throat stays the
// same from visit to visit; small performance variations happen at playback.
function makeCall(context, {id, voice}) {
  const rate = 24000, length = .38 * voice.length, pitch = 234 * voice.pitch;
  const clip = context.createBuffer(1, Math.round(rate * length), rate);
  const samples = clip.getChannelData(0);
  const rasp = voice.rasp, flutter = 31 + 19 * rasp;
  let phase = 0, rough = 0, seed = id + 1, energy = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, f = t / length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    rough = rough * .74 + (seed / 2147483648 - 1) * .26;
    const hz = pitch * (1.04 + (.16 + .12 * rasp) * Math.sin(Math.PI * f) - .29 * f);
    const vibration = Math.sin(2 * Math.PI * t * flutter);
    phase += 2 * Math.PI * hz / rate * (1 + (.018 + .044 * rasp) * vibration + .13 * rasp * rough);
    const harmonics = Math.sin(phase) * .20 + Math.sin(2 * phase + .3) * (.32 - .10 * rasp)
      + Math.sin(4 * phase) * .23 + Math.sin(5 * phase + .8) * (.08 + .14 * rasp)
      + Math.sin(7 * phase) * (.035 + .10 * rasp);
    const envelope = Math.min(1, t / (.043 - .024 * rasp)) * Math.min(1, (length - t) / (.105 - .037 * rasp));
    const depth = .10 + .22 * rasp;
    const sample = (harmonics + rough * (.10 + .29 * rasp)) * envelope * (1 - depth + depth * vibration);
    samples[i] = sample;
    energy += sample * sample;
  }
  // Give the throat colours the same reference level, then let each bird's
  // voice.volume, its distance and its place in the phrase set its loudness.
  const normal = .22 / Math.sqrt(energy / samples.length);
  for (let i = 0; i < samples.length; i++) samples[i] *= normal;
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

let activeCrowMeter;
export function audibleCrowEnvelope() {
  return activeCrowMeter?.() || 0;
}

function makeAmbience(context) {
  const bus = context.createGain();
  bus.channelCount = 2;
  bus.channelCountMode = 'explicit';
  bus.channelInterpretation = 'speakers';
  let outputChannels = context.destination.maxChannelCount;
  routeFrontPair(context.destination);
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
  const windPan = context.createStereoPanner?.();
  air.connect(wind).connect(windLowCut).connect(windGain);
  if (windPan) windGain.connect(windPan).connect(bus);
  else windGain.connect(bus);
  rainfall.connect(rain).connect(rainGain).connect(bus);
  addWindReflections(context, windGain, bus);
  air.start();
  rainfall.start();
  const voices = new Map();
  function voiceClip(bird, backwards = false) {
    let clips = voices.get(bird.id);
    if (!clips) {
      clips = {natural:makeCall(context, crowPersonality(bird.id))};
      voices.set(bird.id, clips);
    }
    if (!backwards) return clips.natural;
    if (!clips.reverse) {
      const {natural} = clips;
      clips.reverse = context.createBuffer(1, natural.length, natural.sampleRate);
      clips.reverse.getChannelData(0).set(natural.getChannelData(0));
      clips.reverse.getChannelData(0).reverse();
    }
    return clips.reverse;
  }

  let gustId, gustX, gustZ;
  const callsInFlight = new Set();
  // This pass-through contains only spatialised crow voices. Gusts, rain and
  // music never enter it, even when they play through the same speaker pair.
  const crowMeter = context.createAnalyser();
  crowMeter.fftSize = 512;
  crowMeter.connect(bus);
  const crowSamples = new Float32Array(crowMeter.fftSize);
  function readCrowMeter() {
    if (context.state !== 'running' || !callsInFlight.size) return 0;
    crowMeter.getFloatTimeDomainData(crowSamples);
    let sum = 0;
    for (const sample of crowSamples) sum += sample * sample;
    const rms = Math.sqrt(sum / crowSamples.length) * bus.gain.value;
    return 1 - Math.exp(-22 * rms);
  }
  activeCrowMeter = readCrowMeter;
  function windEnvelope(phase, listener) {
    const id = Math.floor(phase / 12);
    if (id !== gustId) {
      gustId = id;
      gustX = listener.x;
      gustZ = listener.z;
    }
    // Derive the envelope from the courtyard phase so a gust can retrace its path.
    const gustStart = id * 12 + 2.7 + 1.5 * Math.sin(id * 2.41);
    const gustLength = 4.2 + 1.2 * Math.cos(id * 1.73);
    const gustStrength = .81 + .19 * Math.sin(id * 1.29);
    const heading = .65 + .55 * Math.sin(id * 2.39);
    // A gust travels past its starting point in the world, independent of camera turns.
    const along = (clamp((phase - gustStart) / gustLength, 0, 1) - .5) * 40;
    const c = Math.cos(heading), s = Math.sin(heading);
    const dx = gustX + along*c - 8*s - listener.x, dz = gustZ + along*s + 8*c - listener.z;
    const distance = Math.hypot(dx, dz);
    windPan?.pan.setTargetAtTime(listenerPan(dx, dz, listener.yaw, distance), context.currentTime, .13);
    if (phase <= gustStart || phase >= gustStart + gustLength) return 0;
    return gustStrength * Math.sin(Math.PI * (phase - gustStart) / gustLength) ** 2 / Math.max(1, distance / 30);
  }

  function call(clip, when, rate, point, level, listener) {
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = clip;
    source.playbackRate.value = rate;
    const panner = context.createStereoPanner?.();
    if (panner) gain.connect(panner).connect(crowMeter);
    else gain.connect(crowMeter);
    function position(view, immediate = false) {
      const dx = point.x - view.x, dz = point.z - view.z, distance = Math.hypot(dx, dz);
      const volume = level * .32 / (1 + distance / 31);
      const pan = listenerPan(dx, dz, view.yaw, distance);
      if (immediate) {
        gain.gain.value = volume;
        if (panner) panner.pan.value = pan;
      } else {
        gain.gain.setTargetAtTime(volume, context.currentTime, .045);
        panner?.pan.setTargetAtTime(pan, context.currentTime, .045);
      }
    }
    position(listener, true);
    callsInFlight.add(position);
    source.connect(gain);
    source.onended = () => {
      callsInFlight.delete(position);
      source.disconnect(); gain.disconnect(); panner?.disconnect();
    };
    source.start(when);
  }
  return {
    update(weather, master, playing, bass, listener, phase) {
      const t = context.currentTime, gust = windEnvelope(phase, listener);
      if (outputChannels !== context.destination.maxChannelCount) {
        outputChannels = context.destination.maxChannelCount;
        routeFrontPair(context.destination);
      }
      callsInFlight.forEach(position => position(listener));
      bus.gain.setTargetAtTime(master * (playing ? .48 : .95), t, .12);
      // Sweep the resonance with cot(angle), staying clear of its poles even at a gust peak.
      const angle = .85 - .48 * Math.cos(phase * .79 + .32 * Math.sin(phase * .37));
      const cotangent = 1 / Math.tan(angle);
      const sweep = 125 + gust * (230 + 90 * weather.autumn + 45 * weather.spring + bass * 45);
      wind.frequency.setTargetAtTime(500 + sweep * cotangent, t, .16);
      windGain.gain.setTargetAtTime(.0035 + gust * (.032 + .019 * weather.autumn + .01 * weather.snow), t, .18);
      rainGain.gain.setTargetAtTime(.001 + .035 * weather.rain + .004 * weather.summer, t, .5);
    },
    chuckle(bird, listener) {
      const natural = voiceClip(bird), clips = voices.get(bird.id);
      if (!clips.chuckle) {
        // Keep this particular throat and break its call into three breathy syllables.
        const take = natural.getChannelData(0);
        clips.chuckle = context.createBuffer(1, natural.length, natural.sampleRate);
        const samples = clips.chuckle.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          const beat = 3 * i / samples.length, syllable = Math.floor(beat);
          const within = Math.min(1, (beat - syllable) / .72);
          const pulse = Math.sin(Math.PI * within) ** 2;
          const rasp = .78 + .22 * Math.sin(2 * Math.PI * 53 * i / natural.sampleRate);
          samples[i] = take[i] * pulse * rasp * (1 - .12 * syllable);
        }
      }
      call(clips.chuckle, context.currentTime + .012, 1.06, bird, .49 * crowPersonality(bird.id).voice.volume, listener);
    },
    flockCall(bird, reply, listener, delay, beat, magical) {
      const t = context.currentTime + delay + .015, clip = voiceClip(bird);
      const voice = crowPersonality(bird.id).voice;
      const rate = .985 + Math.random() * .03;
      call(clip, t, rate, bird, voice.volume, listener);
      if (magical) {
        const otherVoice = crowPersonality(reply.id).voice;
        call(voiceClip(reply, true), t + beat * 1.5, .82, reply, .52 * otherVoice.volume, listener);
        call(clip, t + beat * 2.5, 1.26, bird, .23 * voice.volume, listener);
        return beat * 1.5;
      }
      const spacing = clip.length / clip.sampleRate / rate + .20 * voice.cadence;
      for (let n = 1; n < voice.notes; n++) {
        call(clip, t + n * spacing, rate * (1 - n * .026), bird, voice.volume * .84 ** n, listener);
      }
      const neighbour = crowPersonality(reply.id);
      if (reply !== bird && Math.random() < .14 + .38 * neighbour.habits.sociability) {
        const otherVoice = neighbour.voice;
        const after = voice.notes * spacing + .18 * otherVoice.cadence;
        call(voiceClip(reply), t + after, .97, reply, .70 * otherVoice.volume, listener);
        return after;
      }
      return null;
    },
    stop() {
      if (activeCrowMeter === readCrowMeter) activeCrowMeter = null;
      callsInFlight.clear(); crowMeter.disconnect();
      air.stop(); rainfall.stop(); air.disconnect(); rainfall.disconnect(); bus.disconnect();
    },
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
  const heardLaugh = new WeakMap();
  let nextCall = 0, callNumber = 0, lastBass = 0, lastCaller;
  function update() {
    if (!graph || context.state !== 'running' || document.hidden || away) return;
    const location = view() || initialView, engine = window.DJEngine;
    const bands = window.inteonAudioBands?.read();
    const playing = Boolean(bands?.playing || (engine ? !engine.visuals.paused : media && !media.paused && !media.ended));
    const master = masterControl ? Number(masterControl.value) / 100 : (media?.muted ? 0 : media?.volume ?? 1);
    const phase = courtyardEffectSeconds(Date.now());
    const weather = sampleWeather(location.x, location.z, motion.matches ? 0 : phase);
    const bass = bands?.bass || 0, now = context.currentTime;
    graph.update(weather, clamp(master, 0, 1), playing, bass, location, phase);
    for (const bird of location.birds || []) {
      const at = bird.laughAt;
      if (!Number.isFinite(at) || at < 0 || location.elapsed < at || heardLaugh.get(bird) === at) continue;
      heardLaugh.set(bird, at);
      if (master && location.elapsed - at < .65 && Math.hypot(bird.x - location.x, bird.z - location.z) < 42) {
        graph.chuckle(bird, location);
        nextCall = Math.max(nextCall, now + .75);
      }
    }
    const accent = bass > .42 && bass - lastBass > .12;
    lastBass = bass;
    if (!master || now < nextCall || (playing && !accent && now < nextCall + 1.1)) return;
    const nearby = location.birds ? location.birds.filter(b => Math.hypot(b.x-location.x, b.z-location.z) < 42) : distantBirds;
    if (!nearby.length) return;
    const pool = nearby.length > 1 ? nearby.filter(other => other !== lastCaller) : nearby;
    const bird = pool[Math.floor(Math.random() * pool.length)];
    lastCaller = bird;
    // A neighbour answers within earshot of the caller, from its own position.
    let reply = bird, closest = 16;
    for (const other of nearby) {
      const distance = Math.hypot(other.x - bird.x, other.z - bird.z);
      if (other !== bird && distance < closest) { closest = distance; reply = other; }
    }
    const {beat, delay} = playing ? readBeat(engine, media) : {beat:.5, delay:0};
    const magical = playing && (callNumber % 4 === 2 || (accent && Math.random() < .22));
    const responseAt = graph.flockCall(bird, reply, location, delay, beat, magical);
    if (location.birds && !motion.matches) {
      bird.musicReplyAt = location.elapsed + delay;
      if (reply !== bird && responseAt !== null) reply.musicReplyAt = location.elapsed + delay + responseAt;
    }
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
