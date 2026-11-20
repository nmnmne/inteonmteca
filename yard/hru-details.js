import * as THREE from "./vendor/three.module.js";

/** Adds the lived-in details that make five-storey blocks readable at street level. */
export function addHruDetails(scene, materials, { windows = [], balconies = [] }) {
  if (windows.length) {
    const box = new THREE.BoxGeometry();
    const rebates = new THREE.InstancedMesh(box, materials.flat(0x665f54), windows.length);
    const sills = new THREE.InstancedMesh(box, materials.mineral(0xb6afa1), windows.length);
    const part = new THREE.Object3D();
    for (const [index, pane] of windows.entries()) {
      const nx = Math.sin(pane.yaw), nz = Math.cos(pane.yaw);
      part.rotation.set(0, pane.yaw, 0, 'YXZ');
      part.position.set(pane.x - .045 * nx, pane.y, pane.z - .045 * nz);
      part.scale.set(pane.width + .11, pane.height + .10, .07);
      part.updateMatrix(); rebates.setMatrixAt(index, part.matrix);
      part.position.set(pane.x + .038 * nx, pane.y - pane.height / 2 - .042, pane.z + .038 * nz);
      part.rotation.x = .07;
      part.scale.set(pane.width + .18, .075, .24);
      part.updateMatrix(); sills.setMatrixAt(index, part.matrix);
    }
    rebates.name = 'window-rebates'; sills.name = 'window-sills';
    scene.add(rebates, sills);
  }
  if (balconies.length) {
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.78, 0.07), materials.balcony(), balconies.length);
    const dummy = new THREE.Object3D();
    const tones = [0xb9b5a7, 0x8d9999, 0xa5afb3, 0xa58c80];
    balconies.forEach((item, index) => {
      dummy.position.set(item.x + item.nx * item.depth * 0.45, item.y + 0.43, item.z + item.nz * item.depth * 0.45);
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(item.width, 1, 1);
      dummy.updateMatrix();
      panels.setMatrixAt(index, dummy.matrix);
      panels.setColorAt(index, new THREE.Color(tones[index % tones.length]));
    });
    panels.name = "balcony-parapets";
    scene.add(panels);
  }
  const glazed = balconies.filter((item) => item.variant === "glazed");
  if (glazed.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.35, 1.35, 0.06),
      materials.window(),
      glazed.length,
    );
    const dummy = new THREE.Object3D();
    glazed.forEach((item, index) => {
      dummy.position.set(item.x + item.nx * (item.depth * 0.42), item.y + 1.52, item.z + item.nz * (item.depth * 0.42));
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(item.width / 1.35, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.name = "glazed-balconies";
    scene.add(mesh);
  }

}
