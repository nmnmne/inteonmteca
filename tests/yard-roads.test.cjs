const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const layout = JSON.parse(fs.readFileSync(path.join(__dirname, "../yard/data/site-layout.json"), "utf8"));
const roads = layout.roads || [];

function pointInRing(x, z, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

assert.equal((layout.parking || []).length, 0, "cars are not authored into the courtyard without a request");
assert.deepEqual(roads.filter(road => road.osmWay).map((road) => road.osmWay).sort(), ["229651920", "251168367"], "retain the original mapped ways alongside user-authored additions");
for (const road of roads) {
  assert.equal(road.kind, "asphalt", `${road.id} retains its mapped asphalt surface`);
  assert.match(road.source || "", /OSM way|User road markup/, `${road.id} carries its provenance`);
  assert.match(road.confidence || "", /mapped-and-imagery-aligned|user-drawn-alignment/, `${road.id} has a supplied reference`);
  assert.ok(road.widthM >= 1.8 && road.widthM <= 9, `${road.id} has a path, driveway or forecourt width`);
  for (const [x, z] of road.centerline) {
    assert.equal(layout.buildings.some((building) => pointInRing(x, z, building.footprint)), false, `${road.id} does not run through a building footprint`);
  }
}
assert.match(layout.roadsStatus || "", /user-marked/, "the road status records the new user-supplied evidence");
console.log("PASS: yard roads");
