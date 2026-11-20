import { isWalkable, pointInRing } from './navigation.js';

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const angleBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const ease = t => t * t * (3 - 2 * t);
const groundEyeM = 0.42;

// The still photograph and the live backdrop open on the same view.
export function ambientOpeningView(layout, aspect = 1.6) {
  const { x, z } = layout.spawn;
  const wall = mix(...layout.musicWall.segment, 0.5);
  const atWall = Math.atan2(wall[0] - x, z - wall[1]);
  const end = layout.roads.find(road => road.id === 'spawn-pedestrian-link').centerline.at(-1);
  const alongPath = Math.atan2(end[0] - x, z - end[1]);
  const wide = ease(clamp((aspect - 0.55) / 0.90, 0, 1));
  // Keep the wordmark in front of the crow. Wide views leave the lane on
  // its left; a portrait lens opens a little wider for the same two subjects.
  const yaw = atWall + (0.045 + 0.145 * wide) * angleBetween(atWall, alongPath);
  return { ...layout.spawn, yaw, pitch: -0.085, fov: 80 - 16 * wide, aspect };
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
  const headingIn = Math.atan2(corner[0] - start[0], start[1] - corner[1]);
  const headingOut = Math.atan2(end[0] - corner[0], corner[1] - end[1]);
  const bend = (1 - Math.cos(headingOut - headingIn)) / 2;
  const brakingDistance = Math.min(8, incoming * 0.3, outgoing * 0.3);
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    points.push(mix(mix(entry, corner, t), mix(corner, exit, t), t));
  }
  points.push(end);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  return {
    length: lengths.at(-1),
    flightPace(metres) {
      // Bleed speed before a tight turn. A quadratic near a U-turn can have
      // a much smaller turning radius than its tangent points suggest.
      const away = Math.max(lengths[1] - metres, metres - lengths.at(-2), 0);
      return 1 - 0.71 * bend * (1 - ease(clamp(away / brakingDistance, 0, 1)));
    },
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

export function createAutoWalk(layout, { random = Math.random, openingView = layout.spawn, flock } = {}) {
  const itinerary = destinations(layout, random);
  let start = [layout.spawn.x, layout.spawn.z];
  let corner = itinerary.next().value, next = itinerary.next().value;
  let end = mix(corner, next, 0.5), path = section(start, corner, end);
  // The opening photograph catches the bird on approach. The ground-level
  // steps and flight use the same route and a continuous first-person camera.
  const openingFov = openingView.fov ?? 64;
  const pose = { ...openingView, y: layout.movement.eyeM, roll: 0, eyeOffset: 0, fov: openingFov, mode: 'land' };
  const step = 1 / 60;
  let metres = 0, elapsed = 0, stride = 0, turnRate = 0, remainder = 0;
  let phaseTime = 0, duration = 1.45, glides = 0, touchdowns = 0;
  let height = pose.y, fromHeight = height, toHeight = groundEyeM;
  let speed = 1.9, fromSpeed = speed, toSpeed = 1.04, airspeed = 0;
  let glanceSide = 1, gatheringPace = 1;
  const range = (a, b) => a + (b - a) * random();

  function changePhase(mode, seconds, targetHeight, targetSpeed) {
    pose.mode = mode;
    phaseTime = 0;
    duration = seconds;
    fromHeight = height;
    toHeight = targetHeight;
    fromSpeed = speed;
    toSpeed = targetSpeed;
  }

  // Reserve an obstacle-free approach and rollout. Every second touchdown can
  // use any clear ground along the next twenty metres of the same flight path.
  function landingDuration() {
    const descent = Math.max(3.2, height / 3.2);
    const meanSpeed = (speed + 1) / 2;
    const minimum = descent * meanSpeed + 5;
    const alternate = touchdowns % 2 === 1;
    const limit = Math.min(path.length - metres, minimum + (alternate ? 20 : 0));
    if (limit < minimum) return 0;
    let clear = 0;
    for (let offset = 0; ; offset = Math.min(limit, offset + 1.5)) {
      const [x, z] = path.at(metres + offset);
      if (!isWalkable(layout, x, z, 1) || (alternate && !pointInRing(x, z, layout.walkable))) break;
      clear = offset;
      if (offset === limit) break;
    }
    if (clear < minimum) return 0;
    return alternate ? descent + random() * (clear - minimum) / meanSpeed : descent;
  }

  function nextPhase() {
    switch (pose.mode) {
      case 'land':
        touchdowns++;
        glanceSide = random() < 0.5 ? -1 : 1;
        changePhase('walk', touchdowns === 1 ? 4.8 : range(5, 10), groundEyeM, range(0.95, 1.25));
        break;
      case 'walk': {
        glides = 0;
        const cruiseHeight = range(9, 21);
        airspeed = range(6.8, 8.5);
        changePhase('takeoff', 2.5 + cruiseHeight / 4, cruiseHeight, airspeed);
        break;
      }
      case 'takeoff':
      case 'glide':
        changePhase('flap', range(2.4, 3.6), Math.min(25, height + range(1.2, 2.5)), airspeed);
        break;
      case 'flap': {
        const descent = glides >= 2 ? landingDuration() : 0;
        if (descent) {
          changePhase('land', descent, groundEyeM, 1);
        } else {
          glides++;
          changePhase('glide', range(4, 6.5), Math.max(5.5, height - range(2, 4)), airspeed * 0.9);
        }
        break;
      }
    }
  }

  function advance() {
    elapsed += step;
    const waiting = flock && pose.mode === 'walk' && !flock.canTakeOff();
    if (phaseTime >= duration && !waiting) nextPhase();
    phaseTime = Math.min(duration, phaseTime + step);
    const progress = phaseTime / duration, blend = ease(progress);
    const mode = pose.mode;
    height = fromHeight + (toHeight - fromHeight) * blend;
    speed = fromSpeed + (toSpeed - fromSpeed) * blend;
    const airborne = ease(clamp((height - groundEyeM) / 2, 0, 1));
    // Ease the pace while the crow turns its head to inspect the ground.
    const glance = mode === 'walk' ? Math.sin(Math.PI * progress) ** 6 : 0;
    const paceFactor = path.flightPace(metres);
    // Walk up to the rendezvous, then brake while the last recruits approach.
    // Release the same acceleration envelope when the group takes flight.
    const pace = waiting ? 1 - ease(clamp((progress - .6) / .4, 0, 1)) : 1;
    gatheringPace += clamp(pace - gatheringPace, -step * 1.25, step * .95);
    const groundSpeed = gatheringPace * speed * (1 - 0.65 * glance) * (1 - airborne * (1 - paceFactor));
    const advanceM = groundSpeed * step;
    metres += advanceM;
    stride += advanceM * Math.PI * 2 / 0.43;
    while (metres >= path.length) {
      metres -= path.length;
      start = end;
      corner = next;
      next = itinerary.next().value;
      end = mix(corner, next, 0.5);
      path = section(start, corner, end);
    }
    const [x, z] = path.at(metres);
    const ahead = path.at(metres + 1.8 + 4 * airborne), behind = path.at(metres - 0.6);
    let heading = Math.atan2(ahead[0] - behind[0], behind[1] - ahead[1]) + glanceSide * 0.3 * glance;
    const call = waiting && flock.rollCall?.targetId != null ? flock.rollCall : null;
    if (call) {
      heading = call.yaw;
    } else if (waiting && Number.isFinite(flock.state.searchYaw)) {
      heading += clamp(angleBetween(heading, flock.state.searchYaw), -1.15, 1.15) * ease(progress);
    }
    const turn = angleBetween(pose.yaw, heading);
    const acceleration = call ? clamp(12 * turn - 7 * turnRate, -3.6, 3.6)
      : clamp(2.6 * turn - 2.8 * turnRate, -0.78, 0.78);
    const turnLimit = call ? 1.62 : .87;
    turnRate = clamp(turnRate + acceleration * step, -turnLimit, turnLimit);
    pose.x = x;
    pose.z = z;
    pose.yaw += turnRate * step;
    const climbRate = (toHeight - fromHeight) * 6 * progress * (1 - progress) / duration;
    const targetPitch = call ? call.pitch : 0.04 - 0.22 * airborne - 0.16 * glance + 0.19 * Math.atan2(climbRate, speed);
    pose.pitch += call ? clamp((targetPitch - pose.pitch) * 12, -.85, .85) * step
      : clamp((targetPitch - pose.pitch) * 2, -.24, .24) * step;
    // A coordinated bank leads into the corner, while the eyes keep the
    // horizon steadier than the wings. Wing strokes disappear into a glide.
    const bank = airborne * clamp(-0.6 * Math.atan(groundSpeed * turnRate / 9.81), -0.3, 0.3);
    pose.roll += ((call ? call.tilt : bank) - pose.roll) * (call ? 10 : 2.2) * step;
    const stroke = mode === 'flap' || mode === 'takeoff'
      ? Math.sin(Math.PI * progress) ** 2 * Math.sin(2 * Math.PI * 3.1 * elapsed) : 0;
    pose.eyeOffset = 0.017 * (1 - airborne) * Math.sin(stride) + 0.027 * airborne * stroke;
    pose.y = height + pose.eyeOffset;
    pose.fov = openingFov + (64 - openingFov) * ease(clamp((elapsed - 2) / 5, 0, 1));
    flock?.update(step, pose);
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
