import * as THREE from "./vendor/three.module.js";

function addCurb(scene, a, b, material) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.2) return;
  const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.16), material);
  curb.position.set((a[0] + b[0]) / 2, 0.08, (a[1] + b[1]) / 2);
  curb.rotation.y = -Math.atan2(dz, dx);
  scene.add(curb);
}

function addCar(scene, car, materials) {
  const group = new THREE.Group();
  group.position.set(car.x, 0.02, car.z);
  group.rotation.y = car.yaw || 0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.48, 3.8), new THREE.MeshLambertMaterial({ color: car.color || "#777777" }));
  body.position.y = 0.48;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.5, 1.78), materials.carGlass);
  cabin.position.set(0, 0.93, -0.15);
  group.add(cabin);
  for (const [x, z] of [[-0.82, -1.2], [0.82, -1.2], [-0.82, 1.2], [0.82, 1.2]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 10), materials.wheel);
    wheel.position.set(x, 0.3, z);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
  }
  scene.add(group);
}

export function addCourtyardDetails(scene, layout) {
  const curbMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b3aa });
  for (const surface of layout.surfaces || []) {
    if (surface.kind !== "asphalt") continue;
    const ring = surface.polygon;
    for (let index = 0; index < ring.length; index += 1) addCurb(scene, ring[index], ring[(index + 1) % ring.length], curbMaterial);
  }
}
