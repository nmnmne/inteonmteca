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
