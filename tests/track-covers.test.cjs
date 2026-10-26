const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../track-covers.js'), 'utf8');

function setup(count = 3) {
  let now = 0, tick, observe;
  class Element {
    constructor() {
      this.dataset = {}; this.attributes = {}; this.isConnected = true;
      this.complete = true; this.naturalWidth = 960;
      this.classes = new Set();
      this.classList = { add: name => this.classes.add(name), contains: name => this.classes.has(name) };
    }
    set src(value) { this.attributes.src = value; }
    get src() { return this.attributes.src; }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener() {}
    replaceChildren(image) { this.image = image; }
  }
  const document = { hidden: false, createElement: () => new Element(), addEventListener() {} };
  const context = { document, window: {}, Image: Element, matchMedia: () => ({matches: false}),
    performance: {now: () => now}, setInterval: fn => {tick = fn; return 1;}, clearInterval() {},
    IntersectionObserver: class { constructor(fn) {observe = fn;} observe() {} unobserve() {} },
  };
  vm.runInNewContext(source, context);
  const track = {covers: Array.from({length: count}, (_, i) => `assets/cover-${i}.webp`)};
  const host = new Element();
  context.window.inteonCovers.attach(host, track);
  const visibility = (element, visible) => observe([{target: element, isIntersecting: visible, intersectionRatio: visible ? 1 : 0}]);
  visibility(host, true);
  return {host, track, document, api: context.window.inteonCovers, Element, visibility,
    advance(ms) {for (let i = 0; i < ms; i += 250) {now += 250; tick();}}};
}

test('every variant appears before repetition; a large set cycles within a minute', () => {
  const ui = setup(15), seen = new Set([ui.host.image.src]);
  for (let i = 0; i < 14; i++) {
    ui.advance(3750);
    assert.ok(!seen.has(ui.host.image.src), 'no repeats before the full set');
    seen.add(ui.host.image.src);
  }
  assert.equal(seen.size, 15);
  ui.advance(3750);
  assert.equal(ui.host.image.src, ui.track.covers[0]);
});

test('hidden tabs, offscreen rows and loading images do not consume viewing time', () => {
  const ui = setup();
  ui.document.hidden = true;
  ui.advance(60000);
  ui.document.hidden = false;
  ui.visibility(ui.host, false);
  ui.advance(60000);
  ui.visibility(ui.host, true);
  ui.host.image.naturalWidth = 0;
  ui.advance(60000);
  ui.host.image.naturalWidth = 960;
  ui.advance(6750);
  assert.equal(ui.host.image.src, ui.track.covers[0]);
  ui.advance(250);
  assert.equal(ui.host.image.src, ui.track.covers[1]);
});

test('duplicate wheel rows and a recreated row retain one shared position without speeding up', () => {
  const ui = setup(), second = new ui.Element();
  ui.api.attach(second, ui.track);
  ui.visibility(second, true);
  ui.advance(6750);
  assert.equal(ui.host.image.src, ui.track.covers[0]);
  ui.advance(250);
  assert.equal(second.image.src, ui.track.covers[1]);
  assert.equal(ui.host.image.src, second.image.src);
  ui.host.isConnected = false;
  ui.advance(250);
  const replacement = new ui.Element();
  ui.api.attach(replacement, ui.track);
  assert.equal(replacement.image.src, second.image.src);
});

test('tracks without known artwork keep their existing placeholder', () => {
  const ui = setup(), host = new ui.Element();
  assert.equal(ui.api.attach(host, {audio: 'song.flac'}), false);
  assert.equal(host.image, undefined);
});
