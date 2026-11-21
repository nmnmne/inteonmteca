const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('a facade hold freezes the first-person route and advances the flock at its own fixed rate', async () => {
  const {createAutoWalk} = await import('../yard/auto-walk.js');
  const {pointInRing} = await import('../yard/navigation.js');
  const house = layout.buildings.find(building => building.id === layout.musicWall.buildingId);
  const flock = {
    state: {}, elapsed: 0, updates: 0, lastPose: null,
    canTakeOff: () => true,
    update(dt, pose) {
      assert.equal(dt, 1/60);
      this.elapsed += dt;
      this.updates++;
      this.lastPose = {...pose};
    },
  };
  const reference = createAutoWalk(layout, {random: () => .3});
  const walk = createAutoWalk(layout, {random: () => .3, flock});
  let entered = false;
  for (let i=0; i<1200 && !entered; i++) {
    reference.update(1/90);
    const pose = walk.update(1/90);
    entered = pose.y < house.heightM && pointInRing(pose.x,pose.z,house.footprint);
  }
  assert.ok(entered, 'the route really crossed the facade');
  const atDoor = {...walk.pose}, entryCalls = flock.updates;
  assert.deepEqual(atDoor, reference.pose);

  for (let i=0; i<143; i++) {
    walk.update(0, 1/30);
    assert.deepEqual(walk.pose, atDoor);
    assert.deepEqual(flock.lastPose, atDoor);
  }
  // One render interval straddles the end of the hold. Preserve the live
  // fraction at the current passage speed, including the existing route remainder.
  const remaining = 4.8 - 143/30;
  const firstMoving = (.075 - remaining) * .54;
  walk.update(firstMoving, remaining);
  reference.update(firstMoving);
  assert.ok(flock.updates - entryCalls >= 288, 'all 4.8 seconds reached the world');
  assert.deepEqual(walk.pose, reference.pose);
  assert.notDeepEqual(walk.pose, atDoor);
  for (let i=0; i<240; i++) {
    assert.deepEqual(walk.update(1/60), reference.update(1/60), 'no deferred movement after release');
  }
});
