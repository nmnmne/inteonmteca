// The pedestrian link joins the two published drives at the east end of House 14.
// Keep the camera on their surveyed centrelines and round the turns like a walker.
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const angleBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const smoothstep = t => t * t * (3 - 2 * t);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The integral of a smoothstep speed ramp. Both speed and acceleration
// reach zero at a stop, including on legs too short to reach cruising pace.
function walkingLeg(length, pace) {
  const acceleration = 0.34;
  const peak = Math.min(pace, Math.sqrt(length * acceleration / 1.5));
  if (!peak) return { duration: length ? Infinity : 0, distanceAt: () => 0 };
  const ramp = 1.5 * peak / acceleration;
  const duration = Math.max(2 * ramp, length / peak + ramp);
  const rampDistance = t => peak * ramp * t ** 3 * (1 - t / 2);
  return {
    duration,
    distanceAt(time) {
      if (time >= duration) return length;
      if (time < ramp) return rampDistance(time / ramp);
      if (time > duration - ramp) return length - rampDistance((duration - time) / ramp);
      return peak * (time - ramp / 2);
    },
  };
}

function nearestSegment(path, point) {
  let best;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz);
    const projection = mix(a, b, Math.max(0, Math.min(1, t)));
    const gap = distance(point, projection);
    if (!best || gap < best.gap) best = { next: i, point: projection, gap };
  }
  return best;
}

function roundedPath(vertices) {
  const samples = [vertices[0]];
  let length = 0;
  const lengths = [length];
  function add(point) {
    const segment = distance(samples.at(-1), point);
    if (segment < 0.0001) return;
    length += segment;
    samples.push(point);
    lengths.push(length);
  }
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = vertices[i - 1], b = vertices[i], c = vertices[i + 1];
    const incoming = distance(a, b), outgoing = distance(b, c);
    if (!incoming || !outgoing) continue;
    const radius = Math.min(3.5, incoming * 0.35, outgoing * 0.35);
    const entry = mix(b, a, radius / incoming), exit = mix(b, c, radius / outgoing);
    add(entry);
    for (let step = 1; step <= 32; step++) {
      const t = step / 32;
      add(mix(mix(entry, b, t), mix(b, exit, t), t));
    }
  }
  add(vertices.at(-1));
  return {
    length,
    closestMetre(point) {
      const nearest = nearestSegment(samples, point);
      return lengths[nearest.next - 1] + distance(samples[nearest.next - 1], nearest.point);
    },
    at(metres) {
      let low = 0, high = samples.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (lengths[middle] <= metres) low = middle;
        else high = middle;
      }
      return mix(samples[low], samples[high], (metres - lengths[low]) / (lengths[high] - lengths[low]));
    },
  };
}

// Frame both the signed wall and the wet footpath in the backdrop's first
// shot. The still photo and the live walker start at this same camera pose.
export function ambientOpeningView(layout) {
  const { x, z, yaw } = layout.spawn;
  const end = layout.roads.find(road => road.id === 'spawn-pedestrian-link').centerline.at(-1);
  const alongPath = Math.atan2(end[0] - x, z - end[1]);
  return { ...layout.spawn, yaw: yaw + 0.62 * angleBetween(yaw, alongPath), pitch: -0.085 };
}

export function createAutoWalk(layout, { random = Math.random, openingView = layout.spawn } = {}) {
  const road = id => layout.roads.find(item => item.id === id).centerline;
  const footpath = road('spawn-pedestrian-link');
  const inner = [...road('house14-courtyard-drive')].reverse();
  const outer = [...road('zhandova-courtyard-drive')].reverse();
  const spawn = [layout.spawn.x, layout.spawn.z];
  const junction = outer.findIndex(point => distance(point, inner[0]) < 0.1);
  const westTurn = nearestSegment(inner, outer[0]);
  // Start and end the lap halfway along a straight, so position AND heading meet.
  const seam = mix(inner[1], inner[2], 0.5);
  const approach = roundedPath([spawn, ...footpath.slice(nearestSegment(footpath, spawn).next), inner[1], seam]);
  const lap = roundedPath([
    seam, ...inner.slice(2, westTurn.next), westTurn.point,
    ...outer.slice(1, junction + 1), inner[1], seam,
  ]);
  // The walker visits actual features from the map. At each stop it selects
  // another destination and follows the nearer direction around the paved loop.
  const wall = mix(...layout.musicWall.segment, 0.5);
  const bars = layout.playground.bars;
  const entrances = layout.landscaping.paths.filter(path =>
    ['house-14-entrance-2', 'house-14-entrance-4', 'house-46-2-courtyard-entrance-1'].includes(path.entranceId));
  const sights = [
    { point: [bars.x, bars.z], pitch: 0.045 },
    ...entrances.map(entry => ({ point: entry.polygon[0], pitch: 0.09 })),
  ].map(sight => ({ ...sight, metre: lap.closestMetre(sight.point) }));

  const pace = clamp(layout.movement.speedMps, 0, 0.85);
  const pose = { ...openingView, eyeOffset: 0 };
  const recentlyVisited = [];
  let route = approach, metre = 0, goal = Math.min(8, approach.length / 2);
  let sight = { point: wall, pitch: 0.08 }, pauseRemaining = 4.5, direction = 1;
  let elapsed = 0, stride = 0, turnRate = 0, remainder = 0;
  let startMetre = 0, legTime = 0, leg = walkingLeg(goal, pace), orienting = false;
  const wrap = value => (value % lap.length + lap.length) % lap.length;
  const at = value => route.at(route === lap ? wrap(value) : Math.max(0, Math.min(route.length, value)));

  function chooseNextStop() {
    if (route === approach && goal !== approach.length) {
      goal = approach.length;
      sight = null;
      return;
    }
    if (route === approach) { route = lap; metre = 0; }
    const options = sights.filter(candidate => !recentlyVisited.includes(candidate));
    sight = options[Math.floor(random() * options.length)];
    recentlyVisited.push(sight);
    if (recentlyVisited.length > Math.min(2, sights.length - 1)) recentlyVisited.shift();
    const forward = wrap(sight.metre - metre);
    const offset = forward <= lap.length / 2 ? forward : forward - lap.length;
    direction = offset >= 0 ? 1 : -1;
    goal = metre + offset;
    pauseRemaining = 4 + random() * 3.5;
  }

  const step = 1 / 60;
  function advance() {
    elapsed += step;
    if (legTime === leg.duration && (!sight || pauseRemaining <= 0)) {
      chooseNextStop();
      startMetre = metre;
      leg = walkingLeg(Math.abs(goal - startMetre), pace);
      legTime = 0;
      orienting = true;
    }
    const previous = metre;
    if (!orienting) legTime = Math.min(leg.duration, legTime + step);
    metre = legTime === leg.duration ? goal : startMetre + direction * leg.distanceAt(legTime);
    const travel = Math.abs(metre - previous);
    const walking = pace > 0 ? clamp(travel / (step * pace), 0, 1) : 0;
    stride += travel * (Math.PI * 2 / 1.15);
    if (legTime === leg.duration) pauseRemaining -= step;
    const [x, z] = at(metre);
    const behind = at(metre - direction * 1.5), ahead = at(metre + direction * 2.5);
    let heading = Math.atan2(ahead[0] - behind[0], behind[1] - ahead[1]);
    let pitch = 0.022;
    if (sight) {
      const attention = smoothstep(clamp(1 - Math.abs(goal - metre) / 8, 0, 1));
      const facing = Math.atan2(sight.point[0] - x, z - sight.point[1]);
      heading += attention * angleBetween(heading, facing);
      pitch += attention * sight.pitch;
    }
    heading += Math.sin(elapsed * 0.32) * (0.06 - walking * 0.04);
    pose.x = x;
    pose.z = z;
    // Let the gaze lead the first step of a reversal. A damped turn keeps
    // the angular velocity continuous when a new point of interest is chosen.
    const turn = angleBetween(pose.yaw, heading);
    const angularAcceleration = clamp(1.2 * turn - 2.3 * turnRate, -0.19, 0.19);
    turnRate = clamp(turnRate + angularAcceleration * step, -0.32, 0.32);
    pose.yaw += turnRate * step;
    if (Math.abs(turn) < 0.58) orienting = false;
    pose.pitch += clamp((pitch - pose.pitch) * 0.7, -0.035, 0.035) * step;
    pose.eyeOffset = 0.004 * Math.sin(stride) * walking;
  }
  function update(dt) {
    if (Number.isFinite(dt) && dt > 0) remainder += dt;
    while (remainder >= step - 1e-10) {
      remainder -= step;
      advance();
    }
    return pose;
  }
  return { pose, update };
}
