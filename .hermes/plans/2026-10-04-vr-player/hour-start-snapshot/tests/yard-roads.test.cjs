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
assert.deepEqual(roads.map((road) => road.osmWay).sort(), ["229651920", "251168367"], "only the mapped, imagery-aligned courtyard service ways are rendered");
for (const road of roads) {
  assert.equal(road.kind, "asphalt", `${road.id} retains its mapped asphalt surface`);
  assert.match(road.source || "", /OSM way/, `${road.id} carries its provenance`);
  assert.match(road.confidence || "", /mapped-and-imagery-aligned/, `${road.id} is not an invented driveway`);
  assert.ok(road.widthM > 3 && road.widthM < 6, `${road.id} has a restrained visual width estimate`);
  for (const [x, z] of road.centerline) {
    assert.equal(layout.buildings.some((building) => pointInRing(x, z, building.footprint)), false, `${road.id} does not run through a building footprint`);
  }
}
assert.match(layout.roadsStatus || "", /mapped/, "the road status records that the two service ways are evidence-backed");
console.log("PASS: yard roads");
