const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('manual return saves pose and a cached yard gets a fresh cancellable deadline', () => {
  const store = new Map(), timers = new Map(), intervals = new Map(), events = {};
  let id = 0, redirects = 0;
  const window = {
    setTimeout: fn => { timers.set(++id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.set(++id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../street-return.js'), 'utf8'), {
    window, Date, localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
  });
  const street = window.inteonStreet;
  street.noteExit();
  street.armReturn({ replace: () => redirects++ }, 'http:', null, () => ({x:3,z:4,yaw:1,pitch:0}));
  assert.equal(typeof events.pagehide, 'function', 'Manual navigation must save pose and cancel the old timer');
  events.pagehide({persisted:true});
  assert.equal(street.resumePose().x, 3);
  assert.equal(timers.size, 0);
  assert.equal(intervals.size, 0);
  events.pageshow({persisted:true});
  assert.equal(timers.size, 1);
  assert.equal(intervals.size, 1);
  const deadline = [...timers.values()][0];
  deadline();
  assert.equal(redirects, 1);
  assert.equal(intervals.size, 0);
});
