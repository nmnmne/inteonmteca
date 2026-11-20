import { pointInRing } from './navigation.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const bearing = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
const ground = .20;

// The two neighbouring families keep their own feeding grounds. Their members
// are permanent birds and use exactly the same flight and landing as the home flock.
export function createCrowDisputes(layout, home, groundNear, clearGround, relative) {
  const leader = home[0], guests = [], families = [], targets = new Map();
  const state = {phase:'idle', count:0, actors:[], elders:[], x:0, z:0};
  let seed = ((home[1].gaitPhase + home[2].wingPhase) * 1e7) >>> 0;
  function draw() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const inside = (x, z) => pointInRing(x, z, layout.walkable);
  function patch(point) {
    return groundNear(point.x, point.z, inside);
  }
  function memberSpot(family, index) {
    const point = relative(family.center, family.yaw, (index - 1) * 1.45 + draw() * .6, draw() * 2 - 1);
    return patch(point) || family.center;
  }
  for (const side of [-1, 1]) {
    const center = patch(relative(leader, leader.yaw, side * (6 + draw() * 2), 10 + draw() * 3)) || leader;
    const family = {side, center, yaw:leader.yaw + side * .7, moveAt:8 + draw() * 6, members:[]};
    for (let i = 0; i < 3; i++) {
      const id = home.length + guests.length, spot = memberSpot(family, i);
      const flying = i === 2;
      const bird = {id, flockId:families.length + 1, x:spot.x, z:spot.z, y:flying ? 2.5 : ground,
        yaw:family.yaw + draw() - .5, vx:0, vz:0, vy:0, bank:0, speed:0, cruise:3.4,
        mode:flying ? 'land' : 'perch', airborne:Number(flying), wingPhase:draw() * Math.PI * 2,
        gaitPhase:draw() * Math.PI * 2, roamX:spot.x, roamZ:spot.z, quietUntil:0};
      guests.push(bird);
      family.members.push(bird);
    }
    families.push(family);
  }
  let nextAt = 1.8 + draw() * 1.5, began = 0, heading = leader.yaw, lastSite;
  let actors = [], elders = [];
  function relocate(family, center, time) {
    family.yaw = bearing(family.center, center);
    family.center = center;
    family.moveAt = time + 7 + draw() * 9;
    family.members.forEach((bird, index) => {
      const spot = memberSpot(family, index);
      bird.roamX = spot.x;
      bird.roamZ = spot.z;
    });
  }
  function forage(time) {
    for (const family of families) {
      if (time < family.moveAt) continue;
      family.moveAt = time + 5;
      const catchUp = inside(leader.x, leader.z) && distance(leader, family.center) > 27;
      const near = catchUp ? relative(leader, leader.yaw, family.side * (7 + draw() * 7), 8 + draw() * 10)
        : relative(family.center, draw() * 2 * Math.PI, 0, 2.5 + draw() * 5);
      const spot = patch(near);
      if (spot) relocate(family, spot, time);
    }
  }
  function clearPath(from, to) {
    const steps = Math.ceil(distance(from, to) / .4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!clearGround(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
    }
    return true;
  }
  function start(time) {
    if (leader.mode !== 'walk' || !inside(leader.x, leader.z)) return;
    heading = leader.yaw;
    const side = draw() < .5 ? -1 : 1;
    for (const forward of [6.6, 9, 4.7, 12]) for (const offset of [side * .65, -side * 1.5, 0]) {
      const site = relative(leader, heading, offset, forward);
      const points = [-1,1].map(sign => relative(site, heading, sign * .78, sign * .18));
      if (!inside(site.x, site.z) || (lastSite && distance(lastSite, site) < 4)
          || !clearPath(leader, site) || !clearPath(points[0], points[1]) || !clearGround(points[0].x, points[0].z)) continue;
      const visiting = families.map((family, i) => family.members.filter(b => time >= b.quietUntil)
        .sort((a, b) => distance(a, points[i]) - distance(b, points[i]))[0]);
      if (visiting.some(b => !b || distance(b, site) > 35)) continue;
      // The camera stays with the home flock. Its free senior neighbours
      // physically fly to the noise. The nearest available adult can back one up.
      const available = home.slice(1).filter(b => !b.called && time >= b.breakUntil && !b.prankPose
          && distance(b, site) > 2.8 && distance(b, site) < 34)
        .sort((a, b) => Number(b.senior) - Number(a.senior) || distance(a, site) - distance(b, site));
      if (!available[0]?.senior) continue;
      actors = visiting;
      elders = available.slice(0, 2);
      Object.assign(state, {phase:'approach', x:site.x, z:site.z, actors:actors.map(b => b.id), elders:elders.map(b => b.id)});
      actors.forEach((b, i) => targets.set(b.id, {...points[i], y:ground}));
      began = time;
      return;
    }
  }
  function finish(time, completed) {
    for (const bird of [...actors, ...elders]) bird.encounterPose = null;
    targets.clear();
    if (completed) {
      state.count++;
      lastSite = {x:state.x, z:state.z};
    }
    state.phase = 'idle';
    state.actors = []; state.elders = [];
    actors = []; elders = [];
    nextAt = time + (completed ? 22 + draw() * 21 : 3 + draw() * 3);
  }
  function face(bird, other, dt) {
    const delta = bearing(bird, other) - bird.yaw;
    bird.yaw += Math.atan2(Math.sin(delta), Math.cos(delta)) * Math.min(1, dt * 5);
  }
  function disperse(time) {
    state.phase = 'scatter';
    began = time;
    actors.forEach((bird, i) => {
      const family = families[i];
      // They give up the contested patch in opposite directions. Each family
      // moves with its bird, while the two individuals keep their own cooldown.
      const exit = patch(relative(state, heading, family.side * (6 + draw() * 3), 2 + draw() * 3))
        || {x:bird.roamX, z:bird.roamZ};
      relocate(family, exit, time);
      targets.set(bird.id, {...exit, y:ground});
      bird.quietUntil = time + 57 + draw() * 29;
      bird.encounterPose = null;
    });
    elders.forEach((bird, i) => {
      const slot = targets.get(bird.id);
      slot.y = ground;
      bird.encounterPose = {posture:.85, glance:i ? .24 : -.24};
    });
  }
  function update(dt, time, sceneBusy) {
    forage(time);
    if (state.phase === 'idle') {
      if (!sceneBusy && time >= nextAt) {
        nextAt = time + 1.2;
        start(time);
      }
      return;
    }
    const age = time - began;
    if (state.phase === 'approach') {
      if (actors.every(b => b.y < .42 && distance(b, targets.get(b.id)) < .52)) {
        state.phase = 'challenge';
        began = time;
        actors.forEach(b => { b.encounterPose = {posture:.94, tail:.5, wings:0, dip:0}; });
      } else if (age > 10) finish(time, false);
    } else if (state.phase === 'challenge' || state.phase === 'intervention') {
      actors.forEach((bird, i) => {
        face(bird, actors[1 - i], dt);
        // Alternating forward threats with closed beaks, low shoulders and a
        // short lift of the folded wings. The opponent stands its ground.
        const threat = Math.max(0, Math.sin(age * 2.8 + i * Math.PI)) ** 3;
        bird.encounterPose.dip = .38 * threat;
        bird.encounterPose.wings = .08 + .38 * threat;
      });
      if (state.phase === 'challenge' && age > 2.2) {
        state.phase = 'intervention';
        began = time;
        elders.forEach((b, i) => {
          const point = relative(state, heading, 0, i ? 1.45 : 0);
          const spot = patch(point) || state;
          targets.set(b.id, {x:spot.x, y:i ? 1.55 : 1.15, z:spot.z});
        });
      } else if (state.phase === 'intervention') {
        const senior = elders[0];
        if (distance(senior, targets.get(senior.id)) < 1.25 && senior.y > .68 && senior.y < 2.1) disperse(time);
        else if (age > 9) finish(time, false);
      }
    } else if (age > 4.6) finish(time, true);
  }
  return {guests, state, targets, update, reserved:bird => elders.includes(bird)};
}
