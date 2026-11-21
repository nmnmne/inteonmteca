const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('the arrival frames the signed wall in landscape and portrait before settling into flight', async () => {
  const { ambientOpeningView, createAutoWalk } = await import('../yard/auto-walk.js');
  const [a, b] = layout.musicWall.segment;
  for (const aspect of [1.6, 0.5, 390 / 844]) {
    const pose = ambientOpeningView(layout, aspect);
    const halfWidth = aspect * Math.tan(pose.fov * Math.PI / 360);
    const wallScreenX = fraction => {
      const x = a[0] + (b[0] - a[0]) * fraction;
      const z = a[1] + (b[1] - a[1]) * fraction;
      const bearing = Math.atan2(x - pose.x, pose.z - z);
      return 0.5 + 0.5 * Math.tan(bearing - pose.yaw) / halfWidth;
    };
    assert.ok(wallScreenX(0.5) > 0.4 && wallScreenX(0.5) < 0.8);
    if (aspect > 1) {
      for (const end of [0.1, 0.75]) assert.ok(wallScreenX(end) > 0 && wallScreenX(end) < 0.95);
    }
    const crow = createAutoWalk(layout, { openingView: pose, random: () => 0.3 });
    assert.equal(crow.update(0).fov, pose.fov);
    assert.equal(crow.update(8).fov, 64);
  }
});

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
    assert.ok(speed <= 8.5 + 1e-6, 'teleport between destinations');
    if (i > 30) assert.ok(speed > 0.005, 'unexpected stationary interval');
    travelled += speed * dt;
    const turn = (pose.yaw - previous.yaw) / dt;
    assert.ok(Math.abs(turn) < .88, 'turn speed');
    assert.ok(Math.abs(turn - previousTurn) < .79 * dt, 'abrupt change in turn speed');
    assert.ok(Math.abs(pose.pitch - previous.pitch) <= .241 * dt);
    assert.ok(Math.abs(pose.roll - previous.roll) < .65 * dt);
    assert.ok(Math.abs(pose.y - previous.y) < 5.5 * dt);
    assert.ok(Math.abs(pose.eyeOffset) < .028);
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

test('the crow walks on open ground, climbs, alternates wingbeats and glides, and lands', async () => {
  const { createAutoWalk, ambientOpeningView } = await import('../yard/auto-walk.js');
  const { isWalkable } = await import('../yard/navigation.js');
  const opening = ambientOpeningView(layout);
  const walk = createAutoWalk(layout, { random: () => .3, openingView:opening });
  assert.equal(walk.pose.y,layout.movement.eyeM);
  assert.equal(walk.pose.yaw,opening.yaw);
  const phases = new Set();
  let previous = { ...walk.pose }, touchdowns = 0, peak = 0, bank = 0, wingbeat = 0;
  for (let i=0; i<3600; i++) {
    const pose = walk.update(.05);
    phases.add(pose.mode);
    assert.equal(pose.eyeOffset,0,'footfalls and wingbeats leave the camera steady');
    if (previous.mode === 'land' && pose.mode === 'walk') {
      assert.ok(isWalkable(layout, pose.x, pose.z, .3), 'touchdown needs clear ground');
      touchdowns++;
    }
    if (pose.mode === 'walk') {
      assert.ok(pose.y > .38 && pose.y < .46, 'head stays at crow height while walking');
    } else if (pose.mode === 'flap') {
      wingbeat = Math.max(wingbeat,Math.abs(pose.wingPhase - previous.wingPhase));
    } else if (pose.mode === 'glide') {
      assert.equal(pose.eyeOffset,0,'head settles in the glide');
    }
    bank = Math.max(bank,Math.abs(pose.roll));
    peak = Math.max(peak,pose.y);
    previous = { ...pose };
  }
  assert.deepEqual(phases,new Set(['walk','takeoff','flap','glide','land']));
  assert.ok(touchdowns >= 2 && peak > 10 && bank > .10 && wingbeat > .02);
});

test('camera pose after equal elapsed time is independent of the display frame rate', async () => {
  const { createAutoWalk } = await import('../yard/auto-walk.js');
  const poses = [12, 30, 60].map(fps => {
    const walk = createAutoWalk(layout, { random: () => 0.5 });
    for (let i = 0; i < 150 * fps; i++) walk.update(1 / fps);
    return walk.pose;
  });
  for (const pose of poses.slice(1)) {
    assert.equal(poses[0].mode,pose.mode);
    for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'eyeOffset']) {
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

test('every other approach picks a different safe courtyard touchdown on the same flight', async () => {
  const {createAutoWalk} = await import('../yard/auto-walk.js');
  const {isWalkable, pointInRing} = await import('../yard/navigation.js');
  function fly(selectionFrame, selection, count) {
    let frame = 0, draws = 0;
    const walk = createAutoWalk(layout, {random: () => {
      draws++;
      return frame === selectionFrame ? selection : .3;
    }});
    const approaches = [], stops = [];
    while (stops.length < count && frame < 30000) {
      const before = walk.pose.mode;
      draws = 0;
      const pose = walk.update(1/60);
      if (before !== 'land' && pose.mode === 'land') approaches.push({frame, draws});
      if (before === 'land' && pose.mode === 'walk') stops.push([pose.x, pose.z]);
      frame++;
    }
    assert.equal(stops.length, count);
    return {approaches, stops};
  }
  const regular = fly(-1, 0, 4);
  assert.deepEqual(regular.approaches.map(a => a.draws), [1, 0, 1]);
  const frame = regular.approaches[0].frame;
  const near = fly(frame, 0, 2), far = fly(frame, .999, 2);
  assert.deepEqual(near.stops[0], far.stops[0]);
  assert.ok(Math.hypot(near.stops[1][0]-far.stops[1][0], near.stops[1][1]-far.stops[1][1]) > 6);
  for (const stop of [near.stops[1], far.stops[1], regular.stops[3]]) {
    assert.ok(pointInRing(...stop, layout.walkable) && isWalkable(layout, ...stop, 1));
  }
});
