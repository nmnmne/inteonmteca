import * as THREE from "./vendor/three.module.js";

function roofGeometry(footprint) {
  const shape = new THREE.Shape();
  footprint.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

function addGableRoof(group, footprint, baseY, rise, material) {
  const [a, b, c, d] = footprint;
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ad = Math.hypot(d[0] - a[0], d[1] - a[1]);
  const eaves = ab >= ad ? [[a, b], [d, c]] : [[a, d], [b, c]];
  const ridgeA = [
    (eaves[0][0][0] + eaves[1][0][0]) / 2,
    baseY + rise,
    (eaves[0][0][1] + eaves[1][0][1]) / 2,
  ];
  const ridgeB = [
    (eaves[0][1][0] + eaves[1][1][0]) / 2,
    baseY + rise,
    (eaves[0][1][1] + eaves[1][1][1]) / 2,
  ];
  const vertices = new Float32Array([
    eaves[0][0][0], baseY, eaves[0][0][1],
    eaves[0][1][0], baseY, eaves[0][1][1],
    eaves[1][0][0], baseY, eaves[1][0][1],
    eaves[1][1][0], baseY, eaves[1][1][1],
    ...ridgeA,
    ...ridgeB,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3]);
  geometry.computeVertexNormals();
  const roof = new THREE.Mesh(geometry, material);
  group.add(roof);
}

function addKioskPipes(group, footprint, wallHeight) {
  let best = null;
  const center = footprint.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
    .map((value) => value / footprint.length);
  footprint.forEach((start, index) => {
    const end = footprint[(index + 1) % footprint.length];
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.4) return;
    const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const outwardScore = (mid[0] - center[0]) * (4 - center[0]) + (mid[1] - center[1]) * (0 - center[1]);
    if (!best || outwardScore > best.score) best = { start, end, dx, dz, length, score: outwardScore };
  });
  if (!best) return;
  const nx = best.dz / best.length;
  const nz = -best.dx / best.length;
  const sign = (center[0] - (best.start[0] + best.end[0]) / 2) * nx + (center[1] - (best.start[1] + best.end[1]) / 2) * nz > 0 ? -1 : 1;
  const ox = nx * sign * 0.7;
  const oz = nz * sign * 0.7;
  const y = wallHeight + 0.15;
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d8d4, roughness: 0.45, metalness: 0.35 });
  const from = { x: best.start[0] + ox, y, z: best.start[1] + oz };
  const to = { x: best.end[0] + ox, y, z: best.end[1] + oz };
  const span = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const length = span.length();
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 8), pipeMaterial);
  pipe.position.set((from.x + to.x) / 2, y, (from.z + to.z) / 2);
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.normalize());
  group.add(pipe);
  for (const t of [0.22, 0.78]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, y, 6), pipeMaterial);
    post.position.set(from.x + (to.x - from.x) * t, y / 2, from.z + (to.z - from.z) * t);
    group.add(post);
  }
}

export function addUtilityStructures(scene, materials, structures = []) {
  for (const structure of structures) {
    if (structure.role !== "electric-kiosk" || !Array.isArray(structure.footprint) || structure.footprint.length < 3) continue;
    const group = new THREE.Group();
    const height = Number(structure.heightM) || 2.7;
    const wallMaterial = materials.flat(0xc8b79a);

    structure.footprint.forEach((start, index) => {
      const end = structure.footprint[(index + 1) % structure.footprint.length];
      const dx = end[0] - start[0];
      const dz = end[1] - start[1];
      const length = Math.hypot(dx, dz);
      if (length < 0.05) return;

      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height, 0.18), wallMaterial);
      wall.position.set((start[0] + end[0]) / 2, height / 2, (start[1] + end[1]) / 2);
      wall.rotation.y = -Math.atan2(dz, dx);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    });

    if (structure.footprint.length === 4) {
      const roofMaterial = materials.flat(0x8a8d88);
      roofMaterial.side = THREE.DoubleSide;
      addGableRoof(group, structure.footprint, height, 0.85, roofMaterial);
    } else {
      const roof = new THREE.Mesh(roofGeometry(structure.footprint), materials.flat(0x8a8d88));
      roof.position.y = height + 0.08;
      group.add(roof);
    }
    addKioskPipes(group, structure.footprint, height);
    group.name = structure.id;
    scene.add(group);
  }
}
