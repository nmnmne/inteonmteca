const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('the backdrop crosses a house, returns to open ground and traverses all map sectors and edges', async () => {
  const { createAutoWalk } = await import('../yard/auto-walk.js');
  const { pointInRing } = await import('../yard/navigation.js');
  const walk = createAutoWalk(layout, { random: () => 0.3 });
  let previous = { ...walk.update(0) };
  assert.equal(previous.x, layout.spawn.x);
  assert.equal(previous.yaw, layout.spawn.yaw);
  const houses = new Set(), sectors = new Set(), outside = new Set();
  const xs = layout.walkable.map(p => p[0]), zs = layout.walkable.map(p => p[1]);
  const west = Math.min(...xs), east = Math.max(...xs), north = Math.min(...zs), south = Math.max(...zs);
  const extent = layout.virtualBoundary.fullOutsideM;
  let travelled = 0, previousTurn = 0, entered, exited, backInside;
  const dt = 0.1;
  for (let i = 1; i <= 900 / dt; i++) {
    const pose = walk.update(dt);
    const { x, z } = pose;
    const building = layout.buildings.find(b => pointInRing(x, z, b.footprint));
    if (building) {
      houses.add(building.id);
      if (building.id === layout.musicWall.buildingId) entered ??= i * dt;
    } else if (entered) exited ??= i * dt;
    if (x < west - extent) outside.add('west');
    if (x > east + extent) outside.add('east');
    if (z < north - extent) outside.add('north');
    if (z > south + extent) outside.add('south');
    if (pointInRing(x, z, layout.walkable)) {
      const column = Math.floor((x - west) / (east - west) * 3);
      const row = Math.floor((z - north) / (south - north) * 3);
      sectors.add(column + ',' + row);
      if (outside.size > 0 && pointInRing(x, z, layout.virtualBoundary.noticeableRing)) backInside ??= i * dt;
    }
    const speed = Math.hypot(x - previous.x, z - previous.z) / dt;
    assert.ok(speed <= layout.movement.speedMps + 1e-6, 'teleport between destinations');
    if (i > 30) assert.ok(speed > 0.005, 'unexpected stationary interval');
    travelled += speed * dt;
    const turn = (pose.yaw - previous.yaw) / dt;
    assert.ok(Math.abs(turn) < 0.56, 'turn speed');
    assert.ok(Math.abs(turn - previousTurn) < 0.35 * dt, 'abrupt change in turn speed');
    assert.ok(Math.abs(pose.pitch - previous.pitch) < 0.036 * dt);
    assert.ok(Math.abs(pose.eyeOffset) < 0.0041);
    previousTurn = turn;
    previous = { ...pose };
  }
  assert.ok(entered < 10 && exited > entered && exited < 20, 'opening facade crossing');
  assert.ok(backInside < 120, 'opening excursion did not return to the courtyard');
  assert.deepEqual([...houses].sort(), layout.buildings.map(b => b.id).sort());
  assert.equal(sectors.size, 9);
  assert.equal(outside.size, 4);
  assert.ok(travelled > 900 * layout.movement.speedMps * 0.98);
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
