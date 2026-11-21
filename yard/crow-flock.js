import { isWalkable, pointInRing } from './navigation.js';
import { createCrowVisits } from './crow-visits.js';
import { createCrowPranks } from './crow-pranks.js';
import { createCrowFlightPlay } from './crow-flight-play.js';
import { createCrowKeyStory } from './crow-key-story.js';
import { createCrowDisputes } from './crow-disputes.js';
import { createCrowRollCall } from './crow-roll-call.js';
import { createCrowTreePrank } from './crow-tree-prank.js';
import { createCrowBeaconExchange } from './crow-beacon-exchange.js';
import { crowPersonality } from './crow-personalities.js';

const count = 13;
const chest = 0.20;
const turn = Math.PI * 2;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const bearing = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

// One social simulation for the first-person bird and its twelve neighbours.
// The ordinary birds persist when they split off. No bird is spawned at a reunion.
export function createCrowFlock(layout, openingView, { random = Math.random, residentVisits = false, allowKeyStory, storyDeck, crowTrees, allowBeacons = () => true, cameraGreeting } = {}) {
  const range = (a, b) => a + (b - a) * random();
  const integer = (a, b) => Math.min(b, Math.floor(range(a, b + 1)));
  const birds = [];
  const state = {phase: 'landing', targetSize: 1, partySize: 1, seniorCount: 1,
    landingCount: 0, missionCount: 0, searchYaw: null};
  let time = 0, callAt = 0, readySince = 0, splitAt = Infinity;
  let heading = openingView.yaw, slotsX = Infinity, slotsZ = Infinity, slotsYaw = heading;
  const landings = new Map();
  function clearGround(x, z) {
    // A sample's clearance covers its whole half-metre cell and the folded bird.
    const ix = Math.floor(x * 2), iz = Math.floor(z * 2), key = ix * 65536 + iz;
    if (!landings.has(key)) {
      if (landings.size >= 4096) landings.clear();
      landings.set(key, isWalkable(layout, ix * .5 + .25, iz * .5 + .25, .59));
    }
    return landings.get(key);
  }
  function relative(origin, yaw, side, forward) {
    return {x: origin.x + forward * Math.sin(yaw) + side * Math.cos(yaw),
      z: origin.z - forward * Math.cos(yaw) + side * Math.sin(yaw)};
  }
  function groundNear(x, z, allowed) {
    // Spiral around the requested spot to find a gap in the actual furniture.
    for (let i = 0; i < 96; i++) {
      const radius = .9 * Math.sqrt(i), a = i * 2.39996;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      if (clearGround(px, pz) && (!allowed || allowed(px, pz))) return {x: px, z: pz};
    }
    return null;
  }

  const leader = {id: 0, ...openingView, y: openingView.y ?? layout.movement.eyeM,
    mode: 'land', bank: 0, inParty: true, senior: true, airborne: 0, speed: 0, wingPhase: 0, gaitPhase: 0};
  birds.push(leader);
  for (let id = 1; id < count; id++) {
    const angle = id * 2.39996 + range(-.12, .12);
    const radius = 7 + id * .84 + range(-.7, .7);
    const slot = relative(leader, heading, id === 1 ? -.85 : id === 2 ? 1.15 : radius * Math.cos(angle),
      id === 1 ? 4.6 : id === 2 ? 6.7 : 7 + radius * Math.sin(angle));
    const airborne = id === 2 || id % 4 === 0;
    const perch = groundNear(slot.x, slot.z) || {x: leader.x, z: leader.z};
    const x = airborne ? slot.x : perch.x, z = airborne ? slot.z : perch.z;
    const y = airborne ? (id === 2 ? range(2.65, 3.15) : range(1.65, 2.9)) : chest;
    const yaw = heading + (id === 1 ? range(1.17, 1.45) : id === 2 ? range(-1.2, -.78) : range(-.9, .9));
    const approach = relative(slot, yaw, 0, 4.8);
    const destination = airborne ? (groundNear(approach.x, approach.z) || perch) : perch;
    birds.push({id, x, y, z, yaw, bank: 0,
      mode: airborne ? 'glide' : 'perch', airborne: Number(airborne), speed: 0,
      wingPhase: range(0, turn), gaitPhase: range(0, turn), senior: false, elder: 0,
      inParty: false, called: false, slot: -1, vx: airborne ? Math.sin(yaw) * 2.6 : 0,
      vz: airborne ? -Math.cos(yaw) * 2.6 : 0, vy: 0,
      roamX: destination.x, roamZ: destination.z, roamAt: range(2.8, 6), cruise: 0,
      launchAt: 0, breakUntil: 0, breakHeight: 0,
      slotX: perch.x, slotZ: perch.z, formationSide: 0, formationForward: 0});
  }

  const visits = residentVisits ? createCrowVisits(layout, birds, clearGround, random) : null;
  const pranks = createCrowPranks(birds, clearGround);
  const keyStory = allowKeyStory ? createCrowKeyStory(layout,birds,clearGround,allowKeyStory,storyDeck) : null;
  const disputes = createCrowDisputes(layout, birds, groundNear, clearGround, relative);
  const allBirds = [...birds, ...disputes.guests];
  for (const bird of allBirds) bird.personality = crowPersonality(bird.id);
  for (const bird of allBirds.slice(1)) {
    bird.neighbourLook = 0;
    bird.ordinaryLandings = 0;
    bird.approachingGround = false;
    bird.alternatePerch = null;
  }
  // Free landings draw independently from recruitment, story order and camera timing.
  let landingSeed = Math.floor(birds[1].wingPhase / turn * 4294967296);
  const landingDraw = () => ((landingSeed = (Math.imul(landingSeed,1664525) + 1013904223) >>> 0) / 4294967296);
  const xs = layout.walkable.map(p => p[0]), zs = layout.walkable.map(p => p[1]);
  const west = Math.min(...xs), east = Math.max(...xs), north = Math.min(...zs), south = Math.max(...zs);
  // A bird's starting wing phase varies uniformly on every visit. This draw
  // uses it without consuming the random sequence that drives flock missions.
  const nodDraw = birds[2].wingPhase / turn;
  const rollCall = createCrowRollCall(birds, () => nodDraw, cameraGreeting);
  const onStage = id => id === rollCall.state.targetId || keyStory?.targets.has(id) || disputes.reserved(birds[id]);
  const busyForPranks = {has: id => onStage(id) || beacons.current?.sender.id === id || beacons.current?.recipient.id === id};
  const treePrank = createCrowTreePrank(birds, crowTrees);
  const busyForTrees = {has: id => busyForPranks.has(id) || pranks.targets.has(id) || visits?.perches.has(id)};
  // A resting bird can signal with its ankle without leaving the resident's side.
  const beacons = createCrowBeaconExchange(birds,clearGround,{has:id=>onStage(id) || pranks.targets.has(id)
    || treePrank.targets.has(id) || (visits?.state.phase !== 'sitting' && visits?.perches.has(id))});
  const flightPlay = createCrowFlightPlay(allBirds, id => busyForTrees.has(id) || treePrank.targets.has(id) || disputes.targets.has(id));

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = integer(0, i);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  function leave(bird, flyAway) {
    bird.called = bird.inParty = false;
    bird.launchAt = 0;
    bird.slot = -1;
    bird.roamAt = time;
    if (flyAway) chooseForage(bird, true);
  }
  function touchdown() {
    rollCall.reset();
    state.landingCount++;
    state.phase = 'gather';
    state.targetSize = state.landingCount === 1 ? integer(3, 6) : integer(2, count);
    state.partySize = 1;
    const pool = shuffle(birds.slice(1));
    // The camera bird can send out at least one other elder. Two experienced
    // neighbours are on hand at the first gathering while recruits trickle in.
    state.seniorCount = integer(state.landingCount === 1 ? 3 : 2, 5);
    for (let i = 0; i < pool.length; i++) pool[i].senior = i < state.seniorCount - 1;
    const elders = pool.filter(b => b.senior);
    // Each elder may take neighbours along on its own foraging trips.
    for (const b of pool) b.elder = !b.senior && elders.length
      ? elders.reduce((near, next) => distance(b, next) < distance(b, near) ? next : near).id : 0;
    let retaining = state.landingCount === 1 || random() < .35 ? 0 : integer(0, state.targetSize - 2);
    let slot = 0;
    for (const b of pool) {
      if (b.inParty && retaining > 0) {
        b.called = true;
        b.inParty = false;
        b.launchAt = 0;
        b.slot = slot++;
        retaining--;
      } else if (b.called || b.inParty) leave(b, true);
    }
    callAt = time + range(.85, 1.6);
    slotsX = Infinity;
    state.searchYaw = null;
  }

  function startMission() {
    state.phase = 'mission';
    state.missionCount++;
    state.searchYaw = null;
    const members = shuffle(birds.slice(1).filter(b => b.inParty));
    for (let i = 0; i < members.length; i++) {
      const b = members[i];
      // The camera bird always goes first. Shuffle who answers its signal and
      // who keeps watching from the original patch of ground for twenty seconds.
      let delay = 0;
      if (i === members.length - 1) delay = 20;
      else if (i > 0) delay = 18 * (i - 1 + random()) / (members.length - 2);
      b.launchAt = time + delay;
    }
    splitAt = time + range(10, 21);
  }

  function breakFormation() {
    const flyers = birds.slice(1).filter(b => b.inParty && b.airborne > .75 && time > b.launchAt + 2);
    if (!flyers.length) { splitAt = time + 2; return; }
    shuffle(flyers);
    const n = random() < .16 ? flyers.length : integer(1, Math.min(2, flyers.length));
    for (let i = 0; i < n; i++) {
      const b = flyers[i], side = Math.sign(b.formationSide);
      const yaw = heading + side * range(1, 1.75), duration = range(4.5, 7.5);
      const end = relative(b, yaw, 0, duration * clamp(b.speed + 1.5, 6.5, 10));
      const perch = groundNear(end.x, end.z);
      leave(b, false);
      b.roamX = perch?.x ?? end.x;
      b.roamZ = perch?.z ?? end.z;
      b.breakHeight = Math.max(3, b.y + range(.5, 2.5));
      b.breakUntil = time + duration;
      b.roamAt = b.breakUntil + (perch ? range(5, 9) : 0);
    }
    splitAt = time + range(14, 28);
  }

  function chooseForage(b, departing = false) {
    const elder = birds[b.elder];
    const {sociability, curiosity} = b.personality.habits;
    let dest;
    if (!departing && b.elder && !elder.called && distance(elder, leader) < 48 && random() < .72) {
      const around = b.id * 2.4 + range(-1, 1);
      const spacing = 1.8 + 3.2 * (1 - sociability);
      dest = {x: elder.roamX + spacing * Math.cos(around), z: elder.roamZ + spacing * Math.sin(around)};
    } else {
      const catchUp = distance(b, leader) > 38;
      const base = catchUp ? leader : b, a = departing ? bearing(leader, b) + range(-.65, .65) : range(0, turn);
      const radius = departing || catchUp ? range(8, 18) : range(1.8, 8 + 7 * curiosity);
      dest = relative(base, a, 0, radius);
    }
    const perch = groundNear(dest.x, dest.z);
    if (perch) { b.roamX = perch.x; b.roamZ = perch.z; }
    b.cruise = range(2.4, 5.8);
    b.roamAt = time + range(5, 13);
  }
  function gatheringSlot(b, assigned) {
    const row = Math.floor(b.slot / 2), side = b.slot % 2 === 0 ? -1 : 1;
    b.formationSide = side * (1.1 + .74 * row);
    b.formationForward = 4.5 + row * 1.25;
    // A curved line gives each face a clear sightline, even for a full party.
    const arc = side * (.22 + .40 * row), radius = 3.85 + .08 * row;
    const nominal = relative(leader, heading + arc, 0, radius);
    function inView(px, pz) {
      const dx = px - leader.x, dz = pz - leader.z;
      const steps = Math.ceil(Math.hypot(dx, dz) / .45);
      for (let j = 1; j < steps; j++) {
        if (!clearGround(leader.x + dx*j/steps, leader.z + dz*j/steps)) return false;
      }
      return true;
    }
    const available = (px, pz) => Math.hypot(px - leader.x, pz - leader.z) > 1.65
      && assigned.every(other => Math.hypot(other.slotX - px, other.slotZ - pz) > .95) && inView(px, pz);
    // If a wall fills the lead bird's view, find the group a place to the side.
    const ground = groundNear(nominal.x, nominal.z, available) || groundNear(leader.x, leader.z, available);
    if (ground) { b.slotX = ground.x; b.slotZ = ground.z; }
    assigned.push(b);
  }
  function refreshGroundSlots() {
    const assigned = [];
    const party = birds.slice(1).filter(b => b.called).sort((a, b) => a.slot - b.slot);
    for (const b of party) gatheringSlot(b, assigned);
    slotsX = leader.x; slotsZ = leader.z; slotsYaw = heading;
  }
  function recruit() {
    let nearest = null, nearestDistance = Infinity, called = 1;
    for (let i = 1; i < count; i++) {
      const b = birds[i];
      if (b.called) { called++; continue; }
      if (time < b.breakUntil || disputes.reserved(b)) continue;
      const d = distance(leader, b);
      if (d < nearestDistance) { nearest = b; nearestDistance = d; }
    }
    if (called < state.targetSize && nearest && time >= callAt) {
      nearest.called = true;
      nearest.slot = called - 1;
      callAt = time + range(.42, .94);
      slotsX = Infinity;
    }
    let focus = null;
    for (let i = 1; i < count; i++) {
      const b = birds[i];
      if (b.called && !b.inParty && (!focus || b.slot < focus.slot)) focus = b;
    }
    focus ||= called < state.targetSize ? nearest : null;
    state.searchYaw = focus ? bearing(leader, focus) : null;
  }
  function wingmanTarget(b, sinHeading, cosHeading) {
    const row = Math.floor(b.slot / 2);
    const side = b.formationSide + .45 * Math.sin(time * .55 + b.id);
    const forward = b.formationForward + .8 * Math.cos(time * .35 + b.id);
    let x = leader.x + forward * sinHeading + side * cosHeading;
    let z = leader.z - forward * cosHeading + side * sinHeading;
    // A subordinate takes some of its timing from its own elder's actual flight.
    const elder = birds[b.elder];
    if (b.elder && elder.inParty && elder.airborne > .25) {
      x += .28 * (elder.x - (leader.x + elder.formationForward * sinHeading + elder.formationSide * cosHeading));
      z += .28 * (elder.z - (leader.z - elder.formationForward * cosHeading + elder.formationSide * sinHeading));
    }
    const y = Math.max(chest, leader.y - .2 + leader.airborne * (.4 + .22 * row + .55 * Math.sin(time * .62 + b.id)));
    return {x, y, z};
  }

  function steer(b, x, y, z, dt, escort, foraging = false) {
    const habits = b.personality.habits;
    const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
    const groundTrip = y <= chest + .03;
    const lift = groundTrip ? Math.min(b.cruise || 4.6, Math.max(0, d - (b.airborne > .25 ? 1.4 : 3.3)) * .73) : 0;
    let height = y + lift;
    const flying = height > chest + .38 || b.y > chest + .45;
    const limit = flying ? 13.6 : 1.75 * (foraging ? habits.pace : 1);
    const pursuit = Math.min(1.7, limit / Math.max(.01, d));
    let vx = dx * pursuit + (escort ? leader.vx : 0), vz = dz * pursuit + (escort ? leader.vz : 0);
    // At a feeding patch a wary bird yields first. Family members will feed
    // closer together than strangers, especially when a bird likes company.
    const social = foraging && !flying;
    let watched, nearest = 3.2 * 3.2;
    for (const other of allBirds) {
      if (other === b) continue;
      const sx = b.x - other.x, sz = b.z - other.z, sy = b.y - other.y;
      const sq = sx*sx + sz*sz;
      if (Math.abs(sy) > .95 || sq < .0001) continue;
      let safe = other.id ? .85 : 1.45;
      if (social) {
        const familiar = b.flockId === other.flockId;
        safe += familiar ? .55 * (1 - habits.sociability) : .85 * (1 - habits.boldness);
        if (sq < nearest) { watched = other; nearest = sq; }
      }
      if (sq >= safe*safe) continue;
      const radius = Math.sqrt(sq), repulsion = 3.6 * (safe - radius) / radius;
      vx += sx * repulsion; vz += sz * repulsion;
    }
    const interest = watched && (b.flockId === watched.flockId ? habits.sociability : habits.vigilance);
    const attention = watched ? clamp(angleDelta(b.yaw, bearing(b, watched)), -.82, .82) * interest : 0;
    b.neighbourLook += (attention - b.neighbourLook) * Math.min(1, dt * 4);
    const magnitude = Math.hypot(vx, vz);
    if (magnitude > limit) { vx *= limit / magnitude; vz *= limit / magnitude; }
    const change = Math.hypot(vx - b.vx, vz - b.vz);
    const accel = Math.min(1, (flying ? 13 : 5.6) * dt / Math.max(.001, change));
    b.vx += (vx - b.vx) * accel;
    b.vz += (vz - b.vz) * accel;
    let nextX = b.x + b.vx * dt, nextZ = b.z + b.vz * dt;
    if (b.y < 1.6 && !clearGround(nextX, nextZ)) {
      // Flare above a fence or bench before crossing. Touchdown is only on a clear cell.
      height = Math.max(height, 2.1);
      if (clearGround(b.x, b.z)) { nextX = b.x; nextZ = b.z; }
    }
    if (!clearGround(b.x, b.z) && height < 1.9) height = 1.9;
    const desiredClimb = clamp((height - b.y) * 2.4, -4.2, 5.1);
    b.vy += (desiredClimb - b.vy) * Math.min(1, dt * 4.7);
    b.y = Math.max(chest, b.y + b.vy * dt);
    b.x = nextX; b.z = nextZ;
    const cameraDistance = Math.hypot(b.x - leader.x, b.y - leader.y, b.z - leader.z);
    if (cameraDistance < .85) {
      const side = Math.atan2(b.x - leader.x, b.z - leader.z);
      b.x = leader.x + Math.sin(side) * .86;
      b.z = leader.z + Math.cos(side) * .86;
    }
    b.speed = Math.hypot(b.vx, b.vz);
    const yawStep = b.speed > .12 ? clamp(angleDelta(b.yaw, Math.atan2(b.vx, -b.vz)), -3.8*dt, 3.8*dt) : 0;
    b.yaw += yawStep;
    b.airborne = clamp((b.y - chest) / .86, 0, 1);
    b.bank += (clamp(-yawStep / dt * .22, -.57, .57) * b.airborne - b.bank) * Math.min(1, 4.5*dt);
    b.gaitPhase = (b.gaitPhase + dt * b.speed * 11 * habits.pace) % turn;
    b.wingPhase = (b.wingPhase + dt * turn * (2.85 * habits.flap + .24 * clamp(b.vy, 0, 3))) % turn;
    b.mode = b.airborne < .20 ? (b.speed > .23 ? 'walk' : 'perch')
      : b.vy < -.45 ? 'land' : b.vy > .85 ? 'takeoff'
      : Math.sin(time * 1.6 * habits.flap + b.id * 1.9) < .45 - .75 * habits.pace ? 'glide' : 'flap';
  }

  function alternatePerch(bird) {
    const cx = clamp(bird.roamX,west,east), cz = clamp(bird.roamZ,north,south);
    function available(x,z) {
      return pointInRing(x,z,layout.walkable) && Math.hypot(x-bird.roamX,z-bird.roamZ) >= 2 &&
        allBirds.every(other => other === bird || !other.alternatePerch ||
          Math.hypot(x-other.alternatePerch.x,z-other.alternatePerch.z) >= 1);
    }
    for (let attempt=0; attempt<20; attempt++) {
      const angle = turn*landingDraw(), radius = 3+7*landingDraw();
      const x = cx+radius*Math.cos(angle), z = cz+radius*Math.sin(angle);
      if (clearGround(x,z) && available(x,z)) return {x,z};
    }
    return groundNear(cx,cz,available);
  }

  function forageLanding(b,dt) {
    if (!b.approachingGround && b.airborne > .45) {
      b.approachingGround = true;
      if (b.ordinaryLandings % 2 === 1) b.alternatePerch = alternatePerch(b);
    }
    const spot = b.alternatePerch;
    steer(b,spot?.x ?? b.roamX,chest,spot?.z ?? b.roamZ,dt,false,true);
    if (b.approachingGround && b.airborne < .07 && clearGround(b.x,b.z)) {
      if (spot) { b.roamX = spot.x; b.roamZ = spot.z; }
      b.ordinaryLandings++;
      b.approachingGround = false;
      b.alternatePerch = null;
    }
  }

  function update(dt, pose) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    time += dt;
    leader.elapsed = time;
    const previous = leader.mode;
    leader.vx = (pose.x - leader.x) / dt; leader.vz = (pose.z - leader.z) / dt;
    leader.speed = Math.hypot(leader.vx, leader.vz);
    if (leader.speed > .08) heading += angleDelta(heading, Math.atan2(leader.vx, -leader.vz)) * Math.min(1, dt * 1.1);
    leader.x = pose.x; leader.y = pose.y; leader.z = pose.z; leader.yaw = pose.yaw;
    leader.bank = pose.roll || 0; leader.mode = pose.mode;
    leader.wingPhase = pose.wingPhase ?? leader.wingPhase;
    leader.airborne = clamp((leader.y - .42) / 1.8, 0, 1);
    if (pose.mode === 'walk' && previous !== 'walk') touchdown();
    if (pose.mode === 'takeoff' && previous !== 'takeoff') startMission();
    if (pose.mode === 'land' && previous !== 'land') state.phase = 'landing';
    const gathering = state.phase === 'gather' || state.phase === 'ready';
    if (gathering) recruit();
    if (gathering || state.phase === 'landing') {
      if (Math.hypot(leader.x - slotsX, leader.z - slotsZ) > .85 || Math.abs(angleDelta(slotsYaw, heading)) > .19) refreshGroundSlots();
    }
    if (state.phase === 'mission' && time >= splitAt) breakFormation();
    // Finish the visible encounter before staging a second scene at this perch.
    const encounterWasActive = disputes.state.phase !== 'idle';
    if (!encounterWasActive) {
      if (!keyStory?.targets.size) visits?.update(dt, time, state, heading);
      // Let the receiving crow finish its answer before the camera turns to the key.
      keyStory?.update(dt,time,state,visits?.holdLeader() || beacons.current);
    }
    // Active visits and key scenes keep ownership of the camera and their birds.
    const calling = rollCall.state.targetId !== null || (rollCall.state.phase === 'idle' && rollCall.state.answered.length > 0);
    disputes.update(dt, time, visits?.holdLeader() || keyStory?.targets.size || calling);
    if (encounterWasActive && disputes.state.phase === 'idle') readySince = time;
    pranks.update(dt, time, state.phase, visits?.perches, busyForPranks);
    treePrank.update(dt, time, busyForTrees);
    const sinHeading = Math.sin(heading), cosHeading = Math.cos(heading);
    let assembled = 1;
    for (let i = 1; i < allBirds.length; i++) {
      const b = allBirds[i];
      const perch = visits?.perches.get(b.id);
      const storyTarget = keyStory?.targets.get(b.id);
      const prankTarget = pranks.targets.get(b.id);
      const encounterTarget = disputes.targets.get(b.id);
      const branch = treePrank.targets.get(b.id);
      // Reserved actors always follow their scene, even when recruited during a flare.
      const foraging = !perch && !storyTarget && !encounterTarget &&
        (b.flockId || (!prankTarget && !branch && !b.called && time >= b.breakUntil));
      if (!foraging) { b.approachingGround = false; b.alternatePerch = null; }
      if (perch) {
        if (visits.state.phase === 'sitting') {
          // A settled guest stays put. Passing neighbours still steer around it.
          b.vx = b.vz = b.vy = b.speed = b.airborne = b.bank = 0;
          b.y += (chest - b.y) * Math.min(1, dt * 5);
        } else steer(b, perch.x, chest, perch.z, dt, false);
        if (b.mode === 'perch') {
          b.yaw += clamp(angleDelta(b.yaw, bearing(b, visits.state)), -1.6*dt, 1.6*dt);
        }
      } else if (storyTarget) {
        steer(b,storyTarget.x,chest,storyTarget.z,dt,false);
      } else if (encounterTarget) {
        steer(b, encounterTarget.x, encounterTarget.y, encounterTarget.z, dt, false);
      } else if (b.flockId) {
        forageLanding(b,dt);
      } else if (prankTarget) {
        steer(b, prankTarget.x, chest, prankTarget.z, dt, false);
      } else if (time < b.breakUntil) {
        steer(b, b.roamX, b.breakHeight, b.roamZ, dt, false);
      } else if (branch) {
        if (!branch.perched) steer(b, branch.x, branch.y, branch.z, dt, false);
      } else if (!b.called) {
        if (time >= b.roamAt) chooseForage(b);
        forageLanding(b,dt);
      } else if (time < b.launchAt) {
        steer(b, b.slotX, chest, b.slotZ, dt, false);
        if (b.speed < .25) b.yaw += clamp(angleDelta(b.yaw, bearing(b, leader)), -1.7*dt, 1.7*dt);
      } else if (gathering || (state.phase === 'landing' && leader.y < 3.2)) {
        steer(b, b.slotX, chest, b.slotZ, dt, false);
      } else {
        const aim = wingmanTarget(b, sinHeading, cosHeading);
        const y = state.phase === 'mission' ? Math.max(1.9, aim.y) : aim.y;
        steer(b, aim.x, y, aim.z, dt, true);
      }
      if (gathering && b.called) b.inParty = b.y < .83 && Math.hypot(b.x - b.slotX, b.z - b.slotZ) < 1.75;
      if (b.inParty) assembled++;
    }
    state.partySize = assembled;
    flightPlay.update(time,state.phase==='mission' && leader.airborne>.6,pose);
    const previousExchange = beacons.current;
    beacons.update(time, allowBeacons() && (!keyStory || keyStory.state.phase==='idle'), pose);
    // Give the story a turn to claim the landing after the final reply.
    if (previousExchange && !beacons.current && state.phase === 'ready') readySince = time;
    if (gathering && disputes.state.phase === 'idle') rollCall.update(dt, pose, state.targetSize);
    if (gathering && assembled === state.targetSize && state.phase !== 'ready'
        && rollCall.state.phase === 'done' && Math.abs(angleDelta(leader.yaw, heading)) < .22) {
      state.phase = 'ready'; readySince = time; state.searchYaw = null;
    } else if (gathering && assembled < state.targetSize) state.phase = 'gather';
    if (keyStory?.targets.size) state.searchYaw = bearing(leader,keyStory.state);
    else if (visits?.state.kind) state.searchYaw = bearing(leader, visits.state);
    else if (gathering && disputes.state.phase !== 'idle') state.searchYaw = bearing(leader, disputes.state);
    else if (gathering && rollCall.state.phase === 'done' && state.phase !== 'ready') state.searchYaw = heading;
    else if (gathering && pranks.state.actorId !== null) {
      const actor = birds[pranks.state.actorId], look = bearing(leader, actor);
      if (distance(leader, actor) < 12 && Math.abs(angleDelta(leader.yaw, look)) < 1.35) state.searchYaw = look;
    }
  }

  return {birds, allBirds, state, rollCall:rollCall.state, flightPlay:flightPlay.state, treePrank:treePrank.state, visit:visits?.state, prank:pranks.state, keyStory:keyStory?.state, dispute:disputes.state, update,
    get beacons() { return beacons.current; },
    canTakeOff: () => state.phase === 'ready' && !visits?.holdLeader() && !keyStory?.targets.size && !beacons.current
      && disputes.state.phase === 'idle' && time - readySince >= .7};
}
