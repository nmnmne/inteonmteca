const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'logo-materials.js'), 'utf8');
function setup(level = 5) {
  const events = new Map(), documentEvents = new Map(), frames = new Map();
  let serial = 0, time = 0, motion = 0;
  const element = () => ({dataset: {}, attrs: {}, children: [], classList: {add() {}},
    setAttribute(name, value) {this.attrs[name] = value;},
    append(child) {this.children.push(child); child.parent = this;},
    remove() {if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);},
  });
  const surface = element(), wrap = element();
  wrap.querySelector = () => surface;
  const on = (map, name, callback) => {
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(callback);
  };
  const effects = {active:null, claim(name) {if(this.active)return false;this.active=name;return true;}, release(name) {if(this.active===name)this.active=null;}, ambientPaused: false, ambientBlocked: false, ambientNow: () => motion, beat() {}, watch() {}};
  const document = {hidden: false, documentElement: {dataset: {graphicsLevel: String(level)}},
    querySelector: () => wrap, createElementNS: element,
    addEventListener: (name, callback) => on(documentEvents, name, callback)};
  const context = {document, matchMedia: () => ({matches: false, addEventListener() {}}),
    getComputedStyle: () => ({getPropertyValue: () => '218, 243, 149'}),
    performance: {now: () => time}, inteonHomeEffects: effects,
    requestAnimationFrame: callback => {frames.set(++serial, callback); return serial;},
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, callback) => on(events, name, callback)};
  context.window = context;
  vm.runInNewContext(source, context);
  return {effects, document, surface, wrap, api: context.inteonLogoMaterials, frames,
    emit(name) {for (const listener of events.get(name) || []) listener();},
    hidden() {document.hidden = true; for (const listener of documentEvents.get('visibilitychange') || []) listener();},
    frame(wall, active = wall) {
      time = wall; motion = active;
      const [id, callback] = frames.entries().next().value || [];
      assert.ok(callback, 'a frame is scheduled'); frames.delete(id); callback(wall);
    },
  };
}

test('removed ink and dissolve requests create no hidden layers or animation work', () => {
  const run = setup();
  for (const name of ['ink', 'dissolve', 'breath']) run.api.run(name);
  assert.equal(run.surface.children.length, 0);
  assert.equal(run.frames.size, 0);
  assert.equal(run.wrap.dataset.materialPreview, undefined);
});

test('recursion keeps visible contours at low quality and increases detail once per scene', () => {
  for (const [level, count] of [[1, 2], [5, 3], [10, 5]]) {
    const run = setup(level); run.api.run('recursion'); run.frame(1000);
    const layer = run.surface.children[0];
    assert.equal(layer.children.length, count);
    assert.ok(Number(layer.children[0].attrs.opacity) > 0);
    run.document.documentElement.dataset.graphicsLevel = '10';
    run.emit('inteon-quality-change'); run.frame(1016);
    assert.equal(run.surface.children[0], layer);
    assert.equal(layer.children.length, count, 'live scene is never rebuilt');
    assert.equal(run.frames.size, 1);
  }
});

test('a freeze holds contours without RAF and resumes from the same active time', () => {
  const run = setup(); run.api.run('recursion'); run.frame(1000);
  const layer = run.surface.children[0];
  const before = layer.children.map(child => ({...child.attrs}));
  run.effects.ambientPaused = true; run.emit('inteon-ambient-change');
  assert.equal(run.frames.size, 0);
  run.emit('inteon-effects-change'); assert.equal(run.frames.size, 0);
  assert.deepEqual(layer.children.map(child => ({...child.attrs})), before);
  run.effects.ambientPaused = false; run.emit('inteon-ambient-change'); run.emit('inteon-effects-change');
  assert.equal(run.frames.size, 1, 'reentrant resume events never duplicate RAF');
  run.frame(11000, 1000);
  assert.deepEqual(layer.children.map(child => ({...child.attrs})), before);
  run.frame(16500, 6500);
  assert.equal(run.surface.children.length, 0);
  assert.equal(run.frames.size, 0);
  assert.equal(run.wrap.dataset.materialPreview, undefined);
});

test('hiding or replacing recursion releases its layer and outstanding frame', () => {
  const run = setup(); run.api.run('recursion');
  const previous = run.surface.children[0]; run.api.run('recursion');
  assert.equal(run.surface.children.length, 1);
  assert.notEqual(run.surface.children[0], previous);
  assert.equal(run.frames.size, 1);
  run.hidden();
  assert.equal(run.surface.children.length, 0);
  assert.equal(run.frames.size, 0);
  assert.equal(run.wrap.dataset.materialPreview, undefined);
});

test('menu retains acid under its new name and removed effects cannot run through CSS', () => {
  const debug = fs.readFileSync(path.join(__dirname, '..', 'development-debug.js'), 'utf8');
  assert.match(debug, /\['Растворение',.*inteonLogoAcid/);
  assert.match(debug, /\['Рекурсия',.*run\('recursion'\)/);
  assert.doesNotMatch(debug, /Тушь вокруг логотипа|Растворение букв|Кислотное растворение|Дыхание логотипа/);
  for (const file of ['styles.css', 'room-finish.css', 'room-recesses.css']) {
    const css = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(css, /logoVectorDissolve|logo-darkness|data-logo-snapshot|material-preview="(?:ink|dissolve)"/);
  }
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.logo-wrap\.release-logo::before \{ content: none; display: none; \}/);
  assert.match(css, /@keyframes reactiveLogoBreath/);
});
