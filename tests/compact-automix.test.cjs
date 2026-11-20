const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../compact-automix.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const tracks = [
  { id: 'original', title: 'Original', bpm: 120, duration: 180, offset: 0 },
  { id: 'selected', title: 'Selected', bpm: 128, duration: 156, offset: 0.1 },
  { id: 'third', title: 'Third', bpm: 115, duration: 140, offset: 0 },
];

function makeDeck(track, playing = false) {
  return {
    track, playing, audioRunning: playing, audioFailed: false, loadVersion: 1, time: playing ? 36 : 0,
    bpm: track?.bpm || 0, baseBPM: track?.bpm || 0, duration: track?.duration || 0,
    tempo: 0, bend: 0, channel: 0.8, eq: { low: 0, mid: 0, high: 0 }, filter: 0, echo: 0,
    loopBeats: 0, loopStart: null, loopEnd: null, cue: 0, keyLock: true,
    scratching: false, scratchStatus: 'ready',
  };
}

function studio({ playing = true, beforeLoad, random = 0.75 } = {}) {
  const state = { A: makeDeck(tracks[0], playing), B: makeDeck(null), cross: 0, sharpCross: false };
  const loads = [], switched = [], loops = [], starts = [], equalizer = [], scratch = [];
  let now = 0;
  const timers = new Map();
  let nextTimer = 0;
  function setInterval(fn, period) {
    timers.set(++nextTimer, { fn, period, next: now + period });
    return nextTimer;
  }
  const clearInterval = id => timers.delete(id);
  const window = { setInterval, clearInterval };
  const math = Object.create(Math);
  math.random = () => random;
  vm.runInNewContext(source, { window, Math: math, setInterval, clearInterval, performance: { now: () => now } });
  const engine = {
    snapshot: () => structuredClone(state),
    batch: fn => fn(),
    setLoop(id, beats) {
      const deck = state[id];
      if (beats > 0 && !deck.loopBeats) deck.loopStart = Math.min(deck.time, deck.duration - beats * 60 / deck.baseBPM);
      deck.loopEnd = beats ? deck.loopStart + beats * 60 / deck.baseBPM : null;
      if (!beats) deck.loopStart = null;
      deck.loopBeats = beats;
      loops.push([id, beats]);
      return true;
    },
    toggle(id) {
      const deck = state[id];
      deck.playing = deck.audioRunning = !deck.playing;
      if (deck.playing) starts.push({ id, bpm: deck.bpm });
    },
    sync(id) { state[id].bpm = state[id === 'A' ? 'B' : 'A'].bpm; },
    seek(id, seconds) { state[id].time = seconds; },
    setEQ(id, band, value) {
      state[id].eq[band] = value;
      equalizer.push([id, band, value]);
    },
    setFilter(id, value) { state[id].filter = value; },
    setEcho(id, value) { state[id].echo = value; },
    setChannel(id, value) { state[id].channel = value; },
    setCross(value) { state.cross = value; },
    setCrossCurve(sharp) { state.sharpCross = sharp; },
    beginScratch(id) { state[id].scratching = true; return true; },
    moveScratch(id, seconds) { state[id].time += seconds; scratch.push([id, seconds]); },
    endScratch(id) { state[id].scratching = false; },
  };
  const library = {
    list: () => tracks,
    async load(id, key, isCurrent = () => true) {
      loads.push([id, key]);
      if (beforeLoad && !await beforeLoad()) return false;
      if (!isCurrent()) return false;
      const track = tracks.find(item => item.id === key);
      if (!track) return false;
      const version = state[id].loadVersion + 1;
      state[id] = makeDeck(track);
      state[id].loadVersion = version;
      return true;
    },
  };
  const mix = window.DJCompactMix.create(engine, library, {
    onStatus() {}, onDeckChange(id) { switched.push(id); },
  });
  async function advance(milliseconds) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      now += 50;
      for (const id of ['A', 'B']) {
        const deck = state[id];
        if (!deck.playing) continue;
        deck.time += 0.05 * deck.bpm / deck.baseBPM;
        if (deck.loopBeats && deck.time >= deck.loopEnd) {
          deck.time = deck.loopStart + (deck.time - deck.loopEnd) % (deck.loopEnd - deck.loopStart);
        }
      }
      for (const timer of timers.values()) {
        if (now >= timer.next) {
          timer.next += timer.period;
          timer.fn();
        }
      }
      await settle();
    }
  }
  return { state, mix, loads, switched, loops, starts, equalizer, scratch, advance };
}

test('paused selection loads the requested deck and stays paused', async () => {
  const { mix, loads, state, starts } = studio({ playing: false });
  await mix.choose('A', 'selected');
  assert.deepEqual(loads, [['A', 'selected']]);
  assert.equal(state.A.playing, false);
  assert.deepEqual(starts, []);
});

test('manual selection stages the opposite deck and mixes in time while tightening the outgoing loop', async () => {
  const { mix, loads, state, starts, equalizer, loops, switched, scratch, advance } = studio();
  const request = mix.choose('A', 'selected');
  await settle();
  await advance(1000);
  assert.deepEqual(loads, [['B', 'selected']]);
  assert.equal(state.A.track.id, 'original');
  assert.equal(state.A.playing, true);
  await advance(30000);
  await request;
  assert.deepEqual(starts, [{ id: 'B', bpm: 120 }]);
  assert.equal(state.A.playing, false);
  assert.equal(state.B.playing, true);
  assert.deepEqual(switched, ['B']);
  const lengths = loops.filter(([id, beats]) => id === 'A' && beats > 0).map(([, beats]) => beats);
  assert.ok(lengths.some((beats, i) => i && beats < lengths[i - 1]), 'the outgoing loop shortened before handoff');
  assert.ok(scratch.some(([side, seconds]) => side === 'A' && seconds < 0), 'the outgoing deck scratched backwards');
  assert.equal(state.A.scratching, false);
  for (const id of ['A', 'B']) assert.ok(equalizer.some(([side,, db]) => side === id && db < -1));
});

test('failed loading leaves the current deck running and releases its temporary loop', async () => {
  const { mix, loads, state, starts, advance } = studio({ beforeLoad: () => false });
  await mix.choose('A', 'selected');
  await advance(1000);
  assert.deepEqual(loads, [['B', 'selected']]);
  assert.equal(state.A.playing, true);
  assert.equal(state.A.track.id, 'original');
  assert.equal(state.A.loopBeats, 0);
  assert.deepEqual(starts, []);
});

test('cancelling while a track is loading prevents a late completion from starting it', async () => {
  let release;
  const { mix, state, starts, advance } = studio({ beforeLoad: () => new Promise(resolve => { release = resolve; }) });
  const request = mix.choose('A', 'selected');
  await settle();
  mix.cancel();
  state.B = makeDeck(tracks[2]);
  release(true);
  await request;
  await advance(1000);
  assert.equal(state.A.playing, true);
  assert.equal(state.A.loopBeats, 0);
  assert.deepEqual(starts, []);
  assert.equal(state.B.track.id, 'third', 'a late hydrate cannot replace a subsequent selection');
});

test('near the end Auto stages a random different track once and follows the handoff', async () => {
  const { mix, state, loads, switched, advance } = studio({ random: 0.99 });
  state.cross = -0.62;
  state.A.time = state.A.duration - 3;
  mix.sync();
  assert.deepEqual(loads, []);
  mix.setAuto('A', true);
  for (let i = 0; i < 4; i++) mix.sync();
  await advance(30000);
  assert.deepEqual(loads, [['B', 'third']]);
  assert.equal(state.B.playing, true);
  assert.equal(mix.isAuto('B'), true);
  assert.equal(mix.isAuto('A'), false);
  assert.equal(state.cross, 0.62);
  state.B.time = state.B.duration - 2;
  await advance(25000);
  assert.deepEqual(loads, [['B', 'third'], ['A', 'selected']]);
  assert.deepEqual(switched, ['B', 'A']);
  assert.equal(state.A.playing, true);
  assert.equal(state.B.playing, false);
  assert.equal(mix.isAuto('A'), true);
  assert.equal(mix.isAuto('B'), false);
  assert.equal(state.cross, -0.62);
});

test('a target media error during preparation leaves the audible deck playing', async () => {
  const { state, mix, advance, switched } = studio();
  const request = mix.choose('A', 'selected');
  await settle();
  state.B.audioFailed = true;
  state.B.audioRunning = false;
  await advance(15000);
  await request;
  assert.equal(state.A.playing, true);
  assert.equal(state.B.playing, false);
  assert.equal(state.A.loopBeats, 0);
  assert.deepEqual(switched, []);
});

test('Auto spends every track in the round before playing a repeat', async () => {
  const {mix, state, loads, advance} = studio({random: 0});
  mix.setAuto('A', true);
  let current = 'A';
  for (let i = 0; i < 5; i++) {
    state[current].time = state[current].duration - 3;
    mix.sync();
    await advance(16000);
    current = current === 'A' ? 'B' : 'A';
  }
  const played = ['original', ...loads.map(([,id]) => id)];
  const expected = new Set(tracks.map(track => track.id));
  assert.deepEqual(new Set(played.slice(0, 3)), expected);
  assert.deepEqual(new Set(played.slice(3, 6)), expected);
  assert.notEqual(played[2], played[3]);
});
