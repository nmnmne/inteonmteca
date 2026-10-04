const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const layout = JSON.parse(fs.readFileSync(path.join(__dirname, "../yard/data/site-layout.json"), "utf8"));

const kiosk = (layout.utilityStructures || []).find((item) => item.id === "electric-kiosk");
assert.ok(kiosk, "the user-confirmed electrical kiosk is modelled between house 14 and the 14-storey tower");
assert.equal(kiosk.osmWay, "402910822");
assert.equal(kiosk.footprint.length, 4);
assert.equal(kiosk.role, "electric-kiosk");

const roadIds = new Set((layout.roads || []).map((road) => road.osmWay));
assert.deepEqual(roadIds, new Set(["229651920", "251168367"]), "only the satellite-confirmed paved courtyard road network is rendered");
assert.ok(layout.roads.every((road) => road.surface === "asphalt" && road.centerline.length >= 4));
assert.equal((layout.parking || []).length, 0, "parked cars are not part of this scene");

const house14 = layout.buildings.find((building) => building.id === "house-14");
const tower34 = layout.buildings.find((building) => building.id === "tower-34");
const hru = layout.buildings.find((building) => building.id === "house-46-2");
assert.deepEqual(house14.facadeProject.balconyEdges, [7, 9], "the 9-storey building keeps balconies off the confirmed blank music-wall edges");
assert.equal(tower34.facadeProject.kind, "tower");
assert.equal(hru.facadeProject.kind, "five-storey");

const lighting = layout.lighting?.fixedSun;
assert.equal(lighting?.localMoment, "20 April 16:20", "the courtyard keeps one fixed late-afternoon light state");
assert.equal(lighting?.timeZone, "Asia/Oral");
assert.deepEqual(lighting?.shadowDirectionXZ, [0.65231, -0.44914], "all phantom shadows use the same fixed sun direction");

const entrances = layout.entrances || [];
const towerEntrance = entrances.find((item) => item.id === "tower-34-main-entrance");
assert.equal(towerEntrance?.osmNode, "4053107516", "the tower entrance stays attached to the mapped OSM entrance node");
assert.equal(towerEntrance?.buildingId, "tower-34");
assert.equal(towerEntrance?.edgeIndex, 4);
assert.equal(towerEntrance?.alongM, 0);
const photoEntrances = entrances.filter((item) => item.buildingId === "house-46-2");
assert.equal(photoEntrances.length, 2, "only the two independently visible 46/2 entry zones are added");
assert.ok(photoEntrances.every((item) => item.edgeIndex === 0 && item.source.includes("image_df69aa")));

const gasPipe = (layout.gasPipes || []).find((item) => item.id === "house-14-yellow-gas-pipe");
assert.ok(gasPipe, "the photo-confirmed yellow gas route is explicit layout data");
assert.equal(gasPipe?.buildingId, "house-14");
assert.equal(gasPipe?.color, "#e2c04a");
assert.equal(gasPipe?.path.length, 5, "the pipe includes facade, corner-drop and freestanding run");
assert.equal(gasPipe?.supports.length, 2, "the freestanding pipe has the visible support posts");

console.log("PASS: yard place");
