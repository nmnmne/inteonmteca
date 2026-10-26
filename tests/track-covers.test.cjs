const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../track-covers.js'), 'utf8');

async function setup(count = 3) {
  let now = 0, tick, resize; const timers = new Map(); let timerId = 0;
  const flush = async () => {for(let i=0;i<8;i++)await Promise.resolve();};
  const observers = [];
  const watchedTitles = new Set();
  class Element {
    constructor() {
      this.dataset = {}; this.attributes = {}; this.isConnected = true;
      this.complete = true; this.naturalWidth = 960;
      this.classes = new Set();
      this.classList = { add: name => this.classes.add(name), contains: name => this.classes.has(name) };
    }
    set src(value) { this.attributes.src = value; if(this.onload)queueMicrotask(()=>this.onload()); }
    async decode() {}
    get src() { return this.attributes.src; }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener() {}
    getBoundingClientRect() { return {width: this.size || 8, height: this.size || 8}; }
    replaceChildren(image) { this.image = image; }
  }
  const document = { hidden: false, createElement: () => new Element(), addEventListener() {} };
  const context = { navigator: {}, setTimeout(fn,ms) {const id=++timerId;timers.set(id,{fn,at:now+ms});return id;}, clearTimeout(id) {timers.delete(id);}, document, window: {}, Image: Element, matchMedia: () => ({matches: false}),
    performance: {now: () => now}, setInterval: fn => {tick = fn; return 1;}, clearInterval() {},
    IntersectionObserver: class { constructor(fn) {observers.push(fn);} observe() {} unobserve() {} },
    ResizeObserver: class {
      constructor(fn) { resize = fn; }
      observe(title) { watchedTitles.add(title); }
      unobserve(title) { watchedTitles.delete(title); }
    },
    getComputedStyle: title => ({font: title.font}),
  };
  vm.runInNewContext(source, context);
  const track = {covers: Array.from({length: count}, (_, i) => `assets/cover-${i}.webp`)};
  const host = new Element();
  context.window.inteonCovers.attach(host, track);
  const visibility = (element, visible) => observers.forEach(observe => observe([{target: element, isIntersecting: visible, intersectionRatio: visible ? 1 : 0}]));
  visibility(host, true); await flush();
  return {host, track, document, flush, api: context.window.inteonCovers, Element, visibility, watchedTitles,
    resize(title) { resize([{target: title}]); },
    async advance(ms) {for (let i = 0; i < ms; i += 250) {now += 250; for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.fn();} tick(); await flush();}}};
}

test('every variant appears before repetition; a large set cycles within a minute', async () => {
  const ui = await setup(15), seen = new Set([ui.host.image.src]);
  for (let i = 0; i < 14; i++) {
    await ui.advance(3750);
    assert.ok(!seen.has(ui.host.image.src), 'no repeats before the full set');
    seen.add(ui.host.image.src);
  }
  assert.equal(seen.size, 15);
  await ui.advance(3750);
  assert.equal(ui.host.image.src, ui.track.covers[0]);
});

test('hidden tabs, offscreen rows and loading images do not consume viewing time', async () => {
  const ui = await setup();
  ui.document.hidden = true;
  await ui.advance(60000);
  ui.document.hidden = false;
  ui.visibility(ui.host, false);
  await ui.advance(60000);
  ui.visibility(ui.host, true);
  ui.host.image.naturalWidth = 0;
  await ui.advance(60000);
  ui.host.image.naturalWidth = 960;
  await ui.advance(6750);
  assert.equal(ui.host.image.src, ui.track.covers[0]);
  await ui.advance(250);
  assert.equal(ui.host.image.src, ui.track.covers[1]);
});

test('duplicate wheel rows and a recreated row retain one shared position without speeding up', async () => {
  const ui = await setup(), second = new ui.Element();
  ui.api.attach(second, ui.track);
  ui.visibility(second, true); await ui.flush();
  await ui.advance(6750);
  assert.equal(ui.host.image.src, ui.track.covers[0]);
  await ui.advance(250);
  assert.equal(second.image.src, ui.track.covers[1]);
  assert.equal(ui.host.image.src, second.image.src);
  ui.host.isConnected = false;
  await ui.advance(250);
  const replacement = new ui.Element();
  ui.api.attach(replacement, ui.track);
  ui.visibility(replacement, true); await ui.flush();
  assert.equal(replacement.image.src, second.image.src);
});

test('unseen hosts have no src; near hosts use smallest sufficient rendition, including resize', async () => {
  const ui = await setup(), host = new ui.Element();
  const track = {covers: ['assets/original.webp'], coverRenditions: {'assets/original.webp':
    [16, 24, 32, 48, 64].map(width => ({width, url: `assets/tiny-${width}.webp`}))}};
  ui.api.attach(host, track);
  assert.equal(host.image.src, undefined);
  ui.visibility(host, true); await ui.flush();
  assert.equal(host.image.src, 'assets/tiny-16.webp');
  host.size = 20;
  ui.resize(host); await ui.advance(1500);
  assert.equal(host.image.src, 'assets/tiny-24.webp');
});

test('tracks without known artwork keep their existing placeholder', async () => {
  const ui = await setup(), host = new ui.Element();
  assert.equal(ui.api.attach(host, {audio: 'song.flac'}), false);
  assert.equal(host.image, undefined);
});

test('artwork follows title font changes and releases detached title observers', async () => {
  const ui = await setup(), host = new ui.Element(), title = {font: '650 13px / 14.3px Consolas'};
  const properties = new Map();
  host.parentElement = {style: {setProperty: (name, value) => properties.set(name, value)}};
  ui.api.attach(host, ui.track, title);
  assert.ok(!ui.watchedTitles.has(title), "offscreen title has no ResizeObserver");
  ui.visibility(host,true); await ui.flush();
  assert.ok(ui.watchedTitles.has(title));
  ui.resize(title);
  assert.equal(properties.get('--cover-font'), title.font);
  title.font = '600 24px / 28px Inter';
  ui.resize(title);
  assert.equal(properties.get('--cover-font'), title.font);
  host.isConnected = false;
  await ui.advance(250);
  assert.ok(!ui.watchedTitles.has(title));
});
