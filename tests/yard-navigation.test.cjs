const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const layout = JSON.parse(fs.readFileSync(path.join(__dirname, "../yard/data/site-layout.json"), "utf8"));

const run = async () => {
  const nav = await import("../yard/navigation.js");
  const { pointInRing, isWalkable, moveCircle } = nav;
  const radius = 0.3;

  const concave = [[0, 0], [10, 0], [10, 3], [4, 3], [4, 10], [0, 10]];
  assert.equal(pointInRing(2, 2, concave), true);
  assert.equal(pointInRing(2, 6, concave), true);
  assert.equal(pointInRing(8, 6, concave), false);

  const square = {
    walkable: [[0, 0], [20, 0], [20, 20], [0, 20]],
    buildings: [],
    circles: [],
  };
  assert.equal(isWalkable(square, 10, 10, radius), true);
  assert.equal(isWalkable(square, -5, 10, radius), false);
  assert.equal(isWalkable(square, 0.15, 0.15, radius), false);
  assert.equal(isWalkable(square, -0.2, -0.2, radius), false);

  const walled = {
    walkable: [[-40, -40], [40, -40], [40, 40], [-40, 40]],
    buildings: [{ footprint: [[0, -30], [1.2, -30], [1.2, 30], [0, 30]] }],
  };
  assert.equal(isWalkable(walled, 4, 0, radius), true);
  assert.equal(isWalkable(walled, 0.6, 0, radius), false);
  assert.equal(isWalkable(walled, -0.1, 0, radius), false);
  const tunneled = moveCircle(walled, -5, 0, 40, 0, radius, 0.2);
  assert.ok(tunneled.x < -0.2, `large delta crossed the wall: ${tunneled.x}`);
  assert.ok(tunneled.x > -1.2, `stopped too far from the wall: ${tunneled.x}`);

  const holed = {
    walkable: [[-30, -30], [30, -30], [30, 30], [-30, 30]],
    buildings: [{ footprint: [[-4, -4], [4, -4], [4, 4], [-4, 4]] }],
  };
  assert.equal(isWalkable(holed, 0, 0, radius), false);
  assert.equal(isWalkable(holed, 3.8, 0, radius), false);
  assert.equal(isWalkable(holed, 6, 0, radius), true);

  assert.equal(isWalkable(layout, layout.spawn.x, layout.spawn.z, layout.movement.radiusM), true);
  assert.equal(isWalkable(layout, -55, 70, layout.movement.radiusM), false);
  assert.equal(isWalkable(layout, 120, 10, layout.movement.radiusM), false);
  const towardWall = moveCircle(
    layout,
    layout.spawn.x,
    layout.spawn.z,
    -40,
    0,
    layout.movement.radiusM,
    layout.movement.maxStepM,
  );
  assert.ok(towardWall.x > -8.2, `walked through house 14: ${towardWall.x}`);
  assert.ok(towardWall.x < -6.5, `did not reach house 14: ${towardWall.x}`);

  const kiosk = layout.utilityStructures.find((item) => item.id === "electric-kiosk");
  const kioskCenter = kiosk.footprint.reduce(
    (sum, point) => [sum[0] + point[0] / kiosk.footprint.length, sum[1] + point[1] / kiosk.footprint.length],
    [0, 0],
  );
  assert.equal(
    isWalkable(layout, kioskCenter[0], kioskCenter[1], radius),
    false,
    "the electrical kiosk is a real obstacle between the two towers",
  );

  // The marked courtyard must provide a continuous exterior route around house 14;
  // the player may go around neighbouring buildings but never through them.
  const route = [
    [4, 30],
    [-40, 30],
    [-40, 115],
    [-20, 120],
    [50, 100],
    [50, 45],
    [10, 40],
    [10, 20],
    [4, 0],
  ];
  let position = { x: layout.spawn.x, z: layout.spawn.z };
  for (const [x, z] of route) {
    position = moveCircle(layout, position.x, position.z, x - position.x, z - position.z, radius, 0.2);
    assert.ok(Math.hypot(position.x - x, position.z - z) < 0.5, `route around house 14 is blocked before ${x}, ${z}`);
  }

  console.log("PASS: yard navigation");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
