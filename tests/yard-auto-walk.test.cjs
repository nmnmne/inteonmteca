const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('walker stops at different sights while remaining on the mapped drives', async () => {
  const { createAutoWalk } = await import('../yard/auto-walk.js');
  const { distanceToSegment, isWalkable, pointInRing } = await import('../yard/navigation.js');
  const walk = createAutoWalk(layout, { random: () => 0.3 });
  let previous = { ...walk.update(0) };
  assert.equal(previous.x, layout.spawn.x);
  assert.equal(previous.yaw, layout.spawn.yaw);
  const roadIds = ['spawn-pedestrian-link', 'house14-courtyard-drive', 'zhandova-courtyard-drive'];
  const roads = layout.roads.filter(road => roadIds.includes(road.id));
  const stops = new Set();
  let travelled = 0, sightseeing = 0, previousSpeed = 0, previousTurn = 0;
  const dt = 1 / 20;
  for (let i = 0; i < 420 / dt; i++) {
    const pose = walk.update(dt);
    const { x, z } = pose;
    assert.ok(pointInRing(x, z, layout.walkable));
    assert.ok(isWalkable(layout, x, z, layout.movement.radiusM + 0.3));
    assert.ok(roads.some(road => road.centerline.slice(1).some((b, index) =>
      distanceToSegment(x, z, ...road.centerline[index], ...b) <= road.widthM / 2
    )), 'camera left the pavement');
    const speed = Math.hypot(x - previous.x, z - previous.z) / dt;
    assert.ok(speed < 0.86, 'walking pace');
    assert.ok(Math.abs(speed - previousSpeed) < 0.45 * dt, 'abrupt start or stop');
    travelled += speed * dt;
    if (speed < 0.00001) {
      stops.add([x.toFixed(1), z.toFixed(1)].join(','));
      if (Math.abs(pose.yaw - previous.yaw) > 0.00001) sightseeing += dt;
    }
    const turn = (pose.yaw - previous.yaw) / dt;
    assert.ok(Math.abs(turn) < 0.33, 'turn speed');
    assert.ok(Math.abs(turn - previousTurn) < 0.20 * dt, 'abrupt change in turn speed');
    assert.ok(Math.abs(pose.pitch - previous.pitch) < 0.036 * dt);
    assert.ok(Math.abs(pose.eyeOffset) < 0.0041);
    previousSpeed = speed;
    previousTurn = turn;
    previous = { ...pose };
  }
  assert.ok(stops.size >= 3 && sightseeing >= 5, 'walker did not pause and look around');
  assert.ok(travelled > 250 && travelled < 340);
});

test('camera pose after equal elapsed time is independent of the display frame rate', async () => {
  const { createAutoWalk } = await import('../yard/auto-walk.js');
  const poses = [12, 30, 60].map(fps => {
    const walk = createAutoWalk(layout, { random: () => 0.5 });
    for (let i = 0; i < 150 * fps; i++) walk.update(1 / fps);
    return walk.pose;
  });
  for (const pose of poses.slice(1)) {
    for (const key of ['x', 'z', 'yaw', 'pitch', 'eyeOffset']) {
      assert.ok(Math.abs(pose[key] - poses[0][key]) < 1e-7, key);
    }
  }
});

test('the walker can choose different itineraries after visiting the wall', async () => {
  const { createAutoWalk } = await import('../yard/auto-walk.js');
  const first = createAutoWalk(layout, { random: () => 0 });
  const second = createAutoWalk(layout, { random: () => 0.99 });
  let widestSeparation = 0;
  for (let i = 0; i < 160 / 0.05; i++) {
    first.update(0.05);
    second.update(0.05);
    widestSeparation = Math.max(widestSeparation, Math.hypot(first.pose.x - second.pose.x, first.pose.z - second.pose.z));
  }
  assert.ok(widestSeparation > 4);
});
