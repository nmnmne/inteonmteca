const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'yard/data/site-layout.json')));

test('hold is ten seconds; every real walk duration ends exactly at its deadline', async () => {
  const { createWalkLightingTimeline } = await import('../yard/walk-lighting.js');
  for (const seconds of [10, 20, 120, 240, 260, 360, 380, 480, 600, 2760]) {
    const timeline = createWalkLightingTimeline(1000);
    const end = 1000 + seconds * 1000;
    for (const time of [1000, 10999, 11000]) assert.equal(timeline.sample(time, end).progress, 0);
    if (seconds === 10) {
      assert.equal(timeline.sample(end + 1000, end).progress, 0, 'no invented fade after a ten-second visit');
      continue;
    }
    assert.equal(timeline.sample((11000 + end) / 2, end).progress, 0.5);
    assert.ok(timeline.sample(end - 1, end).progress < 1);
    assert.equal(timeline.sample(end, end).progress, 1);
    assert.equal(timeline.sample(end + 1000, end).progress, 1);
  }
});

test('late initialization, resumed frames and an already short remaining visit use absolute time', async () => {
  const { createWalkLightingTimeline } = await import('../yard/walk-lighting.js');
  assert.equal(createWalkLightingTimeline(0).sample(20000, 30000).progress, 0.5);
  const t = createWalkLightingTimeline(0);
  t.sample(0, 65000);
  assert.equal(t.sample(65000, 65000).progress, 1, 'hidden-tab time is not dropped');
  assert.equal(createWalkLightingTimeline(60000).sample(64000, 65000).progress, 0, 'reload keeps real remaining deadline');
  assert.equal(createWalkLightingTimeline(0).sample(50000, null).progress, 0, 'no fictional timer when unavailable');
});

test('actual street-return ticks and its boundary bonus retime continuously without a second duration', async () => {
  const { createWalkLightingTimeline } = await import('../yard/walk-lighting.js');
  let now = new Date(2026, 9, 4, 12).getTime();
  const store = new Map();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = { Date: Clock, location: { pathname: '/yard/' },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, addEventListener() {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'street-return.js'), 'utf8'), context);
  const street = context.inteonStreet;
  street.noteExit(); // first visit: 20 seconds
  let deadline;
  street.armReturn({ replace() {} }, 'http:', left => { deadline = now + left * 1000; });
  const enteredAt = now;
  const timeline = createWalkLightingTimeline(enteredAt);
  assert.equal(timeline.sample(now, deadline).durationMs, 10000);
  now += 15000;
  assert.equal(timeline.sample(now, deadline).progress, 0.5);
  assert.equal(street.boundaryPlaybackSucceeded(), true);
  assert.equal(deadline - now, 245000, 'four minutes are added to the five remaining seconds');
  assert.equal(timeline.sample(now, deadline).progress, 0.5, 'extension does not reverse the light');
  assert.equal(timeline.sample(now + 122500, deadline).progress, 0.75);
  assert.equal(timeline.sample(deadline, deadline).progress, 1);
});

test('all twelve transitions select only the next preset, including 11 -> 0', async () => {
  const THREE = await import('../yard/vendor/three.module.js');
  const { lightingPresetForLayout } = await import('../yard/baked-lighting.js');
  const { createLightingTransition } = await import('../yard/lighting-transition.js');
  for (let i = 0; i < 12; i++) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color();
    scene.fog = new THREE.Fog(0, 90, 260);
    scene.add(new THREE.AmbientLight(), new THREE.HemisphereLight(), new THREE.DirectionalLight());
    const transition = createLightingTransition(scene, layout, lightingPresetForLayout(layout, i), { enteredAt: 0, deadline: 30000 });
    assert.equal(transition.state.toIndex, (i + 1) % 12);
    transition.update(10000);
    assert.equal(transition.state.mix, 0);
    transition.dispose();
  }
});

async function fixture() {
  const THREE = await import('../yard/vendor/three.module.js');
  const { createShadowTransition } = await import('../yard/shadow-transition.js');
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()));
  const counts = [0, 0];
  const atlas = index => {
    const texture = new THREE.Texture({ width: 1024 });
    texture.addEventListener('dispose', () => counts[index]++);
    return { texture, entry: { matrix: new THREE.Matrix4().toArray(), depthRange: 100 }, presetIndex: index,
      gpuBytes: 4 * 1024 ** 2, residentSets: 1, dispose() { texture.dispose(); } };
  };
  return { scene, current: atlas(0), next: atlas(1), counts, createShadowTransition };
}

test('two depth maps during blending; old GPU texture is released at completion and next at exit', async () => {
  const f = await fixture();
  let loads = 0;
  const original = f.scene.children[0].material.onBeforeCompile;
  const transition = f.createShadowTransition(f.scene, f.current, { presetIndex: 1 }, async () => { loads++; return f.next; });
  assert.equal(f.current.gpuBytes, 4 * 1024 ** 2);
  await Promise.all([transition.prepare(), transition.prepare()]);
  assert.equal(loads, 1);
  assert.equal(f.current.gpuBytes, 8 * 1024 ** 2);
  transition.setMix(0.5);
  assert.deepEqual(f.counts, [0, 0]);
  transition.setMix(1);
  assert.deepEqual(f.counts, [1, 0]);
  assert.equal(f.current.texture, f.next.texture);
  assert.equal(f.current.residentSets, 1);
  assert.equal(f.current.gpuBytes, 4 * 1024 ** 2);
  transition.dispose();
  transition.dispose();
  assert.deepEqual(f.counts, [1, 1]);
  assert.equal(f.current.gpuBytes, 0);
  assert.equal(f.scene.children[0].material.onBeforeCompile, original);
});

test('exit during next-map loading disposes the late result without patching a dead scene', async () => {
  const f = await fixture();
  let resolve;
  const transition = f.createShadowTransition(f.scene, f.current, { presetIndex: 1 }, () => new Promise(done => { resolve = done; }));
  const pending = transition.prepare();
  transition.dispose();
  resolve(f.next);
  await pending;
  assert.deepEqual(f.counts, [1, 1]);
  assert.equal(f.current.residentSets, 0);
  assert.equal(transition.metrics.status, 'disposed');
});

test('missing next map retains the original depth texture and shader', async () => {
  const f = await fixture();
  const original = f.scene.children[0].material.onBeforeCompile;
  const transition = f.createShadowTransition(f.scene, f.current, { presetIndex: 1 }, async () => { throw Error('offline'); });
  await transition.prepare();
  assert.equal(transition.setMix(0.5), false);
  assert.equal(f.current.gpuBytes, 4 * 1024 ** 2);
  assert.equal(f.scene.children[0].material.onBeforeCompile, original);
  transition.dispose();
  assert.deepEqual(f.counts, [1, 0]);
});

test('digital proxy buildings do not receive photographic baked shadows', async () => {
  const { isBakedReceiver } = await import('../yard/shadow-atlas.js');
  const mesh = {isMesh:true,name:'house',userData:{},material:{wireframe:false,transparent:false}};
  assert.equal(isBakedReceiver(mesh),true);
  mesh.userData.digitalProxy=true;
  assert.equal(isBakedReceiver(mesh),false);
});
