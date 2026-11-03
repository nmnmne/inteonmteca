const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'text-waves.js'), 'utf8');
const start = source.indexOf('const createTextAudioMotion =');
const end = source.indexOf('const textWorkBudget =', start);
const create = vm.runInNewContext(`${source.slice(start, end)}\ncreateTextAudioMotion;`);
const playing = (mid, bass = 0) => ({playing: true, mid, bass});

function drive(motion, signal, start, duration, displayHz = 240) {
  let updates = 0, last;
  const frames = Math.round(duration * displayHz / 1000);
  for (let i = 1; i <= frames; i++) {
    last = motion.update(start + i * 1000 / displayHz, signal);
    if (last.due) updates++;
  }
  return {updates, last: {...last}};
}

test('silence keeps a calm symbol rate without throttling display updates or inventing bursts', () => {
  const motion = create();
  motion.update(0, playing(0));
  const sample = drive(motion, playing(0), 0, 1000);
  assert.equal(sample.last.symbolRate, 44);
  assert.equal(sample.updates, 240);
  assert.equal(sample.last.burst, 0);
  const quiet = drive(motion, playing(.001, .001), 1000, 1000);
  assert.equal(quiet.last.symbolRate, 44);
  assert.equal(quiet.updates, 240);
  assert.equal(quiet.last.burst, 0);
});

test('full normalized mids settle at symbol rate 144 while rendering follows the display', () => {
  const motion = create();
  motion.update(0, playing(1));
  drive(motion, playing(1), 0, 1000);
  const full = drive(motion, playing(1), 1000, 1000);
  assert.equal(full.last.symbolRate, 144);
  assert.equal(full.updates, 240);
  const display = drive(motion, playing(1), 2000, 1000, 60);
  assert.equal(display.last.symbolRate, 144);
  assert.equal(display.updates, 60, 'never performs more than one update per RAF');
});

test('paused, quiet and loud signals never skip available 60, 120, 144 or 240 Hz frames', () => {
  for (const hz of [60, 120, 144, 240]) {
    for (const [name, signal] of [['paused', {playing: false}], ['quiet', playing(.001, .001)], ['loud', playing(1, .8)]]) {
      const motion = create();
      assert.equal(motion.update(0, signal).due, false);
      let serial = motion.state.serial;
      for (let frame = 1; frame <= hz; frame++) {
        const at = frame * 1000 / hz;
        const state = motion.update(at, signal);
        assert.equal(state.due, true, `${name} at ${hz} Hz: frame ${frame} must render`);
        assert.equal(state.serial, ++serial, 'exactly one update per display frame');
        const repeated = motion.update(at, signal);
        assert.equal(repeated.due, false, 'a duplicate timestamp cannot render twice');
        assert.equal(repeated.serial, serial);
      }
    }
  }
});

test('real mid-band levels produce distinct intermediate rates with smooth attack and release', () => {
  const rates = [];
  for (const level of [.1, .35, .7]) {
    const motion = create(); motion.update(0, playing(level));
    rates.push(drive(motion, playing(level), 0, 1500).last.symbolRate);
  }
  assert.ok(rates[0] > 44 && rates[0] < rates[1] && rates[1] < rates[2] && rates[2] < 144);
  const motion = create(); motion.update(0, playing(.2));
  const before = drive(motion, playing(.2), 0, 1000).last;
  const attack = {...motion.update(1016, playing(.8))};
  assert.ok(attack.mid > before.mid && attack.mid < .8);
  const loud = drive(motion, playing(.8), 1016, 400).last;
  const release = {...motion.update(1432, playing(.2))};
  assert.ok(release.mid < loud.mid && release.mid > .2);
  assert.equal(release.burst, 0, 'mid-band changes do not manufacture bass hits');
});

test('bass transients trigger a short boost, enforce cooldown, and do not retrigger on sustained bass', () => {
  const motion = create(); motion.update(0, playing(.15, .04));
  drive(motion, playing(.15, .04), 0, 1000);
  const hit = {...motion.update(1016, playing(.15, .8))};
  assert.equal(hit.burst, 1);
  assert.equal(hit.symbolRate, 144);
  motion.update(1116, playing(.15, .02));
  const duringCooldown = {...motion.update(1132, playing(.15, .9))};
  assert.ok(duringCooldown.burst < hit.burst, 'second hit cannot restart the boost during cooldown');
  const settled = drive(motion, playing(.15, .9), 1132, 1000).last;
  assert.equal(settled.burst, 0, 'held bass never generates periodic fake hits');
  assert.ok(settled.symbolRate < 100);
  drive(motion, playing(.15, .02), 2132, 400);
  assert.equal(motion.update(2548, playing(.15, .9)).burst, 1);
});

test('low-level bass noise cannot trigger fast flashes and pause restores the calm symbol rate', () => {
  const motion = create(); motion.update(0, playing(.01, .01));
  for (let frame = 1; frame <= 100; frame++) {
    const state = motion.update(frame * 16, playing(.01, frame % 2 ? .08 : .01));
    assert.equal(state.burst, 0);
  }
  motion.update(1616, playing(1, 1));
  const paused = motion.update(1632, {playing: false, mid: 1, bass: 1});
  assert.equal(paused.symbolRate, 44);
  assert.equal(paused.burst, 0);
});

test('returning after a hidden-page reset never catches up missed animation work', () => {
  const motion = create(); motion.update(0, playing(1));
  drive(motion, playing(1), 0, 1000);
  motion.reset();
  const returned = motion.update(60000, playing(0));
  assert.equal(returned.due, false);
  assert.equal(returned.symbolRate, 44);
  assert.equal(returned.motionTime, 0, 'hidden elapsed time is not replayed');
  const resumedSerial = returned.serial;
  const resumed = motion.update(60000 + 1000 / 144, playing(0));
  assert.equal(resumed.due, true, 'the first available frame after reset is rendered');
  assert.equal(resumed.serial, resumedSerial + 1, 'resume does not synthesize missed frames');
  assert.equal(drive(motion, playing(0), 60000 + 1000 / 144, 1000).updates, 240);
});

test('wave travel keeps the same speed at 30, 60, 120 and 144 Hz', () => {
  const travel = [];
  for (const hz of [30, 60, 120, 144]) {
    const motion = create(); motion.update(0, playing(.5));
    drive(motion, playing(.5), 0, 2000, hz);
    const before = motion.state.motionTime;
    drive(motion, playing(.5), 2000, 1000, hz);
    travel.push(motion.state.motionTime - before);
  }
  for (const distance of travel) assert.ok(Math.abs(distance - 1300) < .01, `${distance}: one second of equally fast travel`);
  const motion = create(); motion.update(0, playing(0));
  drive(motion, playing(0), 0, 1000, 30);
  assert.ok(Math.abs(motion.state.motionTime - 1000) < .01, 'silence does not slow the wave clock');
  motion.reset(); motion.update(60000, playing(0));
  assert.equal(motion.state.motionTime, 0, 'hidden time does not teleport a resumed wave');
});

test('logo response reaches the same position in 100 ms regardless of frame rate', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const start = script.indexOf('const motionResponse =');
  const end = script.indexOf('let roomMusicAccentAt', start);
  const response = vm.runInNewContext(`${script.slice(start, end)}\nmotionResponse;`);
  for (const factor of [.025, .085, .14, .16, .18]) {
    const positions = [30, 60, 120].map(hz => {
      let position = 0;
      for (let frame = 0; frame < hz / 10; frame++) position += (1 - position) * response(factor, 1000 / hz);
      return position;
    });
    positions.forEach(value => assert.ok(Math.abs(value - positions[0]) < 1e-10));
    assert.equal(response(factor, 0), 0, 'intentional freeze does not advance movement');
    assert.ok(response(factor, 60000) < 1, 'resume cannot overshoot');
  }
});

test('band reader reuses existing FFT data, isolates Hz ranges, and exposes no writable signal', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const begin = script.indexOf('window.inteonAudioBands =');
  const finish = script.indexOf('const ensureEffectLayers =', begin);
  const data = new Uint8Array(128);
  const context = {state: 'running', sampleRate: 48000};
  const player = {paused: false, ended: false};
  let reads = 0;
  const sandbox = {window: {}, audioEnergy: () => reads++, activeAudioNode: {data, context, analyser: {fftSize: 256}}, immersiveState: {}, sharedAudioContext: context, player};
  vm.runInNewContext(script.slice(begin, finish), sandbox);
  const api = sandbox.window.inteonAudioBands;
  data.fill(255);
  assert.ok(Math.abs(api.read().mid - 1) < 1e-12);
  assert.ok(Math.abs(api.read().bass - 1) < 1e-12);
  assert.ok(Object.isFrozen(api) && Object.isFrozen(api.read()));
  data.fill(0); data[60] = 255;
  assert.equal(api.read().mid, 0, 'upper frequencies are outside the musical mid band');
  assert.equal(api.read().bass, 0);
  data.fill(0); data[1] = 255;
  const low = api.read();
  assert.ok(low.bass > low.mid && low.bass > 0);
  data.fill(255, 2, 13);
  assert.ok(api.read().mid > .8);
  player.paused = true;
  assert.equal(api.read().playing, false);
  assert.equal(api.read().mid, 0);
  assert.equal(api.read().bass, 0);
  assert.ok(reads > 0, 'uses the already configured analysis refresh');
});

test('float FFT bands retain loud-bass headroom and reuse one buffer per analyser sample', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const begin = script.indexOf('window.inteonAudioBands =');
  const finish = script.indexOf('const ensureEffectLayers =', begin);
  let decibels = -30, calls = 0, buffer;
  const analyser = {fftSize: 256, getFloatFrequencyData(data) {
    if (buffer) assert.equal(data, buffer, 'frequency buffer is reused');
    buffer = data; calls++; data.fill(decibels);
  }};
  const context = {state: 'running', sampleRate: 48000};
  const spectrumState = {at: 0};
  const sandbox = {window: {}, audioEnergy() {}, spectrumState, activeAudioNode: {data: new Uint8Array(128).fill(255), context, analyser}, immersiveState: {}, sharedAudioContext: context, player: {paused: false, ended: false}};
  vm.runInNewContext(script.slice(begin, finish), sandbox);
  const api = sandbox.window.inteonAudioBands;
  const low = api.read().bass;
  assert.ok(low > .6 && low < .65);
  api.read(); assert.equal(calls, 1, 'same cached FFT sample does not read twice');
  decibels = -10; spectrumState.at = 16;
  const high = api.read().bass;
  assert.ok(high > low && high < 1, 'loud masters do not pin bass at the byte ceiling');
  decibels = -Infinity; spectrumState.at = 32;
  assert.equal(api.read().bass, 0);
  assert.equal(api.read().mid, 0);
});
