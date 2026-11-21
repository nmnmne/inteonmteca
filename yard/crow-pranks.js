const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const bearing = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const pulse = (age, start, duration) => {
  const u = (age - start) / duration;
  return u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
};

// A free bird feigns a peck near another bird's tail, or taps an empty spot as
// if it found food. Both use the flock's normal ground steering and separation.
export function createCrowPranks(birds, clearGround, random) {
  const leader = birds[0], targets = new Map();
  const viewArc = leader.fov>74 ? .44 : .88;
  const state = {phase:'idle', kind:null, actorId:null, partnerId:null, count:0};
  // Local variation keeps a joke from rerolling the route or the resident's visit.
  let seed = ((birds[1].wingPhase || 0) * 1e7 + (birds[2].gaitPhase || 0) * 1e6) >>> 0;
  const draw = random || (() => (seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
  let nextAt = 1 + draw()*2, since = 0, actor, partner, exit, lastActor = null;
  let occupied;
  const eligible = (b, gathering, perches) => !b.senior && (!b.called || (gathering && b.inParty))
    && b.airborne < .17 && !perches?.has(b.id) && !occupied?.has(b.id);
  const withinSlot = (b, spot) => !b.called || Math.hypot(spot.x-b.slotX,spot.z-b.slotZ)<1.55;

  function clearPath(a, b) {
    const steps = Math.max(1, Math.ceil(distance(a,b) / .34));
    for (let i=0; i<=steps; i++) {
      const s=i/steps, x=a.x+(b.x-a.x)*s, z=a.z+(b.z-a.z)*s;
      if (!clearGround(x,z) || Math.hypot(x-leader.x,z-leader.z)<1.65) return false;
    }
    return true;
  }
  function start(time, gathering, perches) {
    let best = Infinity, meet;
    const side = draw() < .5 ? -1 : 1;
    for (let i=1; i<birds.length; i++) {
      const a=birds[i];
      if (!eligible(a,gathering,perches)) continue;
      for (let j=1; j<birds.length; j++) {
        const b=birds[j], gap=distance(a,b);
        if (!eligible(b,gathering,perches) || gap<.82 || gap>4.3) continue;
        const viewDistance = distance(leader,b);
        const offAxis = Math.abs(angleDelta(leader.yaw,bearing(leader,b)));
        const score = viewDistance + offAxis*7 + gap*.4 + (a.id===lastActor ? 4 : 0) + draw()*1.3;
        if (score >= best || viewDistance>12 || offAxis>viewArc) continue;
        const dx=(a.x-b.x)/gap, dz=(a.z-b.z)/gap;
        const spot={x:b.x+dx*.93,z:b.z+dz*.93};
        let away={x:spot.x+dx*.95-dz*side, z:spot.z+dz*.95+dx*side};
        if (!withinSlot(a,away)) away={x:a.slotX,z:a.slotZ};
        if (!withinSlot(a,spot) || !withinSlot(b,b) || !clearPath(a,spot) || !clearPath(spot,away) || !clearPath(b,b)) continue;
        best=score; actor=a; partner=b; meet=spot; exit=away;
      }
    }
    if (!meet) return;
    state.phase='approach'; state.kind=draw()<.5 ? 'tail' : 'decoy';
    state.actorId=actor.id; state.partnerId=partner.id; lastActor=actor.id; since=time;
    targets.set(actor.id,meet); targets.set(partner.id,{x:partner.x,z:partner.z});
    actor.prankPose={dip:0,hop:0,wings:0,glance:0};
    partner.prankPose={dip:0,hop:0,wings:0,glance:0};
  }
  function release(time) {
    nextAt = time + (state.phase==='approach' ? 2+draw()*2 : 14+draw()*14);
    actor.prankPose=partner.prankPose=null;
    actor=partner=null; targets.clear();
    state.phase='idle'; state.kind=state.actorId=state.partnerId=null;
  }
  function face(b, yaw, dt) {
    b.yaw += angleDelta(b.yaw,yaw) * Math.min(1,3.5*dt);
  }
  function update(dt, time, flockPhase, perches, storyTargets) {
    occupied=storyTargets;
    const gathering=flockPhase==='gather' || flockPhase==='ready';
    if (state.phase==='idle') {
      if (time < nextAt) return;
      nextAt=time+1;
      if (flockPhase==='mission' && leader.y>7) return;
      start(time,gathering,perches);
      return;
    }
    if (!eligible(actor,gathering,perches) || !eligible(partner,gathering,perches)
        || !withinSlot(actor,targets.get(actor.id)) || !withinSlot(partner,targets.get(partner.id))) {
      release(time); return;
    }
    const age=time-since, a=actor.prankPose, b=partner.prankPose;
    if (state.phase==='approach') {
      // Look away from an approaching tail-tapper; a bird offered food watches instead.
      face(partner,bearing(partner,actor)+(state.kind==='tail' ? Math.PI : 0),dt);
      a.glance=.48*Math.sin(age*5.5);
      if (distance(actor,partner)<1.22 && age>.35) {
        state.phase='feint'; since=time; state.count++;
      } else if (age>5) release(time);
    } else if (state.phase==='feint') {
      face(actor,bearing(actor,partner),dt);
      const decoy=state.kind==='decoy', reaction=decoy ? 1.22 : .63;
      a.glance=.48*(1-pulse(age,.14,.75));
      a.dip=decoy ? .96*pulse(age,.08,.48)+.83*pulse(age,.64,.38) : 1.02*pulse(age,.22,.48);
      b.dip=decoy ? .88*pulse(age,.58,.58) : 0;
      if (age>reaction-.18) face(partner,bearing(partner,actor),dt);
      const recoil=pulse(age,reaction,.53);
      b.hop=recoil*.24; b.wings=recoil*.79;
      if (age>reaction+.65) {
        // The other bird has hopped back or checked the empty patch. A friendly
        // partner sometimes answers with a chuckle; a failed setup stays quiet.
        if ((state.count+actor.id+partner.id)%3!==0) {
          const amused=partner.personality?.habits.sociability>.55 ? partner : actor;
          amused.laughAt=time;
        }
        targets.set(actor.id,exit);
        state.phase='retreat'; since=time;
        a.dip=b.dip=b.hop=b.wings=0;
      }
    } else {
      a.hop=.15*pulse(age,.02,.44);
      a.wings=.45*pulse(age,.04,.48);
      a.glance=-.72*pulse(age,.48,.83);
      face(partner,bearing(partner,actor),dt);
      b.glance=.50*pulse(age,.50,.64);
      if (age>1.8) release(time);
    }
  }
  return {state, targets, update};
}
