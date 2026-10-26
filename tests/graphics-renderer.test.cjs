const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function renderer(file) {
  const events = new Map(), frames = new Map(), images = [];
  let serial = 0, backingWrites = 0, draws = 0;
  const root = {dataset: {graphicsLevel: '5', animationQuality: 'low'}};
  const noop = () => {};
  const context = new Proxy({
    measureText: text => ({width: text.length * 7}),
    createLinearGradient: () => ({addColorStop: noop}),
    createRadialGradient: () => ({addColorStop: noop}),
    getImageData: () => {
      const data = new Uint8ClampedArray(534 * 107 * 4);
      for (let y = 20; y < 80; y++) for (let x = 20; x < 500; x++) data[(y * 534 + x) * 4 + 3] = 255;
      return {data};
    },
  }, {get: (target, key) => key in target ? target[key] : () => {draws++;}});
  const canvas = () => {
    let width = 300, height = 150;
    return {dataset: {}, className: '', clientWidth: 800, clientHeight: 250,
      get width() {return width;}, set width(value) {width = value; if (this.className) backingWrites++;},
      get height() {return height;}, set height(value) {height = value; if (this.className) backingWrites++;},
      setAttribute: noop, getContext: () => context};
  };
  const wrap = {prepend: noop, classList: {contains: () => false}, getBoundingClientRect: () => ({left: 300, top: 40, width: 534, height: 107})};
  const effects = {ambientPaused: false, ambientBlocked: false, beat: noop, watch: noop, ambientNow: value => value};
  const sandbox = {console, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    document: {documentElement: root, hidden: false, createElement: canvas, querySelector: () => wrap,
      body: {append: noop, classList: {contains: () => false}}, addEventListener: noop},
    Image: class {constructor() {images.push(this);}},
    ResizeObserver: class {observe() {}}, MutationObserver: class {observe() {}},
    matchMedia: () => ({matches: false, addEventListener: noop}),
    getComputedStyle: () => ({getPropertyValue: () => '218, 243, 149'}),
    requestAnimationFrame: callback => {frames.set(++serial, callback); return serial;},
    cancelAnimationFrame: id => frames.delete(id),
    performance: {now: () => 0},
    addEventListener: (name, callback) => {if (!events.has(name)) events.set(name, []); events.get(name).push(callback);},
    inteonHomeEffects: effects,
  };
  sandbox.window = sandbox;
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const marker = source.lastIndexOf('})();');
  const state = file === 'energy-field.js'
    ? '({canvas,dust,streams,particles,labels,nodes,links,glows,level,dustCount,streamCount,pixelCount,lineCount})'
    : '({canvas,seeds,ribbonPoints,segmentIndexes,level,seedCount})';
  vm.runInNewContext(source.slice(0, marker) + `window.__inspect=()=>${state};\n` + source.slice(marker), sandbox);
  images.forEach(image => image.onload());
  return {
    state: () => sandbox.__inspect(), effects,
    counters: () => ({backingWrites, draws, frames: frames.size}),
    emit(name) {for (const listener of events.get(name) || []) listener();},
    level(value) {root.dataset.graphicsLevel = String(value); this.emit('inteon-quality-change');},
    frame(time = 1000) {const [id, callback] = frames.entries().next().value || []; assert.ok(callback, 'one scheduled frame'); frames.delete(id); callback(time);},
  };
}

for (const file of ['energy-field.js', 'logo-ripples.js']) {
  test(`${file}: quality switches defer work, preserve pools and coalesce surface updates`, () => {
    const run = renderer(file); run.frame();
    const initial = run.state(), before = run.counters();
    const arrays = file === 'energy-field.js' ? ['dust', 'streams', 'particles', 'nodes', 'links', 'glows'] : ['seeds', 'ribbonPoints', 'segmentIndexes'];
    const objects = arrays.map(key => initial[key][0]);
    for (const level of [1, 10, 3, 10]) run.level(level);
    assert.deepEqual(run.counters(), before, 'event performs no drawing, backing writes or new RAF');
    run.frame(1016);
    const high = run.state();
    assert.equal(high.canvas.dataset.graphicsLevel, '10');
    assert.equal(run.counters().backingWrites - before.backingWrites, 2, 'only final width/height applied');
    arrays.forEach((key, index) => {assert.equal(high[key], initial[key]); assert.equal(high[key][0], objects[index]);});
    run.frame(1032);
    assert.equal(run.counters().backingWrites - before.backingWrites, 2, 'steady frame does not resize');
    const highCount = Number(high.canvas.dataset.dust || high.canvas.dataset.activeParticles);
    run.level(1); run.frame(1048);
    assert.ok(Number(run.state().canvas.dataset.dust || run.state().canvas.dataset.activeParticles) < highCount / 4);
    assert.ok(Number(run.state().canvas.dataset.dust || run.state().canvas.dataset.activeParticles) > 0);
    assert.equal(run.counters().frames, 1);
  });

  test(`${file}: changing quality while heavy work rests stays dormant until resume`, () => {
    const run = renderer(file); run.frame();
    run.effects.ambientPaused = true; run.emit('inteon-ambient-change');
    assert.equal(run.counters().frames, 0);
    const before = run.counters(); run.level(10); run.level(1);
    assert.deepEqual(run.counters(), before);
    run.effects.ambientPaused = false; run.emit('inteon-ambient-change'); run.frame();
    assert.equal(run.state().canvas.dataset.graphicsLevel, '1');
    assert.equal(run.counters().frames, 1);
  });

  test(`${file}: all ten levels increase visible workload without shrinking the available pool`, () => {
    const run = renderer(file); run.frame();
    let previousCount = 0, previousWidth = 0;
    const initial = run.state();
    const pool = file === 'energy-field.js' ? initial.dust : initial.seeds;
    for (let level = 1; level <= 10; level++) {
      run.level(level); run.frame(1000 + level * 16);
      const current = run.state();
      const count = Number(current.canvas.dataset.dust || current.canvas.dataset.activeParticles);
      assert.ok(count > previousCount, `level ${level} increases density`);
      assert.ok(current.canvas.width >= previousWidth, `level ${level} preserves resolution`);
      assert.equal(file === 'energy-field.js' ? current.dust : current.seeds, pool);
      previousCount = count; previousWidth = current.canvas.width;
    }
    assert.equal(previousCount, pool.length, 'maximum level uses the full preallocated pool');
  });
}

test('energy colonies keep independent rhythms and a bounded communication network', () => {
  const run = renderer('energy-field.js'); run.level(10); run.frame(1000);
  const first = run.state();
  assert.equal(first.nodes.length, 8);
  assert.equal(first.links.length, 12, 'fixed edges instead of an all-pairs search');
  assert.equal(new Set(first.nodes.map(n => n.period)).size, first.nodes.length);
  assert.ok(new Set(first.nodes.map(n => n.authority)).size > 4, 'visible hierarchy is not one repeated star');
  const position = first.nodes.map(n => [n.x, n.y, n.pulse]);
  run.frame(2400);
  assert.ok(first.nodes.every((n, i) => n.x !== position[i][0] && n.pulse !== position[i][2]));
  assert.ok(first.links.every(link => Number.isFinite(link.cx) && Number.isFinite(link.cy)));
  assert.equal(first.glows.length, 3, 'only three cached glow textures');
  assert.ok(first.glows.every(glow => glow.width === 64 && glow.height === 64));
});

test('minimum graphics retain every colony and preserve their phase when quality changes', () => {
  const run = renderer('energy-field.js'); run.level(10); run.frame(2200);
  const first = run.state();
  const positions = first.nodes.map(n => [n.x, n.y, n.pulse]);
  run.level(1); run.frame(2200);
  const low = run.state();
  assert.equal(low.nodes, first.nodes);
  assert.deepEqual(low.nodes.map(n => [n.x, n.y, n.pulse]), positions);
  assert.equal(Number(low.canvas.dataset.colonies), 8);
  assert.equal(Number(low.canvas.dataset.links), 0, 'fine route lines are expendable');
  assert.ok(Number(low.canvas.dataset.signals) >= 4, 'communication still moves at low detail');
});
