import * as THREE from "./vendor/three.module.js";

function stripGeometry(centerline, width) {
  const sides = [];
  const distances = [0];
  for (let index = 1; index < centerline.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(
      centerline[index][0] - centerline[index - 1][0],
      centerline[index][1] - centerline[index - 1][1],
    ));
  }
  for (let index = 0; index < centerline.length; index += 1) {
    const point = centerline[index];
    const previous = centerline[Math.max(0, index - 1)];
    const next = centerline[Math.min(centerline.length - 1, index + 1)];
    const normal = (a, b) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    };
    const incoming = index ? normal(previous, point) : normal(point, next);
    const outgoing = index < centerline.length - 1 ? normal(point, next) : incoming;
    const length = Math.hypot(incoming[0] + outgoing[0], incoming[1] + outgoing[1]) || 1;
    const nx = (incoming[0] + outgoing[0]) / length;
    const nz = (incoming[1] + outgoing[1]) / length;
    const miter = Math.min(width, width / (2 * Math.max(0.5, nx * outgoing[0] + nz * outgoing[1])));
    sides.push([[point[0] + nx * miter, point[1] + nz * miter], [point[0] - nx * miter, point[1] - nz * miter]]);
  }
  const vertices = [];
  const uvs = [];
  for (let index = 0; index < sides.length; index += 1) {
    for (const point of sides[index]) vertices.push(point[0], 0.022, point[1]);
    const v = distances[index] / 6;
    uvs.push(0, v, width / 6, v);
  }
  const indices = [];
  for (let index = 0; index < sides.length - 1; index += 1) {
    const left = index * 2;
    indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, sides };
}

function addCurb(scene, a, b, material) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.2) return;
  const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, 0.14), material);
  curb.position.set((a[0] + b[0]) / 2, 0.07, (a[1] + b[1]) / 2);
  curb.rotation.y = -Math.atan2(dz, dx);
  scene.add(curb);
}

export function addRoadDetails(scene, materials, roads = []) {
  const curbMaterial = new THREE.MeshLambertMaterial({ color: 0xb7b0a7 });
  for (const road of roads) {
    if (road.render === false || road.kind !== "asphalt" || road.centerline.length < 2) continue;
    const { geometry, sides } = stripGeometry(road.centerline, road.widthM);
    const asphalt = new THREE.Mesh(geometry, materials.asphalt(6, 6));
    asphalt.name = `road-${road.id}`;
    scene.add(asphalt);
    if (road.curbEdges === "both") {
      for (const side of [0, 1]) {
        for (let index = 0; index < sides.length - 1; index += 1) addCurb(scene, sides[index][side], sides[index + 1][side], curbMaterial);
      }
    }
  }
}
