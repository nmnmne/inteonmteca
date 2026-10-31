const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function fixture({desktop = true, reducedMotion = false, level = 5, alphabet = '01/\\|<>[]{}#$%&*+-=░▒:;'} = {}) {
  const events = new Map(), frames = new Map(), canvases = [], visible = [], observers = [];
  let serial = 0, wallTime = 0, activeTime = 0;
  const on = (name, fn) => { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); };
  const emit = name => { for (const fn of events.get(name) || []) fn(); };
  const rows = Array.from({length: 90}, (_, index) => ({
    offsetTop: index * 50, dataset: {trackTitle: `Track ${index}`},
    style: {values: new Map(), setProperty(name, value) {this.values.set(name,value);}, removeProperty(name) {this.values.delete(name);}},
    getBoundingClientRect: () => ({height: 50}),
    querySelector: selector => selector === '.cover-image' ? null : {
      dataset: {originalText: `${selector === '.track-title' ? 'Track' : 'Artist'} ${index}`}, textContent: 'glitch',
    },
  }));
  const bounds = {left: 640, top: 153, bottom: 553};
  const list = {children: rows, clientWidth: 800, clientHeight: 400, scrollTop: 1500, addEventListener: on,
    getBoundingClientRect: () => bounds};
  const properties = new Map();
  const shell = {getBoundingClientRect: () => bounds, append: canvas => visible.push(canvas), style: {setProperty: (name, value) => properties.set(name, value)}};
  const media = {matches: desktop, addEventListener: on};
  const reduced = {matches: reducedMotion, addEventListener: (name, fn) => on(`reduced-${name}`, fn)};
  const root = {dataset: {graphicsLevel: String(level)}};
  const effects = {suspended: false, ambientPaused: false, ambientNow: () => activeTime, beat() {}, watch() {}};
  const body = {interlude: false, classList: {contains: () => body.interlude}};
  const create = () => {
    const draws = [], text = [], clears = [], grains = [], alphas = [];
    const context = new Proxy({createLinearGradient: () => ({addColorStop() {}}), drawImage: (...args) => {draws.push(args); alphas.push(context.globalAlpha);}, fillText: (...args) => text.push(args),
      fillRect: (...args) => grains.push(args), clearRect: (...args) => clears.push(args)}, {get: (target, key) => target[key] || (() => {})});
    const canvas = {dataset: {}, attributes: {}, width: 300, height: 150, className: '', style: {setProperty() {}},
      getContext: () => context, setAttribute(name, value) {this.attributes[name] = value;}, draws, text, clears, grains, alphas};
    canvases.push(canvas); return canvas;
  };
  const doc = {hidden: false, documentElement: root, body, createElement: create, addEventListener: on,
    getElementById: id => id === 'track-list' ? list : shell};
  const sandbox = {document: doc, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    matchMedia: query => query.includes('prefers-reduced-motion') ? reduced : media,
    performance: {now: () => wallTime}, inteonHomeEffects: effects, inteonTextMotion: Object.freeze({symbols: alphabet}),
    getComputedStyle: () => ({font: '600 16px monospace', fontSize: '16px', getPropertyValue: () => '218, 243, 149'}),
    requestAnimationFrame: fn => {frames.set(++serial, fn); return serial;}, cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {constructor(fn) {observers.push(fn);} observe() {}},
    MutationObserver: class {constructor(fn) {observers.push(fn);} observe() {}}, addEventListener: on};
  sandbox.window = sandbox;
  const source = fs.readFileSync(path.join(__dirname, '../playlist-curve.js'), 'utf8');
  const end = source.lastIndexOf('})();');
  vm.runInNewContext(source.slice(0, end) + 'window.__curvePools=()=>sides.map(side=>side.particles);\n' + source.slice(end), sandbox);
  return {list, media, reduced, root, effects, properties, body, doc, visible, canvases, frames, emit,
    pools: () => sandbox.__curvePools(),
    frame(wall = wallTime + 16.667, active = wall) {
      wallTime = wall; activeTime = active;
      const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(wall);
    },
    mutateBody() {observers.at(-1)();},
  };
}

test('desktop wind reuses two decorative canvases, four bounded surfaces and one animation loop', () => {
  const run = fixture(); assert.equal(run.frames.size, 1); run.frame(0);
  assert.equal(run.visible.length, 2); assert.equal(run.canvases.length, 4);
  assert.equal(run.frames.size, 1, 'one shared wind clock, never one per surface');
  for (const canvas of run.visible) {
    assert.equal(canvas.attributes['aria-hidden'], 'true');
    assert.equal(canvas.attributes.inert, '');
    assert.equal(canvas.className, 'playlist-curve');
    assert.equal(canvas.dataset.scroll, '1500.00');
    assert.equal(canvas.dataset.direction, 'left');
    assert.equal(canvas.dataset.windParticles, '60');
    assert.ok(canvas.draws.length <= 68, 'bounded strip projection');
    assert.ok(canvas.grains.length > 60 && canvas.grains.length < 80, 'bounded grains and tracking tears');
  }
  const pools = run.pools(), seeds = pools.map(pool => pool[0]);
  for (let at = 10; at <= 1000; at += 10) run.frame(at);
  assert.equal(run.frames.size, 1); assert.equal(run.canvases.length, 4);
  run.pools().forEach((pool, index) => {
    assert.equal(pool, pools[index]); assert.equal(pool[0], seeds[index]); assert.equal(pool.length, 160);
  });
  assert.equal(run.list.children.length, 90, 'real catalogue never cloned or replaced');
});

test('scrolling repaints adjacent rows, coalesces events and reuses caches until a row boundary', () => {
  const run = fixture(); run.frame(0);
  const textures = run.canvases.filter(canvas => !canvas.className);
  const counts = textures.map(canvas => canvas.text.length);
  run.list.scrollTop += 2;
  for (let i = 0; i < 20; i++) run.emit('scroll');
  assert.equal(run.frames.size, 1); run.frame(10);
  assert.deepEqual(textures.map(canvas => canvas.text.length), counts, 'within-row scroll reuses text raster');
  run.list.scrollTop += 100; run.emit('scroll'); run.frame(20);
  assert.ok(textures.every((canvas, index) => canvas.text.length > counts[index]));
  assert.equal(run.canvases.length, 4, 'no allocation during scroll');
  assert.ok(run.visible.every(canvas => canvas.dataset.scroll === '1602.00'));
  assert.equal(run.frames.size, 1);
});

test('river narrows upstream, opens downstream and stays outside the active region', () => {
  const run = fixture(); run.frame(0);
  const gutter = parseFloat(run.properties.get('--playlist-curve-gutter'));
  assert.equal(gutter, 640, 'continuation reaches the left viewport edge rather than a short gutter');
  for (const canvas of run.visible) {
    for (const [texture, sx, sy, sw, sh, dx, dy, dw, dh] of canvas.draws) {
      assert.ok(sy >= 0 && sy + sh <= texture.height + 1, 'cached row sample in bounds');
      assert.ok(dy >= 0 && dy + dh <= Number(canvas.dataset.depth) + 1, 'projection confined to continuation canvas');
      assert.ok(dw > 0 && dx <= gutter + 2 && dh > 0, 'surface flows left without folding over itself');
    }
    const near = canvas.draws[0], far = canvas.draws.at(-1);
    assert.equal(near[5], gutter + 2, 'nearest strip meets the existing row edge');
    assert.ok(far[5] < near[5] - 100, 'both continuations turn left');
    assert.equal(canvas.dataset.trajectory, 'river');
    if (canvas.dataset.edge === 'top') {
      assert.ok(far[7] < near[7] * .86, 'upper bank narrows into the distance');
      assert.ok(far[5] + far[7] < near[5] + near[7] - 300, 'upper right bank follows the leftward bend');
      assert.equal(Number(canvas.dataset.depth),153,'upper stream reaches the viewport edge');
    } else {
      assert.ok(far[7] > near[7] * 2, 'lower bank opens rather than curling into the same ellipse');
      assert.ok(far[5]<0,'lower left bank continues offscreen');
      assert.ok(far[5]+far[7]>1440,'lower right bank continues offscreen');
      assert.ok(Number(canvas.dataset.depth)>=347,'lower stream reaches the bottom edge');
    }
  }
  const top = run.visible.find(canvas => canvas.dataset.edge === 'top').draws;
  const bottom = run.visible.find(canvas => canvas.dataset.edge === 'bottom').draws;
  assert.ok(top[0][6] > top.at(-1)[6], 'upper projection bends toward top');
  assert.ok(bottom[0][6] < bottom.at(-1)[6], 'lower projection bends toward bottom');
});

test('interactive rows follow a symmetric ellipse and only nearby rows receive transforms', () => {
  const run = fixture(); run.frame(0);
  const rows = run.list.children;
  const x = index => parseFloat(rows[index].style.values.get('--playlist-orbit-x'));
  assert.ok(x(33) > x(30) + 20, 'middle of the catalogue bows right');
  assert.equal(x(30), x(37), 'upper and lower halves are symmetric');
  assert.equal(x(33), x(34), 'centre rows share the same arc');
  assert.ok(rows.filter(row=>row.style.values.size).length <= 10, 'only visible rows plus a small buffer');
  run.list.scrollTop += 600; run.emit('scroll'); run.frame(100);
  assert.equal(rows[30].style.values.size,0,'old row transform is released');
  assert.ok(x(45)>x(42));
  run.media.matches=false;run.emit('change');
  assert.ok(rows.every(row=>row.style.values.size===0),'mobile has no residual arc');
});

test('mobile allocates no continuation surfaces; scene/visibility transitions cancel pending frames', () => {
  const run = fixture({desktop: false});
  assert.equal(run.canvases.length, 0); assert.equal(run.frames.size, 0);
  run.emit('scroll'); assert.equal(run.frames.size, 0);
  run.media.matches = true; run.emit('change'); run.frame(0);
  assert.equal(run.visible.length, 2);
  run.emit('scroll'); run.body.interlude = true; run.mutateBody();
  assert.equal(run.frames.size, 0);
  run.body.interlude = false; run.mutateBody(); assert.equal(run.frames.size, 1); run.frame(100);
  run.emit('scroll'); run.doc.hidden = true; run.emit('visibilitychange'); assert.equal(run.frames.size, 0);
  const counts = run.visible.map(canvas => canvas.clears.length);
  run.emit('scroll'); run.emit('resize'); run.emit('inteon-theme-frame'); run.frame(5000);
  assert.deepEqual(run.visible.map(canvas => canvas.clears.length), counts, 'hidden invalidation never paints');
  run.doc.hidden = false; run.emit('visibilitychange'); run.emit('visibilitychange');
  assert.equal(run.frames.size, 1); run.frame(5100);
  run.media.matches = false; run.emit('change');
  assert.equal(run.frames.size, 0, 'desktop-to-mobile resize stops the wind');
});

test('quality changes reuse surfaces and reduce projection work and backing resolution', () => {
  const run = fixture(); run.frame(0);
  const pools = run.pools();
  run.root.dataset.graphicsLevel = '1'; run.emit('inteon-quality-change'); run.frame(10);
  assert.equal(run.canvases.length, 4);
  assert.equal(run.visible[0].width, 1080);
  assert.equal(run.visible[0].dataset.windParticles, '28');
  run.pools().forEach((pool, index) => assert.equal(pool, pools[index]));
  const before = run.visible[0].draws.length;
  run.list.scrollTop += 1; run.emit('scroll'); run.frame(20);
  assert.equal(run.visible[0].draws.length - before, 32);
  assert.equal(run.frames.size, 1);
});

test('cached titles and artists use only the shared animation alphabet, never original names', () => {
  // A narrower injected alphabet proves the decoration reads the shared source.
  const alphabet = '<>░01/';
  const run = fixture({alphabet});
  const original = run.list.children.map(row => row.dataset.trackTitle);
  run.frame(0);
  const textures = run.canvases.filter(canvas => !canvas.className);
  const strings = textures.flatMap(canvas => canvas.text.map(call => call[0]));
  assert.equal(strings.length, 24, 'six cached titles and artists for each edge');
  for (const value of strings) {
    assert.ok(value.length > 0);
    assert.ok([...value].every(char => char === ' ' || alphabet.includes(char)), value);
    assert.doesNotMatch(value, /Track|Artist/);
  }
  assert.deepEqual(run.list.children.map(row => row.dataset.trackTitle), original, 'accessible track data is unchanged');
  const counts = textures.map(canvas => canvas.text.length);
  run.frame(80); run.frame(180);
  assert.deepEqual(textures.map(canvas => canvas.text.length), counts, 'wind frames reuse the glyph raster');
  run.frame(240);
  assert.equal(run.visible[0].dataset.glyphRevision, '1');
  assert.ok(textures.every((canvas, index) => canvas.text.length === counts[index] * 2));
  assert.notDeepEqual(textures.flatMap(canvas => canvas.text.slice(-12).map(call => call[0])), strings);
});

test('quality caps actual painting while a display-frequency clock cannot duplicate the loop', () => {
  for (const [level, cap] of [[1, 24], [5, 36], [10, 48]]) {
    const run = fixture({level}); run.frame(0);
    for (let at = 1; at <= 1000; at++) run.frame(at);
    const paints = Number(run.visible[0].dataset.drawCount) - 1;
    assert.ok(paints >= cap - 2 && paints <= cap, `${level}: ${paints} actual paints/s`);
    assert.equal(run.frames.size, 1);
  }
});

test('freeze cancels autonomous work, permits one scroll repaint and resumes the same particles', () => {
  const run = fixture(); run.frame(0); run.frame(240);
  const pools = run.pools(), counts = run.visible.map(canvas => canvas.clears.length);
  run.effects.ambientPaused = true; run.emit('inteon-ambient-change');
  assert.equal(run.frames.size, 0);
  run.emit('inteon-effects-change'); assert.equal(run.frames.size, 0);
  run.frame(10000, 240);
  assert.deepEqual(run.visible.map(canvas => canvas.clears.length), counts);
  run.list.scrollTop += 25; run.emit('scroll');
  assert.equal(run.frames.size, 1); run.frame(10016, 240);
  assert.equal(run.frames.size, 0, 'explicit frozen repaint does not restart animation');
  assert.equal(run.visible[0].dataset.glyphRevision, '1', 'frozen text does not consume wall time');
  run.effects.ambientPaused = false; run.emit('inteon-ambient-change'); run.emit('inteon-ambient-change');
  assert.equal(run.frames.size, 1); run.frame(10100, 324);
  run.pools().forEach((pool, index) => assert.equal(pool, pools[index]));
  assert.equal(run.visible[0].dataset.glyphRevision, '1', 'resume preserves glyph epoch');
});

test('reduced motion paints a still signal and page departure cannot restart background work', () => {
  const run = fixture({reducedMotion: true}); run.frame(0);
  assert.equal(run.frames.size, 0);
  run.list.scrollTop += 20; run.emit('scroll'); run.frame(5000);
  assert.equal(run.frames.size, 0); assert.equal(run.visible[0].dataset.glyphRevision, '0');
  run.reduced.matches = false; run.emit('reduced-change'); assert.equal(run.frames.size, 1); run.frame(5100);
  run.emit('pagehide'); assert.equal(run.frames.size, 0);
  const counts = run.visible.map(canvas => canvas.clears.length);
  run.emit('resize'); run.emit('scroll'); run.emit('inteon-ambient-change'); run.frame(6000);
  assert.equal(run.frames.size, 0); assert.deepEqual(run.visible.map(canvas => canvas.clears.length), counts);
  run.emit('pageshow'); run.emit('pageshow'); assert.equal(run.frames.size, 1); run.frame(6100);
  assert.equal(run.canvases.length, 4);
});


test('continuation begins at full contrast and eases away without a sudden seam dropout', () => {
  const run = fixture(); run.frame(0);
  for (const canvas of run.visible) {
    assert.equal(canvas.alphas[0], 1, 'first strip is not faded before it leaves the catalogue');
    assert.ok(canvas.alphas[1] > .99, 'smooth onset has no abrupt contrast step');
    assert.ok(canvas.alphas[8] > .9, 'nearby rows retain visual continuity');
    assert.ok(canvas.alphas.at(-1) < .01, 'outer tail still dissolves completely');
  }
});
