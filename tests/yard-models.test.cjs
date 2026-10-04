const assert = require("node:assert/strict");

const run = async () => {
  const {
    FACADE_SPECS,
    facadeSpec,
    playgroundFootprints,
    openingsForFacade,
  } = await import("../yard/models.js");

  assert.equal(facadeSpec("house14-brick-light").kind, "brick");
  assert.equal(facadeSpec("tower34-panel").kind, "panel");
  assert.notEqual(
    facadeSpec("house14-brick-light").baseColor,
    facadeSpec("tower34-panel").baseColor,
    "the 9-storey house and the 14-storey tower need different facade materials",
  );
  assert.equal(FACADE_SPECS["house46-1-patchwork"].kind, "masonry-panel");

  const openings = openingsForFacade({
    id: "tower-34",
    floors: 14,
    heightM: 39.2,
    facadeMaterialId: "tower34-panel",
  }, 21);
  assert.ok(openings.windows.length >= 14, "the tower needs an actual window rhythm");
  assert.ok(openings.balconies.length >= 5, "the tower needs balcony geometry, not a flat wall");

  const hru = openingsForFacade({
    id: "house-46-1",
    floors: 5,
    heightM: 14,
    facadeMaterialId: "house46-1-patchwork",
  }, 32);
  assert.equal(hru.entrances.length, 0, "entrances stay absent until their sides and positions are confirmed");
  const levels = [...new Set(hru.balconies.map(item => item.y))];
  assert.deepEqual(hru.balconies.filter(item => item.y === levels[0]).map(item => item.along),
    hru.balconies.filter(item => item.y === levels[1]).map(item => item.along), "balconies stack vertically, never checkerboard between floors");
  assert.ok(hru.balconies.some((balcony) => balcony.variant === "glazed"), "some balconies are enclosed like a lived-in hruščëvka");

  const nineStorey = openingsForFacade({
    id: "house-14",
    floors: 9,
    heightM: 25.2,
    facadeMaterialId: "house14-brick-light",
    facadeProject: { kind: "nine-storey", balconyEdges: [7, 9], balconyEvery: 1 },
  }, 60, 7);
  assert.ok(nineStorey.balconies.length > 0, "the observed courtyard elevations of house 14 carry balcony stacks");
  const nineStoreyBlank = openingsForFacade({
    id: "house-14",
    floors: 9,
    heightM: 25.2,
    facadeMaterialId: "house14-brick-light",
    facadeProject: { kind: "nine-storey", balconyEdges: [7, 9], balconyEvery: 1 },
  }, 48, 0);
  assert.equal(nineStoreyBlank.balconies.length, 0, "the music-wall side stays free of invented balconies");

  const hruEnd = openingsForFacade({
    id: "house-46-2",
    floors: 5,
    heightM: 14,
    facadeMaterialId: "house46-2-pink",
    facadeProject: { kind: "five-storey", longFacesOnly: true },
  }, 11, 1);
  assert.equal(hruEnd.balconies.length, 0, "short five-storey ends do not receive a generic balcony grid");

  const playground = {
    sandbox: { x: -24, z: 39, size: 3.4 },
    bars: { x: -18, z: 42, span: 4.2, depth: 1.2 },
    slide: { x: -27, z: 34, width: 1.6, length: 4.2 },
  };
  const obstacles = playgroundFootprints(playground);
  assert.deepEqual(obstacles.map((item) => item.id), ["sandbox", "bars", "slide"]);
  assert.ok(obstacles.every((item) => item.footprint.length === 4));

  console.log("PASS: yard models");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
