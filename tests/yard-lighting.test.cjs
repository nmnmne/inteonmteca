const assert = require("node:assert/strict");
(async () => {
  const lighting = await import("../yard/baked-lighting.js");
  assert.equal(typeof lighting.projectShadowFootprint, "function", "baked silhouettes must project the actual footprint, not ellipses");
  const shape = [[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]];
  const parts = lighting.projectShadowFootprint(shape, 20, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  assert.equal(parts.length, shape.length + 2, "concave building retains footprint, roof projection and all side sweeps");
  assert.deepEqual(parts[1], shape.map(([x,z]) => [x - 20,z]), "height / sun elevation determines length, not an arbitrary cap");
  const layout = {lighting:{fixedSun:{altitudeDeg:37.629, azimuthDegFromNorth:235.451}}};
  const first = lighting.fixedSunForLayout(layout);
  assert.deepEqual(first, lighting.fixedSunForLayout(layout), "no dependency on current date/time");
  assert.ok(Math.abs(Math.hypot(...first.sunVectorXYZ) - 1) < 1e-8);
  const shadow = lighting.projectShadowFootprint(shape, 25.2, first.sunVectorXYZ)[1];
  assert.ok(shadow[0][0] > 20 && shadow[0][1] < -15, "afternoon shadow runs northeast in X-east / Z-south coordinates");
  console.log("PASS: yard fixed solar projection");
})().catch(error => {console.error(error);process.exitCode=1;});
