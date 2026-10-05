import { pointInRing, distanceToSegment } from "./navigation.js";

/** Touch/exit the real ring, not the grid's 34m inside fade zone. */
export function createBoundaryMusic(ring, start, onExit) {
  const strictlyInside = (x, z) => pointInRing(x, z, ring) && !ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length];
    return distanceToSegment(x, z, a[0], a[1], b[0], b[1]) <= 1e-7;
  });
  let inside = strictlyInside(start.x, start.z);
  return (x, z) => {
    const next = strictlyInside(x, z);
    const exited = inside && !next;
    inside = next; // Latch before invoking playback, including denied attempts.
    if (exited) onExit();
  };
}
