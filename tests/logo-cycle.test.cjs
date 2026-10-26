const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

function fixture() {
  let now = 0;
  let nextId = 0;
  let frameRequests = 0;
  let resolveAcid;
  const acid = new Promise(resolve => { resolveAcid = resolve; });
  const timers = new Map();
  const events = new Map();
  const renders = [];
  const transitions = [];
  class Transition {
    constructor(playState = 'running') { this.playState = playState; this.pauses = 0; this.plays = 0; }
    pause() { this.playState = 'paused'; this.pauses++; }
    play() { this.playState = 'running'; this.plays++; }
  }
  const controller = { ambientPaused: false, ambientBlocked: false, suspended: false };
  const window = {
    inteonHomeEffects: controller,
    inteonLogoAcid: { run: () => acid },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { events.set(name, fn); },
  };
  const cycle = source.slice(source.indexOf('let logoCycleVariant ='), source.indexOf('matrixElements.forEach((element) => {', source.indexOf('let logoCycleVariant =')));
  const scheduling = source.slice(source.indexOf('const logoTimers ='), source.indexOf('// Text is intentionally live', source.indexOf('const logoTimers =')));
  const resume = source.slice(source.indexOf("window.addEventListener('inteon-ambient-change'"), source.indexOf('let ambientWasBlocked', source.indexOf("window.addEventListener('inteon-ambient-change'")));
  assert.ok(scheduling.includes('cancelLogoTimer'), 'logo timers expose cancellation helpers');
  const sandbox = {
    window,
    document: { hidden: false },
    isMobileViewport: false,
    reducedMotionPreference: { matches: false },
    logoChaosActive: false, fullReadableMode: false, logoLocked: false,
    logoCycleTimeout: 0, logoChaosCountdown: 10,
    sceneRaf: 0, roomLastRaf: 0, lastVisualTick: 0,
    logoWrap: { classList: { add() {}, remove() {} } },
    logoParticles: { getAnimations: () => transitions },
    CSSTransition: Transition,
    renderLogoMatrix: readable => renders.push(readable),
    randomRange: min => min,
    resetLogoChaosCountdown() {},
    clearTimeout: window.clearTimeout,
    requestAnimationFrame: () => ++frameRequests,
    cancelAnimationFrame() {},
    tickVisuals() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(`${cycle}\n${scheduling}\n${resume}\n` +
    'globalThis.api = { scheduleLogo, cancelLogoTimer, cancelLogoTimers, forceAcid() { logoCycleVariant = 2; runLogoCycle(); }, pending() { return {native: logoTimers.size, deferred: deferredLogoTimers.size}; } };', sandbox);
  return {
    ...sandbox, timers, renders, resolveAcid, transitions, Transition,
    get frameRequests() { return frameRequests; },
    freeze() { controller.ambientPaused = true; events.get('inteon-ambient-change')(); },
    resume() { controller.ambientPaused = false; events.get('inteon-ambient-change')(); },
    advance(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        assert.ok(++count < 1000, 'bounded timer execution');
        now = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      now = end;
    },
  };
}

test('the four-second scatter transition freezes in place and only held transitions resume', () => {
  const f = fixture();
  const moving = new f.Transition(), finished = new f.Transition('finished');
  const externallyPaused = new f.Transition('paused');
  f.transitions.push(moving, finished, externallyPaused, {playState: 'running'});
  f.freeze(); f.freeze();
  assert.equal(moving.playState, 'paused');
  assert.equal(moving.pauses, 1, 'repeated freeze does not rewind or repause');
  assert.equal(finished.pauses, 0);
  f.advance(10000);
  assert.equal(moving.playState, 'paused');
  f.resume(); f.resume();
  assert.equal(moving.playState, 'running');
  assert.equal(moving.plays, 1);
  assert.equal(finished.plays, 0, 'completed transitions cannot restart');
  assert.equal(externallyPaused.plays, 0, 'other owners retain their pause');
});

test('assembling in a resumed callback cannot create a second render loop', () => {
  const f = fixture();
  f.freeze();
  f.api.scheduleLogo(() => f.resume(), 0);
  f.advance(0);
  f.resume();
  assert.equal(f.frameRequests, 1, 'nested phase changes share one pending RAF');
});

test('acid completion schedules the next natural logo cycle with a scene controller present', async () => {
  const f = fixture();
  f.api.forceAcid();
  assert.equal(f.timers.size, 0);
  f.resolveAcid(); await Promise.resolve();
  f.advance(0);
  assert.equal(f.renders.at(-1), true);
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].delay, 3000);
  f.advance(3000);
  assert.equal(f.renders.at(-1), false, 'the next scatter cycle actually starts');
});

test('an acid promise from a canceled lifecycle cannot recreate an animation chain', async () => {
  const f = fixture();
  f.api.forceAcid();
  f.api.cancelLogoTimers();
  f.resolveAcid(); await Promise.resolve();
  assert.equal(f.timers.size, 0);
  assert.equal(f.renders.length, 0, 'stale completion cannot change the current logo state');
});

test('a due logo callback stays held during the frozen phase and resumes exactly once', () => {
  const f = fixture();
  let calls = 0;
  f.api.scheduleLogo(() => calls++, 100);
  f.advance(50); f.window.inteonHomeEffects.ambientPaused = true;
  f.advance(1000);
  assert.equal(calls, 0);
  assert.equal(f.api.pending().deferred, 1);
  f.resume(); f.resume();
  assert.equal(calls, 1);
  assert.equal(f.api.pending().native, 0);
  assert.equal(f.api.pending().deferred, 0);
});

test('canceling a deferred timeout removes it after its native timeout has already fired', () => {
  const f = fixture();
  let calls = 0;
  f.window.inteonHomeEffects.ambientPaused = true;
  const id = f.api.scheduleLogo(() => calls++, 10);
  f.advance(10);
  assert.equal(f.api.pending().deferred, 1);
  f.api.cancelLogoTimer(id);
  f.resume();
  assert.equal(calls, 0);
  assert.equal(f.api.pending().native, 0);
  assert.equal(f.api.pending().deferred, 0);
});

test('canceling all logo timers removes both native and deferred callbacks', () => {
  const f = fixture();
  let calls = 0;
  f.window.inteonHomeEffects.ambientPaused = true;
  f.api.scheduleLogo(() => calls++, 10);
  f.api.scheduleLogo(() => calls++, 1000);
  f.advance(10);
  assert.equal(f.api.pending().deferred, 1);
  assert.equal(f.timers.size, 1);
  f.api.cancelLogoTimers();
  f.resume(); f.advance(2000);
  assert.equal(calls, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.api.pending().native, 0);
  assert.equal(f.api.pending().deferred, 0);
});

test('acid completion during a frozen phase holds its return frame until the next run phase', async () => {
  const f = fixture();
  f.api.forceAcid();
  f.window.inteonHomeEffects.ambientPaused = true;
  f.resolveAcid(); await Promise.resolve(); f.advance(0);
  assert.equal(f.renders.length, 0);
  assert.equal(f.api.pending().deferred, 1);
  f.resume();
  assert.equal(f.renders.at(-1), true);
  assert.equal(f.timers.size, 1, 'the future cycle remains scheduled');
});

test('a new lifecycle created by one resumed callback cancels the rest of the old queue', () => {
  const f = fixture();
  const calls = [];
  f.window.inteonHomeEffects.ambientPaused = true;
  f.api.scheduleLogo(() => { calls.push('reset'); f.api.cancelLogoTimers(); }, 10);
  f.api.scheduleLogo(() => calls.push('stale'), 10);
  f.advance(10); f.resume();
  assert.deepEqual(calls, ['reset']);
  assert.equal(f.api.pending().deferred, 0);
});

test('a busy foreground scene defers the natural logo cycle instead of overlapping it', () => {
  const f = fixture();
  f.window.inteonHomeEffects.active = 'storm';
  f.api.forceAcid();
  assert.equal(f.renders.length, 0);
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].delay, 1000);
  f.window.inteonHomeEffects.active = null;
  f.advance(1000);
  assert.equal(f.timers.size, 0, 'the deferred cycle reached the acid promise');
});
