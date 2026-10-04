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

function utilityBeam(group, from, to, radius, material, segments = 8) {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const vector = end.clone().sub(start);
  const length = vector.length();
  if (length < 0.02) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  group.add(mesh);
  return mesh;
}

export function addReferenceUtilities(scene, materials) {
  const group = new THREE.Group();
  group.name = "reference-utility-forms";
  const concrete = materials.flat(0x777872);
  const metal = new THREE.MeshLambertMaterial({ color: 0x4f5653 });
  const pipeMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b8aa });
  // Photo layout: a heavy concrete service pole just right of the kiosk
  // and a slimmer street light farther left. Wires are intentionally omitted.
  const servicePole = { x: -9.2, z: -10.4, height: 8.7 };
  const serviceShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, servicePole.height, 8),
    concrete,
  );
  serviceShaft.position.set(servicePole.x, servicePole.height / 2, servicePole.z);
  group.add(serviceShaft);
  const serviceBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), metal);
  serviceBox.position.set(servicePole.x + 0.12, 4.8, servicePole.z - 0.14);
  serviceBox.rotation.y = -0.42;
  group.add(serviceBox);

  const streetPole = { x: -39.5, z: 1.8, height: 7.1 };
  const streetShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.13, streetPole.height, 8),
    metal,
  );
  streetShaft.position.set(streetPole.x, streetPole.height / 2, streetPole.z);
  group.add(streetShaft);
  utilityBeam(
    group,
    { x: streetPole.x, y: streetPole.height - 0.06, z: streetPole.z },
    { x: streetPole.x + 1.35, y: streetPole.height + 0.48, z: streetPole.z - 0.22 },
    0.055,
    metal,
    8,
  );
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.28), metal);
  lamp.position.set(streetPole.x + 1.55, streetPole.height + 0.45, streetPole.z - 0.25);
  lamp.rotation.z = -0.08;
  group.add(lamp);
  const pipePoints = [
    { x: -2, y: 2.25, z: 3 },
    { x: -15, y: 2.25, z: 10 },
    { x: -30, y: 2.25, z: 18 },
    { x: -45, y: 2.25, z: 26 },
  ];
  for (let index = 1; index < pipePoints.length; index += 1) {
    utilityBeam(group, pipePoints[index - 1], pipePoints[index], 0.075, pipeMaterial, 10);
  }
  pipePoints.forEach((point, index) => {
    if (index === 0 || index === pipePoints.length - 1 || index % 2 === 0) {
      utilityBeam(group, { ...point, y: 0 }, point, 0.055, metal, 7);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), concrete);
      foot.position.set(point.x, 0.06, point.z);
      group.add(foot);
    }
  });

  scene.add(group);
  return group;
}
