const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const angleBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The still photograph and the live backdrop open on the same view.
export function ambientOpeningView(layout) {
  const { x, z, yaw } = layout.spawn;
  const end = layout.roads.find(road => road.id === 'spawn-pedestrian-link').centerline.at(-1);
  const alongPath = Math.atan2(end[0] - x, z - end[1]);
  return { ...layout.spawn, yaw: yaw + 0.62 * angleBetween(yaw, alongPath), pitch: -0.085 };
}

// Even the L-shaped block and the tower have an interior point on this scanline.
function interiorPoint(ring) {
  const zs = ring.map(p => p[1]);
  const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const xs = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]));
  }
  xs.sort((a, b) => a - b);
  let widest = 0;
  for (let i = 2; i < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > xs[widest + 1] - xs[widest]) widest = i;
  }
  return [(xs[widest] + xs[widest + 1]) / 2, z];
}

// Continue straight past the first wall after the target. Only round the turn
// once the camera has cleared the facade; concave blocks can have several exits.
function beyondWall(from, target, ring) {
  const length = distance(from, target);
  const dx = length ? (target[0] - from[0]) / length : 1;
  const dz = length ? (target[1] - from[1]) / length : 0;
  let exit = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const det = dx * ez - dz * ex;
    if (Math.abs(det) < 1e-8) continue;
    const ax = a[0] - target[0], az = a[1] - target[1];
    const along = (ax * ez - az * ex) / det;
    const edge = (ax * dz - az * dx) / det;
    if (along > 0.001 && edge >= 0 && edge <= 1) exit = Math.min(exit, along);
  }
  const clearance = (Number.isFinite(exit) ? exit : 0) + 12;
  return [target[0] + dx * clearance, target[1] + dz * clearance];
}

function* destinations(layout, random) {
  const xs = layout.walkable.map(p => p[0]), zs = layout.walkable.map(p => p[1]);
  const west = Math.min(...xs), east = Math.max(...xs), north = Math.min(...zs), south = Math.max(...zs);
  const outside = (layout.virtualBoundary?.fullOutsideM ?? 52) + 16;
  const range = (min, max) => min + (max - min) * random();
  const outsideWest = () => [west - outside, range(north, south)];
  const houses = layout.buildings.map(b => ({ id: b.id, ring: b.footprint, point: interiorPoint(b.footprint) }));
  const wall = mix(...layout.musicWall.segment, 0.5);
  let from = beyondWall([layout.spawn.x, layout.spawn.z], wall,
    houses.find(b => b.id === layout.musicWall.buildingId).ring);
  yield wall;
  yield from;
  // Put a full outside-and-back crossing within the opening stretch.
  from = [west - outside, clamp(from[1] + range(-20, 20), north, south)];
  yield from;

  let firstTour = true;
  while (true) {
    const stops = houses.filter(house => !firstTour || house.id !== layout.musicWall.buildingId);
    for (let column = 0; column < 3; column++) {
      for (let row = 0; row < 3; row++) {
        stops.push({ point: [
          west + (column + range(0.08, 0.92)) * (east - west) / 3,
          north + (row + range(0.08, 0.92)) * (south - north) / 3,
        ] });
      }
    }
    stops.push({ point: [east + outside, range(north, south)] },
      { point: [range(west, east), north - outside] }, { point: [range(west, east), south + outside] });
    if (!firstTour) stops.push({ point: outsideWest() });
    firstTour = false;
    while (stops.length) {
      // Sweep nearby destinations first. Every building, map sector and side of
      // the perimeter gets visited before a fresh set of open-ground targets.
      let nearest = 0;
      for (let i = 1; i < stops.length; i++) {
        if (distance(from, stops[i].point) < distance(from, stops[nearest].point)) nearest = i;
      }
      const [stop] = stops.splice(nearest, 1);
      const end = stop.ring ? beyondWall(from, stop.point, stop.ring) : stop.point;
      if (stop.ring && distance(from, stop.point) > 0.01) yield stop.point;
      if (distance(from, end) > 0.01) yield end;
      from = end;
    }
  }
}

// Arc-length samples of a straight, a rounded corner, and the next straight.
// Neighbouring sections join halfway along the same line, with matching headings.
function section(start, corner, end) {
  const incoming = distance(start, corner), outgoing = distance(corner, end);
  const radius = Math.min(8, incoming * 0.65, outgoing * 0.65);
  const entry = mix(corner, start, radius / incoming), exit = mix(corner, end, radius / outgoing);
  const points = [start, entry];
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    points.push(mix(mix(entry, corner, t), mix(corner, exit, t), t));
  }
  points.push(end);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  return {
    length: lengths.at(-1),
    at(metres) {
      if (metres <= 0) return start;
      if (metres >= this.length) return end;
      let lo = 0, hi = points.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lengths[mid] <= metres) lo = mid; else hi = mid;
      }
      return mix(points[lo], points[hi], (metres - lengths[lo]) / (lengths[hi] - lengths[lo]));
    },
  };
}

export function createAutoWalk(layout, { random = Math.random, openingView = layout.spawn } = {}) {
  const itinerary = destinations(layout, random);
  let start = [layout.spawn.x, layout.spawn.z];
  let corner = itinerary.next().value, next = itinerary.next().value;
  let end = mix(corner, next, 0.5), path = section(start, corner, end);
  const pose = { ...openingView, eyeOffset: 0 };
  const pace = layout.movement.speedMps;
  const step = 1 / 60;
  let metres = 0, elapsed = 0, travelled = 0, turnRate = 0, remainder = 0;
  function advance() {
    elapsed += step;
    const speed = Math.min(pace, elapsed * 0.9);
    metres += speed * step;
    travelled += speed * step;
    while (metres >= path.length) {
      metres -= path.length;
      start = end;
      corner = next;
      next = itinerary.next().value;
      end = mix(corner, next, 0.5);
      path = section(start, corner, end);
    }
    const [x, z] = path.at(metres);
    const ahead = path.at(metres + 3), behind = path.at(metres - 1);
    const heading = Math.atan2(ahead[0] - behind[0], behind[1] - ahead[1]);
    const turn = angleBetween(pose.yaw, heading);
    const acceleration = clamp(1.5 * turn - 2.3 * turnRate, -0.34, 0.34);
    turnRate = clamp(turnRate + acceleration * step, -0.55, 0.55);
    pose.x = x;
    pose.z = z;
    pose.yaw += turnRate * step;
    const targetPitch = 0.018 + 0.014 * Math.sin(elapsed * 0.12);
    pose.pitch += clamp((targetPitch - pose.pitch) * 0.7, -0.035, 0.035) * step;
    pose.eyeOffset = 0.004 * Math.sin(travelled * Math.PI * 2 / 1.6) * Math.min(1, speed);
  }
  return { pose, update(dt) {
    if (Number.isFinite(dt) && dt > 0) remainder += dt;
    while (remainder >= step - 1e-10) {
      remainder -= step;
      advance();
    }
    return pose;
  } };
}
