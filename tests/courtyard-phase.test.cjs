const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clock = fs.readFileSync(path.join(__dirname, '../yard/solar-clock.js'), 'utf8').replace(/^export /gm, '');
const redirect = fs.readFileSync(path.join(__dirname, '../yard/index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const site = 'https://inteonmteca.online';
const minute = 60000, day = 1440 * minute;
const wrap = time => ((time % day) + day) % day;

function localTime(epoch) {
  const d = new Date(epoch);
  return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
}

function tabStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

function open(storage, at, {type='navigate', from='', newTab=false, isRedirect=false} = {}) {
  const window = new EventTarget();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [at])); }
    static now() { return at; }
  }
  Object.assign(window, {location:{origin:site, protocol:'https:', replace() {}}, document:{referrer:from},
    performance:{getEntriesByType:() => [{type}]}, sessionStorage:storage, opener:newTab ? {} : null, history:{length:newTab ? 1 : 2}});
  const scope = vm.createContext({window, location:window.location, document:window.document,
    performance:window.performance, sessionStorage:storage, Date:ClockDate});
  if (isRedirect) { vm.runInContext(redirect, scope); return; }
  vm.runInContext(clock, scope);
  return {time:epoch => scope.courtyardClockTime(epoch), effects:epoch => scope.courtyardEffectSeconds(epoch), restore() {
    window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted:true}));
  }};
}

test('entry uses local wall time minus twenty minutes, including fractional time zones and midnight', () => {
  const oldZone = process.env.TZ;
  try {
    for (const zone of ['Asia/Kathmandu', 'America/St_Johns', 'Europe/Moscow']) {
      process.env.TZ = zone;
      for (const hour of [0, 11, 23]) {
        const start = new Date(2026, 2, 20, hour, hour === 23 ? 55 : 5, 37, 123).getTime();
        const page = open(tabStorage(), start);
        assert.equal(page.time(start), wrap(localTime(start) - 20 * minute));
        assert.equal(page.time(start + 1.25 * minute), wrap(localTime(start) - 20 * minute - 353.75 * minute));
        assert.equal(page.time(start + 2.5 * minute), wrap(localTime(start) + day / 2 - 7.5 * minute));
        assert.equal(page.time(start + 5 * minute), localTime(start + 5 * minute));
      }
    }
  } finally {
    if (oldZone === undefined) delete process.env.TZ; else process.env.TZ = oldZone;
  }
});

test('each full turn after the first lasts 2.5, 1.25, then 5 minutes and repeats during tab suspension', () => {
  const start = Date.UTC(2026, 6, 7, 9, 12, 13, 14);
  const page = open(tabStorage(), start);
  const sync = localTime(start + 5 * minute);
  let boundary = start + 5 * minute;
  for (const duration of [2.5, 1.25, 5, 2.5, 1.25, 5]) {
    assert.equal(page.time(boundary), sync);
    for (const fraction of [.25, .5, .75]) {
      assert.equal(page.time(boundary + fraction * duration * minute), wrap(sync - fraction * day));
    }
    boundary += duration * minute;
    const before = page.time(boundary - 1);
    assert.ok(Math.abs(wrap(before - page.time(boundary)) - day / (duration * minute)) < .001);
  }
  assert.equal(page.time(boundary + (8.75 * 200 + .625) * minute), wrap(sync - day / 4));
});

test('the first rendezvous follows the local hour when daylight saving changes', () => {
  const oldZone = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  try {
    for (const start of [Date.parse('2026-03-29T00:58Z'), Date.parse('2026-10-25T00:58Z')]) {
      const page = open(tabStorage(), start);
      assert.equal(page.time(start), wrap(localTime(start) - 20 * minute));
      assert.equal(page.time(start + 5 * minute), localTime(start + 5 * minute));
      // The actual change of offset occurs at minute two. The simulated sun must keep moving backwards.
      const change = start + 2 * minute;
      const advance = wrap(page.time(change - 1) - page.time(change + 1));
      assert.ok(advance > 0 && advance < 640);
    }
  } finally {
    if (oldZone === undefined) delete process.env.TZ; else process.env.TZ = oldZone;
  }
});

test('navigation and history retain the visit; refreshes and independent visits restart from the device clock', () => {
  const storage = tabStorage();
  const start = Date.UTC(2026, 2, 20);
  const later = start + 4 * minute;
  const home = open(storage, start);
  const progressed = home.time(later);
  for (const opts of [{from:site+'/'}, {type:'back_forward'}]) {
    assert.equal(open(storage, later, opts).time(later), progressed);
  }
  for (const opts of [{type:'reload', from:site+'/'}, {}, {from:'https://example.org/'}, {from:site+'/', newTab:true}]) {
    const independentStorage = tabStorage();
    open(independentStorage, start);
    assert.equal(open(independentStorage, later, opts).time(later), wrap(localTime(later) - 20 * minute));
  }
  const refreshed = open(storage, later, {type:'reload', from:site+'/'});
  home.restore();
  assert.equal(home.time(later + minute), refreshed.time(later + minute));
});

test('the yard redirect preserves an internal visit and clears the stored anchor on direct entry', () => {
  const storage = tabStorage();
  const start = Date.UTC(2026, 2, 20), later = start + 4 * minute;
  const previous = open(storage, start);
  open(storage, later, {isRedirect:true, from:site+'/listening-room.html'});
  assert.equal(open(storage, later, {from:site+'/yard/'}).time(later), previous.time(later));
  open(storage, later, {isRedirect:true});
  assert.equal(open(storage, later, {from:site+'/yard/'}).time(later), wrap(localTime(later) - 20 * minute));
});

test('unavailable or corrupt storage falls back to a fresh continuous local visit', () => {
  const fail = () => { throw Error('blocked'); };
  const broken = tabStorage();
  broken.setItem('inteon.courtyard.visit-clock-v2', '{"invalid":true}');
  const start = Date.UTC(2026, 2, 20);
  for (const storage of [broken, {getItem:fail, setItem:fail}]) {
    const page = open(storage, start, {from:site+'/'});
    assert.equal(page.time(start), wrap(localTime(start) - 20 * minute));
    page.restore();
    assert.equal(page.time(start + 5 * minute), localTime(start + 5 * minute));
  }
});

test('effects run backward continuously across midnight and every lap boundary', () => {
  const start = new Date(2026, 6, 1, 0, 22).getTime();
  const page = open(tabStorage(), start);
  const normal = 72_000;
  let elapsed = 0, phase = page.effects(start);
  assert.equal(phase, wrap(localTime(start) - 20 * minute) / normal);
  for (const [duration, retreat] of [[5, day - 25 * minute], [2.5, day], [1.25, day], [5, day], [2.5, day]]) {
    for (const fraction of [.001, .5, .999, 1]) {
      const at = start + (elapsed + duration * fraction) * minute;
      assert.ok(Math.abs(page.effects(at) - (phase - fraction * retreat / normal)) < 1e-8);
      assert.ok(Math.abs(wrap(page.effects(at) * normal) - page.time(at)) < .001);
    }
    phase -= retreat / normal;
    elapsed += duration;
  }
});

test('earlier forward and reverse visits keep their start and use the new first sync', () => {
  const start = Date.UTC(2026, 3, 12), storage = tabStorage(), at = start + 4 * minute;
  const fresh = open(tabStorage(), start);
  for (const [firstLapMs, firstAdvanceMs] of [[undefined,day+40*minute], [undefined,-day+40*minute], [10*minute,-day+30*minute]]) {
    storage.setItem('inteon.courtyard.visit-clock-v2', JSON.stringify({
      startEpochMs:start, startTimeMs:fresh.time(start), firstLapMs, firstAdvanceMs,
    }));
    const upgraded = open(storage, at, {from:site+'/'});
    for (const minuteOffset of [0,4,5,7.5,8.75,13.75,41]) {
      const epoch = start + minuteOffset * minute;
      assert.equal(upgraded.effects(epoch),fresh.effects(epoch));
    }
  }
});
