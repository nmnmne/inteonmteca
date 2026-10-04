import * as THREE from "./vendor/three.module.js";
import { bakeGroundShadows } from "./shadow-atlas.js";

export { projectShadowFootprint } from "./shadow-atlas.js";

const DEFAULT_FIXED_SUN = Object.freeze({
  localMoment: "20 April 16:20",
  timeZone: "Asia/Oral",
  altitudeDeg: 37.629,
  azimuthDegFromNorth: 235.451,
  sunVectorXYZ: [-0.65231, 0.61055, 0.44914],
  shadowDirectionXZ: [0.65231, -0.44914],
  skyColor: "#a4bec9",
  fogColor: "#a4bec9",
  ambientIntensity: 0.56,
  hemisphereIntensity: 0.4,
  sunIntensity: 1.18,
  phantomLengthScale: 0.47,
});

function numberArray(value, count, fallback) {
  if (!Array.isArray(value) || value.length !== count || value.some((item) => !Number.isFinite(Number(item)))) value = fallback;
  const numbers = value.map(Number);
  const length = count === 3 ? Math.hypot(...numbers) : 1;
  return numbers.map(item => item / (length || 1));
}

export function fixedSunForLayout(layout) {
  const source = layout?.lighting?.fixedSun || {};
  return {
    ...DEFAULT_FIXED_SUN,
    ...source,
    sunVectorXYZ: numberArray(source.sunVectorXYZ, 3, DEFAULT_FIXED_SUN.sunVectorXYZ),
    shadowDirectionXZ: numberArray(source.shadowDirectionXZ, 2, DEFAULT_FIXED_SUN.shadowDirectionXZ),
  };
}

function centroid(ring) {
  return ring.reduce((sum, point) => [sum[0] + point[0] / ring.length, sum[1] + point[1] / ring.length], [0, 0]);
}

function addShadowDecal(group, materials, direction, { x, z, width, length, opacity, offset = 0 }) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 20), materials.bakedShadow(opacity));
  mesh.name = "baked-shadow-decal";
  mesh.rotation.set(-Math.PI / 2, Math.atan2(-direction[0], -direction[1]), 0);
  mesh.scale.set(Math.max(0.1, width) / 2, Math.max(0.1, length) / 2, 1);
  mesh.position.set(x + direction[0] * offset, 0.082, z + direction[1] * offset);
  mesh.renderOrder = 2;
  group.add(mesh);
}

export function addBakedLighting(scene, materials, layout) {
  return bakeGroundShadows(scene, layout, fixedSunForLayout(layout));
}

function legacyShadowDecals(scene, materials, layout) {
  const fixedSun = fixedSunForLayout(layout);
  const rawDirection = fixedSun.shadowDirectionXZ;
  const norm = Math.hypot(rawDirection[0], rawDirection[1]) || 1;
  const direction = [rawDirection[0] / norm, rawDirection[1] / norm];
  const group = new THREE.Group();
  group.name = "baked-lighting";

  for (const building of layout.buildings || []) {
    if (!building.footprint?.length) continue;
    const [x, z] = centroid(building.footprint);
    const xs = building.footprint.map((point) => point[0]);
    const zs = building.footprint.map((point) => point[1]);
    const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const length = Math.min(28, Math.max(7, (Number(building.heightM) || 12) * fixedSun.phantomLengthScale));
    addShadowDecal(group, materials, direction, {
      x,
      z,
      width: Math.min(13, Math.max(3.8, diagonal * 0.22)),
      length,
      offset: length * 0.37,
      opacity: building.id === layout.musicWall?.buildingId ? 0.17 : 0.105,
    });
  }

  for (const structure of layout.utilityStructures || []) {
    if (!structure.footprint?.length) continue;
    const [x, z] = centroid(structure.footprint);
    addShadowDecal(group, materials, direction, { x, z, width: 4.4, length: 5.8, offset: 1.7, opacity: 0.18 });
  }
  for (const circle of layout.circles || []) {
    addShadowDecal(group, materials, direction, {
      x: circle.x,
      z: circle.z,
      width: Math.max(1.5, circle.radius * 4.4),
      length: Math.max(3.5, circle.radius * 8.5),
      offset: 1.2,
      opacity: 0.12,
    });
  }
  for (const entry of layout.entrances || []) {
    const building = (layout.buildings || []).find((item) => item.id === entry.buildingId);
    if (!building?.footprint?.length) continue;
    const a = building.footprint[entry.edgeIndex];
    const b = building.footprint[(entry.edgeIndex + 1) % building.footprint.length];
    if (!a || !b) continue;
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const along = Math.max(0, Math.min(distance, Number(entry.alongM) || 0));
    addShadowDecal(group, materials, direction, {
      x: a[0] + (b[0] - a[0]) / distance * along,
      z: a[1] + (b[1] - a[1]) / distance * along,
      width: 2.7,
      length: 4.2,
      offset: 1.15,
      opacity: 0.14,
    });
  }
  scene.add(group);
  return fixedSun;
}
