const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const constants = source.slice(source.indexOf('const THEME_MIN_MS ='), source.indexOf('// Curated dark palettes'));
const keys = source.slice(source.indexOf('const themeStorageKey ='), source.indexOf('const localSessionStorageKey ='));
const state = source.slice(source.indexOf('let themeRotationTimer ='), source.indexOf('let themeShiftTimer ='));
const storage = source.slice(source.indexOf('const readStoredValue ='), source.indexOf('const readStoredJson ='));
const behavior = source.slice(source.indexOf('const themeSliderToDuration ='), source.indexOf('const setAuthStatus ='));
const durationKey = 'inteonmteca-theme-duration';
const dayKey = 'inteonmteca-theme-duration-day';
const at = (day, hour = 12, minute = 0, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();

function fixture({ saved = new Map(), now = at(26), unavailable = false } = {}) {
  let clock = now;
  let nextId = 0;
  const timers = new Map();
  const changes = [];
  const target = () => ({
    listeners: new Map(),
    addEventListener(name, fn) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(fn); this.listeners.set(name, listeners);
    },
    dispatch(name) { for (const fn of this.listeners.get(name) || []) fn(); },
  });
  const window = Object.assign(target(), {
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: clock + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    inteonThemeMorph: { active: false, duration: 4000, apply(tokens, mood, animate, { name }) {
      document.documentElement.dataset.theme = name;
      changes.push({ name, at: clock });
    } },
  });
  const document = Object.assign(target(), {
    hidden: false,
    body: { classList: { contains: () => false } },
    documentElement: { dataset: { theme: 'graphite' }, style: { setProperty() {} } },
  });
  const themeDuration = Object.assign(target(), { value: '227' });
  const themeSelect = Object.assign(target(), { value: 'graphite' });
  const sandbox = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    localStorage: {
      getItem(key) { if (unavailable) throw new Error('storage disabled'); return saved.get(key) ?? null; },
      setItem(key, value) { if (unavailable) throw new Error('storage disabled'); saved.set(key, value); },
    },
    window, document, themeDuration, themeSelect, themeDurationOutput: {}, themeStatus: {},
    themeHint: null, themeClose: null, themeRandom: null,
    themeNames: ['graphite', 'abyss'],
    themesById: new Map(['graphite', 'abyss'].map(id => [id, { name: id, tokens: {}, mood: 'dark' }])),
    populateThemeSelect() {},
    performance: { now: () => clock },
    perceptionLastFrame: 0, inkLastFrame: 0, logoLastFrame: 0, lastVisualTick: 0, windLastTick: 0,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${constants}\n${keys}\n${state}\n${storage}\n${behavior}\n` +
    'globalThis.api = { initializeThemeSystem, currentThemeDuration, themeDurationToSlider, localThemeDay };', sandbox);
  sandbox.api.initializeThemeSystem();
  return {
    ...sandbox, saved, timers, changes,
    advance(ms) {
      const end = clock + ms;
      let executions = 0;
      while (true) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        assert.ok(++executions < 10000, 'bounded timer execution');
        clock = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      clock = end;
    },
    jumpTo(value) { clock = value; },
    setDuration(ms) {
      themeDuration.value = String(sandbox.api.themeDurationToSlider(ms));
      themeDuration.dispatch('input'); themeDuration.dispatch('change');
      return sandbox.api.currentThemeDuration();
    },
    rotationDelay() { return Math.min(...[...timers.values()].map(t => t.delay)); },
  };
}

test('default is exactly one minute in UI and timer, including an active transition', () => {
  const f = fixture();
  assert.equal(f.api.currentThemeDuration(), 60000);
  assert.equal(f.themeDurationOutput.textContent, '1 минута');
  assert.equal(f.saved.get(durationKey), '60000');
  assert.equal(f.rotationDelay(), 60000);
  assert.match(html, /id="theme-duration"[^>]*value="227"/);
  assert.match(html, /id="theme-duration-output"[^>]*>1 минута</);
  f.window.inteonThemeMorph.active = true;
  f.advance(60000);
  assert.equal(f.changes.length, 2);
  assert.equal(f.rotationDelay(), 60000, 'transition time does not extend the minute');
});

test('today\'s manual interval survives focus and reload without resetting its timer', () => {
  const f = fixture();
  const chosen = f.setDuration(120000);
  assert.equal(chosen, 120000);
  const before = [...f.timers.values()].find(t => t.delay === chosen).at;
  f.advance(10000); f.window.dispatch('focus'); f.window.dispatch('pageshow');
  assert.equal([...f.timers.values()].find(t => t.delay === chosen).at, before);
  assert.equal(f.timers.size, 2);
  const reload = fixture({ saved: f.saved, now: at(26, 15) });
  assert.equal(reload.api.currentThemeDuration(), chosen);
  assert.equal(reload.rotationDelay(), chosen);
});

test('yesterday or an undated legacy preference resets once, then today\'s choice wins', () => {
  for (const savedDay of [undefined, '2026-10-25']) {
    const saved = new Map([[durationKey, '604800000']]);
    if (savedDay) saved.set(dayKey, savedDay);
    const f = fixture({ saved });
    assert.equal(f.api.currentThemeDuration(), 60000);
    assert.equal(saved.get(dayKey), '2026-10-26');
    f.setDuration(180000);
    assert.equal(fixture({ saved }).api.currentThemeDuration(), 180000);
  }
});

test('midnight resets an open page and replaces the old long rotation deadline', () => {
  const f = fixture({ now: at(26, 23, 59, 50) });
  f.setDuration(604800000);
  f.advance(10000);
  assert.equal(f.api.currentThemeDuration(), 60000);
  assert.equal(f.saved.get(dayKey), '2026-10-27');
  assert.equal(f.themeDurationOutput.textContent, '1 минута');
  assert.equal(f.timers.size, 2);
  assert.equal(f.changes.length, 1, 'midnight does not immediately change the palette');
  f.advance(59999); assert.equal(f.changes.length, 1);
  f.advance(1); assert.equal(f.changes.length, 2);
});

test('hidden/pagehide stops timers; returning next day resets once without duplicate timers', () => {
  const f = fixture();
  f.setDuration(120000);
  f.document.hidden = true; f.document.dispatch('visibilitychange');
  assert.equal(f.timers.size, 0);
  f.advance(24 * 60 * 60 * 1000);
  assert.equal(f.changes.length, 1);
  f.document.hidden = false; f.document.dispatch('visibilitychange');
  assert.equal(f.api.currentThemeDuration(), 60000);
  assert.equal(f.timers.size, 2);
  f.setDuration(180000); f.window.dispatch('focus');
  assert.equal(f.api.currentThemeDuration(), 180000);
  f.window.dispatch('pagehide'); assert.equal(f.timers.size, 0);
  f.window.dispatch('pageshow'); f.window.dispatch('pageshow');
  assert.equal(f.timers.size, 2);
  assert.equal(f.api.currentThemeDuration(), 180000);
});

test('clock/date changes are checked on focus even when midnight timer was not delivered', () => {
  const f = fixture();
  f.setDuration(120000);
  f.jumpTo(at(28)); f.window.dispatch('focus');
  assert.equal(f.api.currentThemeDuration(), 60000);
  assert.equal(f.saved.get(dayKey), '2026-10-28');
  assert.equal(f.timers.size, 2);
});

test('unavailable storage retains today\'s override in memory and still resets next day', () => {
  const f = fixture({ unavailable: true });
  assert.equal(f.api.currentThemeDuration(), 60000);
  f.setDuration(120000); f.window.dispatch('focus');
  assert.equal(f.api.currentThemeDuration(), 120000);
  f.jumpTo(at(27)); f.window.dispatch('focus');
  assert.equal(f.api.currentThemeDuration(), 60000);
  f.setDuration(180000); f.window.dispatch('pageshow');
  assert.equal(f.api.currentThemeDuration(), 180000);
});

test('a late-returning tab preserves the preference already chosen today in another tab', () => {
  const f = fixture();
  f.setDuration(180000);
  f.document.hidden = true; f.document.dispatch('visibilitychange');
  f.saved.set(dayKey, '2026-10-27');
  f.saved.set(durationKey, '120000');
  f.jumpTo(at(27));
  f.document.hidden = false; f.document.dispatch('visibilitychange');
  assert.equal(f.api.currentThemeDuration(), 120000);
  assert.equal(f.saved.get(durationKey), '120000');
  f.advance(120000);
  assert.equal(f.saved.get(durationKey), '120000', 'automatic rotations do not overwrite the shared preference');
});
