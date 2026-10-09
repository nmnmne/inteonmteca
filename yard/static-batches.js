import * as THREE from './vendor/three.module.js';

// Only anonymous, opaque decoration is combined. Interactive/named meshes and
// collision targets retain their identity. Small cells keep frustum culling useful.
export function batchStaticDecoration(scene, solids, cellSize = 24) {
  scene.updateMatrixWorld(true);
  const protectedMeshes = new Set(solids);
  const buckets = new Map();
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.name || mesh.children.length ||
        protectedMeshes.has(mesh) || !mesh.visible || Array.isArray(mesh.material) ||
        mesh.material.transparent || mesh.material.wireframe || mesh.geometry.morphAttributes.position) return;
    for (let parent = mesh.parent; parent; parent = parent.parent) if (!parent.visible) return;
    const attributes = Object.keys(mesh.geometry.attributes).sort();
    if (attributes.some(key => !['position', 'normal', 'uv'].includes(key))) return;
    const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const key = `${mesh.material.uuid}:${Math.floor(p.x/cellSize)}:${Math.floor(p.z/cellSize)}:${attributes.join(',')}:${mesh.userData.bakedShadowCaster}:${mesh.userData.digitalBuilding}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(mesh);
  });
  const retired = new Set();
  let sources = 0, batches = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrixWorld);
    });
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(parts[0].attributes)) {
      const size = parts.reduce((sum, part) => sum + part.attributes[name].array.length, 0);
      const array = new Float32Array(size);
      let offset = 0;
      for (const part of parts) {
        array.set(part.attributes[name].array, offset);
        offset += part.attributes[name].array.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, parts[0].attributes[name].itemSize));
    }
    // Center vertices to avoid unnecessarily large local coordinates.
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingSphere();
    const batch = new THREE.Mesh(geometry, meshes[0].material);
    batch.position.copy(center);
    batch.name = `static-decoration-${batches++}`;
    batch.userData.bakedShadowCaster = meshes[0].userData.bakedShadowCaster;
    batch.userData.digitalBuilding = meshes[0].userData.digitalBuilding;
    scene.add(batch);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      retired.add(mesh.geometry);
    }
    parts.forEach(part => part.dispose());
    sources += meshes.length;
  }
  scene.traverse(mesh => retired.delete(mesh.geometry));
  retired.forEach(geometry => geometry.dispose());
  scene.userData.staticBatches = { sources, batches, savedMeshes: sources - batches };
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (mesh.isMesh || mesh.isLineSegments) mesh.matrixAutoUpdate = false;
  });
}
