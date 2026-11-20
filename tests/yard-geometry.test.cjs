const assert = require("node:assert/strict");

(async () => {
  const THREE = await import("../yard/vendor/three.module.js");
  const { addRoadDetails } = await import("../yard/road-details.js");
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  addRoadDetails(scene, { asphalt: () => material }, [{
    id: "corner", kind: "asphalt", widthM: 4,
    centerline: [[0, 0], [10, 0], [10, 10]],
  }]);
  const mesh = scene.getObjectByName("road-corner");
  const normals = mesh.geometry.getAttribute("normal");
  for (let i = 0; i < normals.count; i += 1) {
    assert.ok(normals.getY(i) > 0.99, "road front faces must point UP, visible from a walking camera");
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 2, 0), new THREE.Vector3(0, -1, 0));
  scene.updateMatrixWorld(true);
  assert.ok(ray.intersectObject(mesh).length, "front-side road is actually hittable from above");
  const uv = mesh.geometry.getAttribute("uv");
  const positions = mesh.geometry.getAttribute("position");
  for (let i=0; i<uv.count; i++) {
    assert.equal(uv.getX(i), positions.getX(i));
    assert.equal(uv.getY(i), -positions.getZ(i), "cracks follow the same world-metre coordinates across the road and courtyard");
  }
  console.log("PASS: yard geometry / visible roads");
})().catch((error) => { console.error(error); process.exitCode = 1; });
