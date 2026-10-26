const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'theme-morph.js'), 'utf8');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function fixture({ native = true, throws = false, reduced = false } = {}) {
  let now = 0, nextId = 0, rafCalls = 0, commits = 0;
  const timers = new Map(), transitions = [];
  const target = () => ({
    listeners: new Map(),
    addEventListener(name, fn) { const list = this.listeners.get(name) || []; list.push(fn); this.listeners.set(name, list); },
    dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); },
    emit(type) { this.dispatchEvent({ type }); },
  });
  const style = initial => ({
    values: new Map(Object.entries(initial || {})), priorities: new Map(), writes: [],
    getPropertyValue(key) { return this.values.get(key) || ''; },
    getPropertyPriority(key) { return this.priorities.get(key) || ''; },
    setProperty(key, value, priority = '') { this.values.set(key, String(value)); this.priorities.set(key, priority); this.writes.push({ key, value: String(value), at: now }); },
    removeProperty(key) { this.values.delete(key); this.priorities.delete(key); },
  });
  const element = initial => {
    const classes = new Set();
    return { style: style(initial), dataset: {}, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) } };
  };
  const root = element({ '--theme-bg': '#000000' });
  const panel = element({ '--theme-bg': '#123456' });
  panel.style.priorities.set('--theme-bg', 'important');
  const document = Object.assign(target(), { hidden: false, documentElement: root, body: element(), head: { append() {} }, createElement: () => ({}), querySelector: () => panel });
  const preference = Object.assign(target(), { matches: reduced });
  const window = target();
  window.addEventListener('inteon-theme-frame', () => commits++);
  const controller = {
    active: null,
    claim(name) { if (this.active) return false; this.active = name; window.emit('inteon-effects-change'); return true; },
    release(name) { if (this.active !== name) return; this.active = null; window.emit('inteon-effects-change'); },
  };
  window.inteonHomeEffects = controller;
  if (native) document.startViewTransition = callback => {
    if (throws) throw new Error('native transition unavailable');
    let ready, ended, failed;
    const transition = {
      skips: 0,
      ready: new Promise(resolve => { ready = resolve; }),
      finished: new Promise((resolve, reject) => { ended = resolve; failed = reject; }),
      update() { callback(); ready(); },
      end: () => ended(), fail: () => failed(new Error('transition aborted')),
      skipTransition() { this.skips++; ended(); },
    };
    transitions.push(transition); return transition;
  };
  const setTimeout = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  const clearTimeout = id => timers.delete(id);
  const sandbox = {
    document, window, matchMedia: () => preference,
    getComputedStyle: el => ({ getPropertyValue: key => el.style.getPropertyValue(key) || root.style.getPropertyValue(key) || '0' }),
    Event: class { constructor(type) { this.type = type; } },
    setTimeout, clearTimeout,
    requestAnimationFrame(fn) { rafCalls++; return setTimeout(() => fn(now), 16); },
    cancelAnimationFrame: clearTimeout,
    performance: { now: () => now },
  };
  vm.runInNewContext(source, sandbox);
  return {
    api: window.inteonThemeMorph, window, document, root, panel, preference, controller, timers, transitions,
    commits: () => commits, rafCalls: () => rafCalls,
    apply(name, color = '#225588', animate = true) { window.inteonThemeMorph.apply({ '--theme-bg': color }, 'dark', animate, { name }); },
    advance(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        assert.ok(++count < 10000, 'bounded timer execution');
        now = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      now = end;
    },
  };
}

test('native palette transition commits tokens once without a JS animation frame loop', async () => {
  const f = fixture();
  f.apply('abyss');
  assert.equal(f.api.active, true);
  assert.equal(f.controller.active, 'theme');
  assert.equal(f.root.style.writes.length, 0, 'old palette remains until snapshot update');
  f.transitions[0].update();
  const count = f.root.style.writes.length;
  assert.ok(count > 0);
  assert.equal(f.root.dataset.theme, 'abyss');
  f.advance(3000);
  assert.equal(f.root.style.writes.length, count);
  assert.equal(f.rafCalls(), 0);
  f.transitions[0].end(); await flush();
  assert.equal(f.root.style.writes.length, count);
  assert.equal(f.commits(), 1);
  assert.equal(f.api.active, false);
  assert.equal(f.controller.active, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.panel.style.getPropertyValue('--theme-bg'), '#123456');
  assert.equal(f.panel.style.getPropertyPriority('--theme-bg'), 'important');
  assert.equal(f.panel.classList.contains('is-palette-pinned'), false);
});

test('busy scene queues only the latest palette and releases it without stealing ownership', async () => {
  const f = fixture();
  f.controller.active = 'storm';
  f.apply('old', '#112233'); f.apply('latest', '#445566');
  assert.equal(f.api.pending, true);
  assert.equal(f.transitions.length, 0);
  assert.equal(f.controller.active, 'storm');
  f.advance(500);
  assert.equal(f.timers.size, 1);
  assert.equal(f.root.style.writes.length, 0);
  f.controller.release('storm');
  assert.equal(f.api.pending, false);
  assert.equal(f.controller.active, 'theme');
  assert.equal(f.transitions.length, 1);
  f.transitions[0].update(); f.transitions[0].end(); await flush();
  assert.equal(f.root.dataset.theme, 'latest');
  assert.equal(f.root.style.getPropertyValue('--theme-bg'), '#445566');
});

test('superseded native update and completion callbacks cannot overwrite or unlock the newest palette', async () => {
  const f = fixture();
  f.apply('old', '#112233');
  const old = f.transitions[0];
  f.apply('latest', '#445566');
  const latest = f.transitions[1];
  assert.equal(old.skips, 1);
  old.update(); old.end(); await flush();
  assert.equal(f.root.style.writes.length, 0);
  assert.equal(f.api.active, true);
  assert.equal(f.controller.active, 'theme');
  latest.update(); latest.end(); await flush();
  assert.equal(f.root.dataset.theme, 'latest');
  assert.equal(f.commits(), 1);
  assert.equal(f.controller.active, null);
});

test('pointer, keyboard, and wheel reveal the live palette immediately and safely before snapshot update', async () => {
  for (const event of ['pointerdown', 'keydown', 'wheel']) {
    const f = fixture();
    f.apply('interactive');
    f.document.emit(event);
    assert.equal(f.api.active, false);
    assert.equal(f.root.dataset.theme, 'interactive');
    assert.equal(f.controller.active, null);
    assert.equal(f.root.classList.contains('is-theme-native'), false);
    const count = f.root.style.writes.length;
    f.transitions[0].update(); await flush();
    assert.equal(f.root.style.writes.length, count);
    assert.equal(f.commits(), 1);
  }
});

test('native deadline releases a transition whose completion never arrives', async () => {
  const f = fixture();
  f.apply('deadline');
  f.advance(4499); assert.equal(f.api.active, true);
  f.advance(1); await flush();
  assert.equal(f.api.active, false);
  assert.equal(f.root.dataset.theme, 'deadline');
  assert.equal(f.controller.active, null);
  assert.equal(f.timers.size, 0);
});

test('reduced motion and hidden-page requests commit immediately without snapshots or RAF work', () => {
  for (const mode of ['reduced', 'hidden']) {
    const f = fixture({ reduced: mode === 'reduced' });
    if (mode === 'hidden') f.document.hidden = true;
    f.apply(mode);
    assert.equal(f.api.active, false);
    assert.equal(f.root.dataset.theme, mode);
    assert.equal(f.transitions.length, 0);
    assert.equal(f.rafCalls(), 0);
    assert.equal(f.timers.size, 0);
  }
});

test('pagehide clears a queued palette and native transitions finish cleanly on hide', async () => {
  const queued = fixture();
  queued.controller.active = 'acid'; queued.apply('queued');
  queued.window.emit('pagehide');
  assert.equal(queued.api.pending, false);
  assert.equal(queued.timers.size, 0);
  assert.equal(queued.controller.active, 'acid');
  const f = fixture();
  f.apply('hidden');
  f.document.hidden = true; f.document.emit('visibilitychange'); await flush();
  assert.equal(f.api.active, false);
  assert.equal(f.controller.active, null);
  assert.equal(f.root.dataset.theme, 'hidden');
  assert.equal(f.timers.size, 0);
});

test('hiding a queued palette cancels its retry timer without touching the current scene owner', () => {
  const f = fixture();
  f.controller.active = 'storm';
  f.apply('queued');
  assert.equal(f.api.pending, true);
  f.document.hidden = true; f.document.emit('visibilitychange');
  assert.equal(f.api.pending, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.active, 'storm');
  f.advance(10000);
  assert.equal(f.transitions.length, 0);
});

test('a rejected native transition still commits the latest palette and releases ownership', async () => {
  const f = fixture();
  f.apply('rejected');
  f.transitions[0].fail(); await flush();
  assert.equal(f.api.active, false);
  assert.equal(f.root.dataset.theme, 'rejected');
  assert.equal(f.controller.active, null);
  assert.equal(f.commits(), 1);
  assert.equal(f.timers.size, 0);
});

test('unsupported or throwing native APIs retain an animated bounded fallback and final palette', () => {
  for (const options of [{ native: false }, { throws: true }]) {
    const f = fixture(options);
    f.apply('fallback', '#88aacc');
    assert.equal(f.api.active, true);
    f.advance(2000);
    const frameTimes = new Set(f.root.style.writes.map(write => write.at));
    assert.ok(frameTimes.size > 1 && frameTimes.size <= 62, 'fallback palette writes stay at or below 30 Hz');
    f.advance(2300);
    assert.equal(f.api.active, false);
    assert.equal(f.controller.active, null);
    assert.equal(f.root.style.getPropertyValue('--theme-bg'), '#88aacc');
    assert.equal(f.root.dataset.theme, 'fallback');
    assert.equal(f.commits(), 1);
    assert.equal(f.timers.size, 0);
  }
});
