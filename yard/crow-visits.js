import { pointInRing } from './navigation.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const smooth = t => t * t * (3 - 2 * t);

// The visitors stay in the regular flock. Reserving a perch only changes the
// destination passed to their normal steering, landing and separation logic.
export function createCrowVisits(layout, birds, clearGround, random) {
  const leader = birds[0];
  const state = {kind:null, phase:'idle', x:0, y:0, z:0, yaw:0, amount:0, birds:[]};
  const perches = new Map();
  let nextKind = random() < .5 ? 'resident' : 'crows';
  let lastLanding = 0, nextVisit = 0, began = 0, leaveAt = 0, brakingSince = null;
  let start, seat;

  function openPath(from, to) {
    const steps = Math.max(1, Math.ceil(distance(from, to) / .35));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!clearGround(from.x + (to.x - from.x)*t, from.z + (to.z - from.z)*t)) return false;
    }
    return pointInRing(to.x, to.z, layout.walkable);
  }
  function visible(p, heading) {
    const d = distance(leader, p);
    const angle = Math.atan2(p.x - leader.x, leader.z - p.z);
    return d >= 3 && d <= 10 && Math.abs(turn(heading, angle)) < .82 && openPath(leader, p);
  }
  function offset(p, yaw, side, forward) {
    return {x:p.x + Math.cos(yaw)*side + Math.sin(yaw)*forward,
      z:p.z + Math.sin(yaw)*side - Math.cos(yaw)*forward};
  }
  const empty = p => birds.every(b => b.y > .65 || distance(p, b) > .55);

  function joinRestingCrow(heading) {
    const nearby = birds.slice(1).filter(b => b.y < .29 && b.speed < .45 && visible(b, heading))
      .sort((a, b) => distance(leader,a) - distance(leader,b));
    for (const host of nearby) {
      const side = random() < .5 ? -1 : 1;
      for (const sign of [side, -side]) {
        // An angled approach keeps the host and the visitor side by side in view.
        const end = offset(host,heading,sign*.75,.23);
        const from = offset(end,heading,sign*1.25,.85);
        if (!visible(end,heading) || !empty(end) || !empty(from) || !openPath(from,end)) continue;
        seat = end; start = from;
        perches.set(host.id,{x:host.x,z:host.z});
        return true;
      }
    }
    return false;
  }

  function inviteCrows(heading) {
    for (const forward of [4,5.3,6.4]) for (const side of [0,-1.2,1.2]) {
      const spot = offset(leader,heading,side,forward);
      if (!visible(spot,heading) || !empty(spot)) continue;
      const waiting = birds.slice(1).filter(b => distance(b,spot) > 4 && distance(b,spot) < 28)
        .sort((a,b) => Number(a.called)-Number(b.called) || distance(a,spot)-distance(b,spot));
      const count = random() < .65 ? 2 : 1;
      for (const side of [-.79,.79]) {
        const target = offset(spot,heading,side,-.18);
        if (!waiting.length || !empty(target) || !openPath(spot,target)) continue;
        perches.set(waiting.shift().id,target);
        if (perches.size === count) break;
      }
      if (!perches.size) continue;
      start = seat = spot;
      return true;
    }
    return false;
  }

  function update(dt, time, flock, heading) {
    if (state.phase === 'idle') {
      if (brakingSince !== null && (time - brakingSince >= 5 || leader.mode !== 'walk')) {
        lastLanding = flock.landingCount;
        brakingSince = null;
      }
      if (time < nextVisit || flock.phase !== 'ready' || lastLanding === flock.landingCount) return;
      // The camera crow is still walking during early recruitment. Let it
      // finish its stride so it cannot walk into a stationary group.
      brakingSince ??= time;
      if (leader.speed > .12) return;
      brakingSince = null;
      lastLanding = flock.landingCount;
      if (!pointInRing(leader.x, leader.z, layout.walkable)) return;
      if (!(nextKind === 'resident' ? joinRestingCrow(heading) : inviteCrows(heading))) return;
      state.kind = nextKind;
      state.birds = [...perches.keys()];
      state.x = start.x; state.z = start.z;
      state.yaw = Math.atan2(leader.x - start.x, leader.z - start.z);
      state.phase = 'approach'; began = time;
    }
    const age = time - began;
    if (state.phase === 'leaving') {
      state.amount = Math.max(0, 1 - age);
      if (state.amount === 0) {
        state.kind = null; state.phase = 'idle'; state.birds = [];
        nextVisit = time + 40 + random()*24;
      }
      return;
    }
    state.amount = smooth(Math.min(1,age/.9));
    const walk = smooth(Math.min(1,age/2.8));
    state.x = start.x + (seat.x - start.x)*walk;
    state.z = start.z + (seat.z - start.z)*walk;
    const partner = birds[state.birds[0]];
    // Include the first-person crow in the circle. Turning part way toward the
    // neighbouring bird keeps both eyes visible to the leader during a glance.
    const leaderYaw = Math.atan2(leader.x - state.x, leader.z - state.z);
    const partnerYaw = Math.atan2(partner.x - state.x, partner.z - state.z);
    const glance = .34 + .10 * Math.sin(age * 1.5);
    const look = leaderYaw + Math.max(-1.45, Math.min(1.45, turn(leaderYaw, partnerYaw))) * glance;
    state.yaw += turn(state.yaw, look) * Math.min(1, dt * 3.5);
    if (state.phase === 'approach' && walk === 1 && state.birds.every(id =>
      birds[id].mode === 'perch' && distance(birds[id],perches.get(id)) < .35)) {
      state.phase = 'sitting'; leaveAt = time + 6 + random()*4;
      nextKind = state.kind === 'resident' ? 'crows' : 'resident';
    }
    if ((state.phase === 'sitting' && time >= leaveAt) || (state.phase === 'approach' && age > 12)
      || leader.mode !== 'walk') {
      state.phase = 'leaving'; began = time;
      perches.clear();
    }
  }
  return {state, perches, update, holdLeader: () => brakingSince !== null || state.kind !== null};
}
