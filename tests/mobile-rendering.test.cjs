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
test('desktop skips idle frames but submits every changed frame without an FPS cap', async () => {
  const {createRenderGate} = await load();
  const gate = createRenderGate(false);
  const pose={x:0,z:0,yaw:0,pitch:0};
  assert.equal(gate(pose,1000,800,0),true);
  assert.equal(gate(pose,1000,800,0),false);
  for (let i=0;i<240;i++) {
    pose.yaw += .001;
    assert.equal(gate(pose,1000,800,0),true);
  }
});

test('adaptive resolution ignores idle and short stalls; recovers after sustained headroom', async () => {
  const {createAdaptiveQuality} = await load();
  const quality = createAdaptiveQuality(1, true);
  let now=1;
  for(let i=0;i<900;i++) quality.sample(now+=8.33,true);
  assert.equal(quality.snapshot().pixelRatio,1);
  quality.sample(now+=500,true);
  assert.equal(quality.snapshot().pixelRatio,1);
  for(let i=0;i<250;i++) quality.sample(now+=35,true);
  assert.ok(quality.snapshot().pixelRatio<1);
  const lower=quality.snapshot().pixelRatio;
  for(let i=0;i<1000;i++) quality.sample(now+=16.67,false);
  assert.equal(quality.snapshot().pixelRatio,lower);
  for(let i=0;i<2000;i++) quality.sample(now+=8.33,true);
  assert.equal(quality.snapshot().pixelRatio,1);
});
