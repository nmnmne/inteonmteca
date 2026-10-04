import * as THREE from "./vendor/three.module.js";

export function projectShadowFootprint(ring, height, sun) {
  const dx = -height * sun[0] / Math.max(0.05, sun[1]);
  const dz = -height * sun[2] / Math.max(0.05, sun[1]);
  const roof = ring.map(([x, z]) => [x + dx, z + dz]);
  return [ring, roof, ...ring.map((point, i) => {
    const next = (i + 1) % ring.length;
    return [point, ring[next], roof[next], roof[i]];
  })];
}

export function bakeGroundShadows(scene, layout, sun) {
  const polygons = [...(layout.buildings || []), ...(layout.utilityStructures || [])]
    .flatMap(item => projectShadowFootprint(item.footprint, item.heightM, sun.sunVectorXYZ));
  const points = polygons.flat();
  if (!points.length) return sun;
  const minX = Math.min(...points.map(p => p[0])) - 5;
  const minZ = Math.min(...points.map(p => p[1])) - 5;
  const width = Math.max(...points.map(p => p[0])) - minX + 5;
  const depth = Math.max(...points.map(p => p[1])) - minZ + 5;
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = Math.max(256, Math.round(2048 * depth / width));
  const context = canvas.getContext("2d");
  context.fillStyle = "#26313c";
  // Paint opaque silhouettes first: overlaps must not accumulate darkness.
  for (const ring of polygons) {
    context.beginPath();
    ring.forEach(([x,z], i) => {
      const u = (x - minX) / width * canvas.width;
      const v = (z - minZ) / depth * canvas.height;
      if (i) context.lineTo(u,v); else context.moveTo(u,v);
    });
    context.closePath();
    context.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({
    map, transparent: true, opacity: 0.3, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(minX + width / 2, 0.045, minZ + depth / 2);
  mesh.name = "baked-lighting";
  mesh.userData.fixedMoment = "20 April 16:20 Asia/Oral";
  scene.add(mesh);
  return sun;
}
