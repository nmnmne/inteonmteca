const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const layout = JSON.parse(fs.readFileSync(new URL('../yard/data/site-layout.json', `file://${__filename.replaceAll('\\', '/')}`), 'utf8'));

test('visit cycle includes every twenty-minute slot and wraps after 20:00', async () => {
  const lighting = await import('../yard/baked-lighting.js');
  assert.equal(typeof lighting.createLightingCycle, 'function');
  const data = new Map();
  const storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  const expected = ['16:20','16:40','17:00','17:20','17:40','18:00','18:20','18:40','19:00','19:20','19:40','20:00','16:20'];
  for (const time of expected) {
    // Recreate the consumer as on a fresh page entrance.
    assert.equal(lighting.createLightingCycle(() => storage).next(layout).localMoment, `20 April ${time}`);
  }
});

test('storage failures and corrupt values safely fall back without freezing the cycle', async () => {
  const {createLightingCycle} = await import('../yard/baked-lighting.js');
  for (const provider of [() => { throw Error('denied'); }, () => ({getItem: () => '0', setItem: () => {throw Error('quota');}})]) {
    const cycle = createLightingCycle(provider);
    assert.equal(cycle.next(layout).presetIndex, 0);
    assert.equal(cycle.next(layout).presetIndex, 1);
  }
  for (const value of ['-1','12','NaN','2.5','', '01']) {
    assert.equal(createLightingCycle(() => ({getItem: () => value, setItem() {}})).next(layout).presetIndex, 0);
  }
});

test('presets move the reference sun and coherently change sky, fill and baked shadows', async () => {
  const {lightingPresetForLayout, fixedSunForLayout} = await import('../yard/baked-lighting.js');
  const base = fixedSunForLayout(layout);
  const first = lightingPresetForLayout(layout, 0);
  assert.deepEqual(first.sunVectorXYZ, base.sunVectorXYZ, 'preserve original 20 April 2026 Asia/Oral reference');
  let previous = first;
  for (let slot = 1; slot < 12; slot++) {
    const preset = lightingPresetForLayout(layout, slot);
    assert.equal(preset.timeZone, 'Asia/Oral');
    assert.equal(preset.referenceYear, 2026);
    assert.ok(Math.abs(Math.hypot(...preset.sunVectorXYZ) - 1) < 1e-8);
    assert.ok(preset.altitudeDeg < previous.altitudeDeg);
    assert.ok(preset.azimuthDegFromNorth > previous.azimuthDegFromNorth);
    for (const key of ['skyColor','fogColor','sunColor','ambientIntensity','hemisphereIntensity','sunIntensity','shadowOpacity']) assert.notEqual(preset[key], previous[key], key);
    const manifest = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../yard/data/shadows/manifest.json')));
    assert.ok(manifest.presets[slot].sunVectorXYZ.every((n,i) => Math.abs(n-preset.sunVectorXYZ[i])<1e-12));
    assert.notDeepEqual(manifest.presets[slot].matrix, manifest.presets[slot-1].matrix);
    previous = preset;
  }
  assert.ok(previous.altitudeDeg > 0 && previous.altitudeDeg < 10, '20:00 remains near sunset for the existing reference');
});
