const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('exit fade continues across documents and a new selection cancels it', () => {
  let now = 1000, next = 0;
  const frames = new Map(), store = new Map(), window = {};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../playback-link.js'), 'utf8'), {
    window, Date: {now: () => now},
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: id => frames.delete(id),
    localStorage: {getItem: k => store.get(k), setItem: (k,v) => store.set(k,v)},
  });
  const advance = time => { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const audio = () => ({volume: .6, paused: false, currentTime: 12, pause() {this.paused = true;}});
  const p = window.inteonPlayback, home = audio();
  p.select(home, 'home'); p.fadeOut(home); p.save(home, {audio: 'media/a.mp3'});
  advance(3000);
  assert.ok(Math.abs(home.volume - .45) < .00001);
  const yard = audio(); p.restore(yard, p.forPage('yard'));
  advance(5000);
  assert.ok(Math.abs(yard.volume - .3) < .00001);
  advance(9000);
  assert.equal(yard.paused, true);
  p.save(yard, {audio: 'media/a.mp3'});
  assert.equal(p.read().playingIntent, false);
  yard.paused = false;
  p.select(yard, 'yard'); p.fadeOut(yard); advance(11000);
  p.select(yard, 'yard'); advance(18000);
  assert.equal(yard.volume, .6);
  assert.equal(yard.paused, false);
});
