const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'home-effects.js'), 'utf8');

test('mobile foreground watchdog uses wall time without borrowing the ambient freeze', () => {
 const h=fixture();let stopped=0;h.window.inteonMobileLogo={stop(){stopped++;h.api.release('mobile-scatter');}};
 assert.equal(h.api.claim('mobile-scatter'),true);h.advance(7000);
 assert.equal(stopped,1);assert.equal(h.api.active,null);assert.equal(h.root.dataset.ambientPhase,'running');
});
function fixture({ hidden = false } = {}) {
  let now = 10000;
  let nextId = 0;
  const timers = new Map();
  const mutations = [];
  const phaseEvents = [];
  const listeners = () => ({
    handlers: new Map(),
    addEventListener(name, fn) {
      const list = this.handlers.get(name) || [];
      list.push(fn); this.handlers.set(name, list);
    },
    dispatchEvent(event) { for (const fn of this.handlers.get(event.type) || []) fn(event); },
    emit(type) { this.dispatchEvent({ type }); },
  });
  const classes = new Set();
  const root = { dataset: {} };
  const document = Object.assign(listeners(), {
    hidden, documentElement: root,
    body: { classList: { contains: name => classes.has(name) } },
    querySelectorAll: () => [],
  });
  const window = listeners();
  window.addEventListener('inteon-ambient-change', () => phaseEvents.push({ at: now, phase: root.dataset.ambientPhase }));
  const createTimer = (fn, delay, interval = false) => {
    const id = ++nextId; timers.set(id, { fn, at: now + delay, delay, interval }); return id;
  };
  const sandbox = {
    document, window,
    performance: { now: () => now },
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(fn) { mutations.push(fn); } observe() {} },
    matchMedia: () => Object.assign(listeners(), { matches: false }),
    setTimeout: (fn, delay) => createTimer(fn, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => createTimer(fn, delay, true),
    clearInterval: id => timers.delete(id),
  };
  vm.runInNewContext(source, sandbox);
  return {
    window, document, root, timers, phaseEvents,
    now: () => now,
    jump: ms => { now += ms; },
    api: window.inteonHomeEffects,
    phaseTimers: () => [...timers.values()].filter(timer => !timer.interval),
    advance(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        assert.ok(++count < 10000, 'bounded timer loop');
        now = Math.max(now, due[1].at);
        if (due[1].interval) due[1].at = now + due[1].delay;
        else timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
    setClass(name, value) {
      if (value) classes.add(name); else classes.delete(name);
      mutations.forEach(fn => fn());
    },
  };
}


for (const scattered of [false, true]) test(`five-second running / two-second rest cadence, scattered=${scattered}`, () => {
  const f=fixture(), start=f.api.ambientNow();
  f.api.setLogoScattered('logo',scattered);
  for(let i=0;i<5;i++) {
    assert.equal(f.api.ambientPaused,false);
    f.advance(4999); assert.equal(f.api.ambientPaused,false);
    f.advance(1); assert.equal(f.api.ambientPaused,true);
    const held=f.api.ambientNow();
    f.advance(1999); assert.equal(f.api.ambientNow(),held);
    f.advance(1); assert.equal(f.api.ambientPaused,false);
  }
  assert.equal(f.api.ambientNow()-start,25000);
  assert.equal(f.phaseTimers().length,1);
});
test('logo mode changes preserve the common epoch and an in-progress freeze',()=>{
  const f=fixture(); f.advance(4900); f.api.setLogoScattered('a',true);
  f.advance(100); assert.equal(f.api.ambientPaused,true);
  f.api.setLogoScattered('a',false); assert.equal(f.api.ambientPaused,true);
  f.advance(1999); assert.equal(f.api.ambientPaused,true);
  f.advance(1); assert.equal(f.api.ambientPaused,false);
});
test('hidden time does not advance motion or allocate timers; missed freezes are skipped',()=>{
  const f=fixture(), start=f.api.ambientNow();
  f.advance(500); f.document.hidden=true; f.document.emit('visibilitychange');
  assert.equal(f.timers.size,0); f.advance(5000);
  assert.equal(f.api.ambientNow()-start,500);
  f.document.hidden=false; f.document.emit('visibilitychange');
  assert.equal(f.api.ambientPaused,false);
  f.advance(6499); assert.equal(f.api.ambientPaused,false);
  f.advance(1); assert.equal(f.api.ambientPaused,true);
});
test('returning during an accepted freeze keeps only its remainder',()=>{
  const f=fixture(); f.advance(5100); const held=f.api.ambientNow();
  f.document.hidden=true; f.document.emit('visibilitychange'); f.advance(300);
  f.document.hidden=false; f.document.emit('visibilitychange');
  assert.equal(f.api.ambientPaused,true); f.advance(1599);
  assert.equal(f.api.ambientPaused,true); f.advance(1);
  assert.equal(f.api.ambientPaused,false); assert.equal(f.api.ambientNow(),held);
});
test('page lifecycle invalidates queued callbacks and leaves one schedule',()=>{
  const f=fixture(), stale=f.phaseTimers()[0].fn;
  f.advance(500); f.window.emit('pagehide'); assert.equal(f.timers.size,0);
  f.advance(3000); f.window.emit('pageshow'); stale();
  assert.equal(f.api.ambientPaused,false); assert.equal(f.phaseTimers().length,1);
  assert.equal([...f.timers.values()].filter(t=>t.interval).length,1);
});
test('virtual deadlines count active time across a two-second freeze and support cancellation',()=>{
  const f=fixture(), start=f.api.ambientNow(); let fired=null, cancelled=0;
  f.api.setMotionTimeout(()=>{fired=f.api.ambientNow()-start},5500);
  const id=f.api.setMotionTimeout(()=>cancelled++,500);
  f.api.clearMotionTimeout(id);
  f.advance(7499); assert.equal(fired,null);
  f.advance(1); assert.equal(fired,5500); assert.equal(cancelled,0);
});
test('motion callbacks can cancel another callback and schedule subsequent work',()=>{
  const f=fixture(), calls=[]; let second;
  f.api.setMotionTimeout(()=>{calls.push('first');f.api.clearMotionTimeout(second);f.api.setMotionTimeout(()=>calls.push('nested'),100)},500);
  second=f.api.setMotionTimeout(()=>calls.push('cancelled'),500);
  f.advance(600); assert.deepEqual(calls,['first','nested']);
});
test('large delayed deliveries skip old cycles without a timer burst',()=>{
  const f=fixture(); f.jump(7000 * 12 + 500); f.advance(0);
  assert.equal(f.api.ambientPaused,false); assert.equal(f.phaseTimers().length,1);
  f.advance(4500); assert.equal(f.api.ambientPaused,true);
});
test('logo watchdogs expire by moving time, not the alternating rests',()=>{
  for(const [name,limit,moduleName] of [['acid',16000,'inteonLogoAcid'],['storm',90000,'inteonLogoStorm'],['recursion',8000,'inteonLogoMaterials']]) {
    const f=fixture(); let stops=0;
    f.window[moduleName]={stop(){stops++}};
    f.api.claim(name); const start=f.api.ambientNow();
    f.advance(limit+1000); assert.equal(stops,0,name);
    while(f.api.active) f.advance(1000);
    assert.equal(stops,1,name); assert.ok(f.api.ambientNow()-start>limit);
  }
});
