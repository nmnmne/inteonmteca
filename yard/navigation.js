/** Flat courtyard collision. X/Z meters, Y is unused here. */

export function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const cross = (zi > z) !== (zj > z);
    if (cross && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function ringClearance(x, z, radius, ring) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (distanceToSegment(x, z, ring[j][0], ring[j][1], ring[i][0], ring[i][1]) < radius) return false;
  }
  return true;
}

function solidBlocks(layout, x, z, radius) {
  for (const building of layout.buildings || []) {
    if (building.visualOnly) continue;
    const ring = building.footprint;
    if (!ring?.length) continue;
    if (pointInRing(x, z, ring) || !ringClearance(x, z, radius, ring)) return true;
  }
  for (const obstacle of layout.obstacles || []) {
    const ring = obstacle.footprint;
    if (!ring?.length) continue;
    if (pointInRing(x, z, ring) || !ringClearance(x, z, radius, ring)) return true;
  }
  for (const structure of layout.utilityStructures || []) {
    const ring = structure.footprint;
    if (!ring?.length) continue;
    if (pointInRing(x, z, ring) || !ringClearance(x, z, radius, ring)) return true;
  }
  for (const circle of layout.circles || []) {
    if (Math.hypot(x - circle.x, z - circle.z) < radius + circle.radius) return true;
  }
  return false;
}

export function isWalkable(layout, x, z, radius) {
  const ring = layout.walkable;
  if (!ring?.length) return false;
  if (!pointInRing(x, z, ring)) return false;
  if (!ringClearance(x, z, radius, ring)) return false;
  if (solidBlocks(layout, x, z, radius)) return false;
  return true;
}

export function moveCircle(layout, x, z, dx, dz, radius, maxStep = 0.2) {
  const dist = Math.hypot(dx, dz);
  if (dist === 0) return { x, z };
  const step = maxStep > 0 ? maxStep : 0.2;
  const count = Math.ceil(dist / step);
  const sx = dx / count;
  const sz = dz / count;
  let cx = x;
  let cz = z;
  for (let i = 0; i < count; i += 1) {
    const nx = cx + sx;
    const nz = cz + sz;
    if (isWalkable(layout, nx, nz, radius)) {
      cx = nx;
      cz = nz;
      continue;
    }
    const xOk = isWalkable(layout, nx, cz, radius);
    const zOk = isWalkable(layout, cx, nz, radius);
    if (xOk && !zOk) cx = nx;
    else if (zOk && !xOk) cz = nz;
    else break;
  }
  return { x: cx, z: cz };
}

export function distanceToWall(x, z, segment) {
  return distanceToSegment(x, z, segment[0][0], segment[0][1], segment[1][0], segment[1][1]);
}
