const test = require('node:test');
const assert = require('node:assert/strict');

test('all residents keep a distinct movement phrase and each street manner has a recognisable gesture', async () => {
  const {crowPersonality} = await import('../yard/crow-personalities.js');
  const {sampleCrowManner} = await import('../yard/crow-manners.js');
  const signatures = new Set(), roles = new Set();
  for (let id = 0; id < 19; id++) {
    const p = crowPersonality(id), frames = [];
    roles.add(p.style);
    for (let t=0;t<10;t+=.1) {
      const pose = sampleCrowManner({},p,t,t,0,0,.3);
      assert.ok(Object.values(pose).every(Number.isFinite));
      frames.push(pose);
    }
    signatures.add(frames.map(f=>f.dip.toFixed(2)).join(','));
    const peaks = key => Math.max(...frames.map(f=>f[key]));
    if (p.style === 'boss') assert.ok(Math.min(...frames.map(f=>f.dip)) < -.38 && peaks('glance') > .6);
    if (p.style === 'bandit') assert.ok(peaks('rise') > .065 && peaks('wing') > .42);
    if (p.style === 'drifter') assert.ok(peaks('dip') > .54 && peaks('wing') > .32);
    if (p.style === 'local') assert.ok(peaks('dip') > .41 && peaks('glance') > .54);
  }
  assert.deepEqual([...roles].sort(), ['bandit','boss','drifter','local']);
  assert.equal(signatures.size, 19);
});
