import * as THREE from "./vendor/three.module.js";

/** Adds the lived-in details that make five-storey blocks readable at street level. */
export function addHruDetails(scene, materials, { balconies = [] }) {
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
