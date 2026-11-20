import * as THREE from './vendor/three.module.js';
import {pointInRing, distanceToSegment} from './navigation.js';
import {gableProfile, roofDeckY} from './roof-geometry.js';

// The precipitation pool follows the camera. Sample a static roof height at
// each particle's world X/Z so the same shower lands on roofs and in the street.
export function precipitationRoofs(layout) {
  const roofs = [...(layout.buildings || []), ...(layout.utilityStructures || []).filter(s => s.role === 'electric-kiosk')]
    .filter(b => b.footprint?.length >= 3).map(building => {
      const ring = building.footprint, xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
      return {ring, y:roofDeckY(building), gable:gableProfile(building),
        west:Math.min(...xs), east:Math.max(...xs), north:Math.min(...zs), south:Math.max(...zs)};
    }).filter(roof => Number.isFinite(roof.y) && roof.y >= 0);
  const west = Math.floor(Math.min(0, ...roofs.map(r => r.west))) - 1;
  const north = Math.floor(Math.min(0, ...roofs.map(r => r.north))) - 1;
  const spanX = Math.ceil(Math.max(0, ...roofs.map(r => r.east))) + 1 - west;
  const spanZ = Math.ceil(Math.max(0, ...roofs.map(r => r.south))) + 1 - north;
  const density = Math.min(2, 640 / Math.max(spanX, spanZ));
  const width = Math.ceil(spanX * density), height = Math.ceil(spanZ * density);
  const stepX = spanX / width, stepZ = spanZ / height;
  const scale = Math.max(1, ...roofs.map(r => r.gable?.ridgeY ?? r.y));
  const pixels = new Uint8Array(width * height);
  for (const roof of roofs) {
    for (let j = Math.floor((roof.north - north) / stepZ); j < (roof.south - north) / stepZ; j++) {
      const z = north + (j + .5) * stepZ;
      for (let i = Math.floor((roof.west - west) / stepX); i < (roof.east - west) / stepX; i++) {
        const x = west + (i + .5) * stepX;
        if (!pointInRing(x, z, roof.ring)) continue;
        let y = roof.y;
        if (roof.gable) {
          const {left, right, eaveY, ridgeY} = roof.gable;
          const a = distanceToSegment(x,z,...left[0],...left[1]);
          const b = distanceToSegment(x,z,...right[0],...right[1]);
          y = eaveY + (ridgeY - eaveY) * 2 * Math.min(a,b) / Math.max(.001,a+b);
        }
        const index = j * width + i;
        pixels[index] = Math.max(pixels[index], Math.round(255 * y / scale));
      }
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return {texture, scale, bounds:new THREE.Vector4(west,north,1/spanX,1/spanZ)};
}
