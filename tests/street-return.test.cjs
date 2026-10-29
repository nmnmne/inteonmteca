const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const yard = fs.readFileSync(path.join(root, "yard", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const source = fs.readFileSync(path.join(root, "street-return.js"), "utf8");

assert.doesNotMatch(html, /street-return-scale/, "the street duration is not a user control");
assert.match(html, /<a class="street-link" id="street-link" href="yard\/">на улицу<\/a>/);
assert.match(script, /else window\.inteonStreet\?\.prepareExit\(\);/, "navigation without a portal stages an outing for destination entry");
assert.doesNotMatch(script, /inteonStreet\?\.noteExit\(/, "clicking must not consume an outing before the preview succeeds");
assert.match(script, /document\.body\.classList\.toggle\("is-signal", signal\)/, "playback changes the page signal");
assert.match(styles, /body\.is-signal \.topline/, "playing shifts the visible inscriptions");
assert.match(yard, /class="montana"/, "the yard shows a Montana-style countdown");
assert.match(yard, /inteonStreet\?\.armReturn\(\{ replace: url =>[^\n]+location\.protocol, \(left\)/, "the countdown uses the same return deadline through the animated navigation adapter");

const load = (store, iso, { session = new Map(), pathname = "", search = "" } = {}) => {
  const scheduled = [];
  const intervals = [];
  const fixed = new Date(iso).getTime();
  function Clock(...args) {
    if (!new.target) return new Date(fixed).toString();
    return new Date(...(args.length ? args : [fixed]));
  }
  Clock.now = () => fixed;
  Clock.parse = Date.parse;
  Clock.UTC = Date.UTC;
  const context = {
    Date: Clock,
    URLSearchParams,
    location: { pathname, search },
    sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: key => session.delete(key),
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
    setTimeout: (fn, ms) => {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    clearTimeout() {},
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    clearInterval() {},
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { street: context.inteonStreet, scheduled, intervals };
};

assert.equal(load(new Map(), "2026-10-04T12:00:00").street.formatWatch(20), "00:20");
assert.equal(load(new Map(), "2026-10-04T12:00:00").street.formatWatch(65), "01:05");

const day = load(new Map(), "2026-10-04T12:00:00");
assert.equal(day.street.seconds(), 60);
assert.equal(day.street.noteExit(), 60, "the first exit of the day lasts one minute");
assert.equal(day.street.noteExit(), 120, "the second exit lasts two minutes");
assert.equal(day.street.noteExit(), 180, "later exits add one minute");
assert.equal(day.street.noteExit(), 240);
for (let visit = 0; visit < 20; visit += 1) day.street.noteExit();
assert.equal(day.street.seconds(), 900, "later exits remain capped at fifteen minutes");

const memory = new Map();
const morning = load(memory, "2026-10-04T12:00:00");
assert.equal(morning.street.noteExit(), 60);
morning.street.savePose({ x: 3, z: -4, yaw: 1.2, pitch: 0.1 });
assert.equal(morning.street.resumePose().x, 3, "visits before the tenth keep the saved place");
assert.equal(morning.street.resumePose().z, -4);
assert.equal(morning.street.noteExit(), 120);
assert.equal(morning.street.resumePose().x, 3);
morning.street.noteExit();
assert.equal(morning.street.resumePose().x, 3, "the third visit still returns to the saved place");

const evening = load(memory, "2026-10-04T21:00:00");
assert.equal(evening.street.seconds(), 180, "the same day keeps the grown duration");
evening.street.armReturn({ replace() {} }, "https:", null, () => ({ x: 8, z: 2, yaw: 0.4, pitch: 0 }));
assert.equal(evening.scheduled[0].ms, 180000);
assert.equal(evening.intervals[0].ms, 1000);
evening.scheduled[0].fn();
assert.equal(evening.street.resumePose().x, 8, "a visit before the tenth keeps the place saved on the way home");

const tomorrow = load(memory, "2026-10-05T08:00:00");
assert.equal(tomorrow.street.seconds(), 60, "the next day starts again at one minute");
assert.equal(tomorrow.street.noteExit(), 60);
assert.equal(tomorrow.street.resumePose(), null, "a new local day resets the saved place");

const tenth = load(new Map(), "2026-10-04T12:00:00");
for (let visit = 0; visit < 9; visit += 1) tenth.street.noteExit();
tenth.street.savePose({ x: 6, z: 1, yaw: 0, pitch: 0 });
assert.equal(tenth.street.visits(), 9);
assert.equal(tenth.street.resumePose().x, 6);
tenth.street.noteExit();
assert.equal(tenth.street.visits(), 10);
assert.equal(tenth.street.resumePose().x, 6, "restore position before the in-yard scheduled flight");
tenth.street.noteExit();
assert.equal(tenth.street.visits(), 11);
assert.equal(tenth.street.resumePose(), null, "the eleventh outing starts at base, after ten completed outings");
tenth.street.savePose({x: 7, z: 2});
assert.equal(tenth.street.resumePose().x, 7, "the new cycle can save a fresh place");
const persisted = new Map();
const outing = load(persisted, "2026-10-04T12:00:00");
for (let i=0;i<10;i++) outing.street.noteExit();
outing.street.savePose({x: 9, z: 2});
const reload = load(persisted, "2026-10-04T12:01:00");
assert.equal(reload.street.visits(), 10, "reload does not count as an outing");
assert.equal(reload.street.resumePose().x, 9, "reload of the tenth outing retains its pose");
reload.street.noteExit();
assert.equal(reload.street.resumePose(), null, "persisted tenth-outing boundary resets next entry");

let shown = "";
const first = load(new Map(), "2026-10-04T12:00:00");
first.street.noteExit();
first.street.armReturn({ replace() {} }, "http:", (left) => {
  shown = first.street.formatWatch(left);
});
assert.equal(shown, "01:00");
assert.equal(first.scheduled.at(-1).ms, 60000);

const blocked = load(new Map(), "2026-10-04T12:00:00");
blocked.street.armReturn({ replace() { throw new Error("file mode must stay put"); } }, "file:");
assert.equal(blocked.scheduled.length, 0);

const entryStore = new Map(), session = new Map(), iso = "2026-10-04T12:00:00";
const home = load(entryStore, iso, {session, pathname: "/index.html"}).street;
for (let i = 0; i < 9; i++) home.noteExit();
home.savePose({x: 42, z: -2.5, yaw: 1, pitch: .1});
home.armReturn({replace() {}}, "https:");
assert.equal(home.boundaryPlaybackSucceeded(), true);
home.endVisit();
const beforeEntry = new Map(entryStore);
home.prepareExit();
assert.deepEqual(entryStore, beforeEntry, "staging navigation must not change count, pose, time or bonus");
const preview = load(entryStore, iso, {session, pathname: "/yard/", search: "?portal-preview=1"}).street;
assert.equal(preview.visits(), 9);
assert.equal(preview.resumePose().x, 42);
assert.deepEqual(entryStore, beforeEntry, "the preview must not consume a staged entry");
const entered = load(entryStore, iso, {session, pathname: "/yard/"}).street;
assert.equal(entered.visits(), 10);
assert.equal(entered.resumePose().x, 42);
assert.equal(entered.seconds(), 600);
entered.armReturn({replace() {}}, "https:");
assert.equal(entered.boundaryPlaybackSucceeded(), false, "entry retains the consumed daily bonus");
assert.equal(session.size, 0, "entry consumes its one-shot marker");
const afterEntry = new Map(entryStore);
const entryReload = load(entryStore, iso, {session, pathname: "/yard/"}).street;
assert.equal(entryReload.visits(), 10);
assert.equal(entryReload.resumePose().x, 42);
assert.deepEqual(entryStore, afterEntry, "reload retains the entire active visit");
const nextHome = load(entryStore, iso, {session, pathname: "/index.html"}).street;
const beforeNextPreview = new Map(entryStore);
const nextPreview = load(entryStore, iso, {session, pathname: "/yard/", search: "?portal-preview=1"}).street;
assert.equal(nextPreview.resumePose(), null, "preview renders the upcoming eleventh spawn at base");
assert.deepEqual(entryStore, beforeNextPreview, "preview must not erase the retained tenth pose");
nextHome.prepareExit();
const nextEntry = load(entryStore, iso, {session, pathname: "/yard/"}).street;
assert.equal(nextEntry.visits(), 11);
assert.equal(nextEntry.resumePose(), null);
assert.equal(nextEntry.seconds(), 660);

console.log("PASS: street return");
