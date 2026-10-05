const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../yard/quality.js'), 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('mobile render gate skips unchanged poses but invalidates textures, resize and pitch', async () => {
  const {createRenderGate} = await load();
  const gate = createRenderGate(true);
  const pose = {x:1,z:2,yaw:0,pitch:0};
  assert.equal(gate(pose,390,844,0),true);
  assert.equal(gate(pose,390,844,0),false);
  assert.equal(gate({...pose,pitch:.1},390,844,0),true);
  assert.equal(gate({...pose,pitch:.1},390,844,1),true);
  assert.equal(gate({...pose,pitch:.1},844,390,1),true);
});
test('desktop render gate retains continuous rendering', async () => {
  const {createRenderGate} = await load();
  const gate = createRenderGate(false);
  const pose={x:0,z:0,yaw:0,pitch:0};
  assert.equal(gate(pose,1000,800,0),true);
  assert.equal(gate(pose,1000,800,0),true);
});
