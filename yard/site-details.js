import * as THREE from "./vendor/three.module.js";
import { facadeNormal } from "./facade-frame.js";


export function resolveFacadeAnchor(layout, anchor) {
  const building = (layout.buildings || []).find((item) => item.id === anchor.buildingId);
  if (!building?.footprint?.length) return null;
  const edgeIndex = Number(anchor.edgeIndex);
  const a = building.footprint[edgeIndex];
  const b = building.footprint[(edgeIndex + 1) % building.footprint.length];
  if (!a || !b) return null;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return null;
  const along = Math.max(0, Math.min(length, Number(anchor.alongM) || 0));
  const [nx, nz] = facadeNormal(a, b, building.footprint);
  const offset = Number(anchor.offsetM) || 0;
  return {
    x: a[0] + dx / length * along + nx * offset,
    y: Number(anchor.heightM ?? anchor.yM) || 0,
    z: a[1] + dz / length * along + nz * offset,
    nx,
    nz,
    yaw: Math.atan2(nx, nz),
  };
}

function box(width, height, depth, material, point, y, yaw, offset = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(point.x + point.nx * offset, y, point.z + point.nz * offset);
  mesh.rotation.y = yaw;
  return mesh;
}

export function addSiteEntrances(scene, materials, layout) {
  const entries = layout.entrances || [];
  const doorMaterial = materials.flat(0x293238);
  const frameMaterial = materials.flat(0x958f82);
  const concrete = materials.flat(0xa59d8e);
  const canopy = materials.flat(0x70756f);
  const group = new THREE.Group();
  group.name = "site-entrances";

  for (const entry of entries) {
    const anchor = resolveFacadeAnchor(layout, entry);
    if (!anchor) continue;
    const doorWidth = Number(entry.widthM) || 1.55;
    const doorHeight = Number(entry.heightM) || 2.1;
    const entryGroup = new THREE.Group();
    entryGroup.name = entry.id;

    const door = box(doorWidth, doorHeight, 0.1, doorMaterial, anchor, doorHeight / 2, anchor.yaw, 0.1);
    door.name = `${entry.id}-door`;
    entryGroup.add(door);
    for (const side of [-1, 1]) {
      entryGroup.add(box(0.13, doorHeight + 0.18, 0.15, frameMaterial, {
        ...anchor,
        x: anchor.x + Math.cos(anchor.yaw) * doorWidth * side * 0.53,
        z: anchor.z - Math.sin(anchor.yaw) * doorWidth * side * 0.53,
      }, (doorHeight + 0.18) / 2, anchor.yaw, 0.1));
    }
    entryGroup.add(box(doorWidth + 0.45, 0.14, 0.76, concrete, anchor, 0.07, anchor.yaw, 0.55));
    entryGroup.add(box(doorWidth + 0.26, 0.13, 0.42, concrete, anchor, 0.18, anchor.yaw, 0.93));
    if (entry.canopy !== false) {
      entryGroup.add(box(doorWidth + 0.72, 0.12, 0.76, canopy, anchor, doorHeight + 0.27, anchor.yaw, 0.44));
    }
    if (entry.stairWindow !== false) {
      const window = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.15, doorWidth), 1.1), materials.window());
      window.position.set(anchor.x + anchor.nx * 0.13, doorHeight + 1.45, anchor.z + anchor.nz * 0.13);
      window.rotation.y = anchor.yaw;
      entryGroup.add(window);
    }
    group.add(entryGroup);
  }
  scene.add(group);
  return group;
}

function cylinderBetween(group, from, to, radius, material, name) {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const vector = end.clone().sub(start);
  const length = vector.length();
  if (length < 0.02) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.name = name;
  mesh.position.copy(start.add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  group.add(mesh);
}

export function addGasPipes(scene, layout) {
  const collection = new THREE.Group();
  collection.name = "gas-pipes";
  for (const pipe of layout.gasPipes || []) {
    const points = pipe.path
      .map((anchor) => resolveFacadeAnchor(layout, { ...anchor, buildingId: anchor.buildingId || pipe.buildingId }))
      .filter(Boolean);
    if (points.length < 2) continue;
    const pipeGroup = new THREE.Group();
    pipeGroup.name = pipe.id;
    const pipeMaterial = new THREE.MeshStandardMaterial({ color: pipe.color || "#e2c04a", roughness: 0.64, metalness: 0.2 });
    const supportMaterial = new THREE.MeshStandardMaterial({ color: pipe.supportColor || "#665c46", roughness: 0.82, metalness: 0.05 });
    const radius = Math.max(0.04, Number(pipe.diameterM) / 2 || 0.055);
    for (let index = 1; index < points.length; index += 1) {
      cylinderBetween(pipeGroup, points[index - 1], points[index], radius, pipeMaterial, `${pipe.id}-segment-${index}`);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.18, 8, 6), pipeMaterial);
      joint.position.set(points[index - 1].x, points[index - 1].y, points[index - 1].z);
      pipeGroup.add(joint);
    }
    for (const support of pipe.supports || []) {
      const point = points[Number(support.pathIndex)];
      if (!point) continue;
      const floorY = Number(support.floorY) || 0;
      const height = Math.max(0.08, point.y - floorY);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, height, 8), supportMaterial);
      post.position.set(point.x, floorY + height / 2, point.z);
      pipeGroup.add(post);
    }
    collection.add(pipeGroup);
  }
  scene.add(collection);
  return collection;
}
