// Intersect parallel offsets of the two incident edges at every corner.
// A positive offset is to the left of the ring, as in the rendered facade planes.
export function wallCorners(footprint, leftOffset = .02) {
  const ring = footprint.filter(([x,z], i) => {
    const next = footprint[(i+1)%footprint.length];
    return x !== next[0] || z !== next[1];
  });
  if (ring.length < 3) return [];
  const normals = ring.map(([x,z], i) => {
    const [nextX,nextZ] = ring[(i+1)%ring.length];
    const dx = nextX-x, dz = nextZ-z, length = Math.hypot(dx,dz);
    return [-dz/length, dx/length];
  });
  return ring.map(([x,z], i) => {
    const a = normals[(i+ring.length-1)%ring.length], b = normals[i];
    const joint = 1+a[0]*b[0]+a[1]*b[1];
    if (joint < .000001) return [x+leftOffset*b[0], z+leftOffset*b[1]];
    const miter = leftOffset/joint;
    return [x+(a[0]+b[0])*miter, z+(a[1]+b[1])*miter];
  });
}

/** Winding, unlike a vertex centroid, works for concave building outlines. */
export function facadeNormal(a, b, footprint) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  const area = footprint.reduce((sum, p, i) => {
    const q = footprint[(i + 1) % footprint.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const sign = area >= 0 ? 1 : -1;
  return [sign * dz / length, -sign * dx / length];
}
