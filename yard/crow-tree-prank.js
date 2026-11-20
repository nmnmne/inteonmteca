// A free crow climbs above a real limb, lands, then bounces it with its feet.
// The perch follows the same pivot as the wood so the toes ride the rebound.
export function createCrowTreePrank(birds, getTrees) {
  const leader = birds[0], targets = new Map();
  const state = {phase:'idle', actorId:null, treeId:null, count:0};
  let trees, actor, perch, target, since=0, nextAt=1.2, playAt=null, beats=0;
  const free = (b, time, occupied) => !b.called && !b.inParty && time >= b.breakUntil && !occupied?.has(b.id);

  function choose(time, occupied) {
    let best=Infinity, chosen;
    for (const seat of trees.perches) {
      const dx=seat.x-leader.x, dz=seat.z-leader.z, range=Math.hypot(dx,dz);
      const ahead=dx*Math.sin(leader.yaw)-dz*Math.cos(leader.yaw);
      if (range>23 || ahead < range*.08 || Math.abs(seat.y-leader.y)>9) continue;
      const length=Math.hypot(seat.local.x,seat.local.z);
      for (let i=1; i<birds.length; i++) {
        const b=birds[i];
        if (!free(b,time,occupied)) continue;
        const distance=Math.hypot(b.x-seat.x,b.y-seat.y,b.z-seat.z);
        if (distance>17) continue;
        // Favour a branch facing the observer and an actor already on that side.
        const side=(seat.local.x*dx+seat.local.z*dz)/(length*Math.max(1,range));
        const score=distance + (range-ahead)*.85 + range*.35 + side*2;
        if (score<best) { best=score; actor=b; chosen=seat; }
      }
    }
    if (!chosen) return;
    perch=chosen;
    const reach=Math.hypot(perch.local.x,perch.local.z);
    target={x:perch.x+perch.local.x/reach*1.25, y:perch.y+1.05, z:perch.z+perch.local.z/reach*1.25, perched:false};
    targets.set(actor.id,target);
    state.actorId=actor.id; state.treeId=perch.treeId;
    state.phase='approach'; since=time; beats=0;
  }
  function release(time) {
    const seated=state.phase==='perched';
    if (seated) {
      trees.rock(perch,.46);
      actor.vy=.9;
      actor.roamAt=time;
    }
    targets.clear();
    actor=null; perch=null; target=null;
    state.phase='idle'; state.actorId=state.treeId=null;
    nextAt=time+(seated ? 16 : 3);
  }
  function update(dt,time,occupied) {
    const visibleTrees=getTrees?.();
    if (visibleTrees) trees=visibleTrees;
    trees?.update(dt);
    if (actor && (!visibleTrees || !free(actor,time,occupied))) release(time);
    if (!visibleTrees) return;
    if (!actor) {
      if (time>=nextAt) { nextAt=time+.75; choose(time,occupied); }
      return;
    }
    if (state.phase!=='perched') {
      const gap=Math.hypot(actor.x-target.x,actor.y-target.y,actor.z-target.z);
      if (time-since>9) { release(time); return; }
      if (state.phase==='approach' && gap<.45) {
        target.x=perch.x; target.y=perch.y+.20; target.z=perch.z;
        since=time; state.phase='land';
      } else if (state.phase==='land' && gap<.065) {
        target.perched=true; since=time; playAt=null;
        state.phase='perched'; state.count++;
        trees.rock(perch,.62);
      } else return;
    }
    if (!target.perched) return;
    const settled=time-since;
    if (playAt===null && settled>.5) {
      const dx=perch.x-leader.x, dz=perch.z-leader.z, range=Math.hypot(dx,dz);
      const ahead=dx*Math.sin(leader.yaw)-dz*Math.cos(leader.yaw);
      // Hold the joke for a glance from the leader. Its roll call keeps the camera.
      if (ahead>range*Math.cos(leader.fov>74 ? .40 : .85) || settled>20) playAt=time;
    }
    const age=playAt===null ? -.01 : time-playAt;
    if (age>3.6) { release(time); return; }
    const cycle=age/1.02, step=Math.floor(cycle), progress=cycle-step;
    const hopping=step>=0 && step<3 && progress<.44;
    const hop=hopping ? Math.sin(Math.PI*progress/.44) : 0;
    const landings=Math.min(3,Math.max(0,Math.floor(cycle+1-.44)));
    if (landings>beats) { beats=landings; trees.rock(perch,.87); }
    actor.x=perch.x; actor.z=perch.z; actor.y=perch.y+.20+.26*hop;
    actor.vx=actor.vz=actor.vy=actor.speed=0;
    actor.bank=0;
    actor.airborne=Math.max(0,1-settled*4,.34*hop);
    actor.mode=actor.airborne>.04 ? 'land' : 'perch';
    const yaw=Math.atan2(leader.x-actor.x,actor.z-leader.z);
    const turn=Math.atan2(Math.sin(yaw-actor.yaw),Math.cos(yaw-actor.yaw));
    actor.yaw+=Math.max(-2.8*dt,Math.min(2.8*dt,turn));
    actor.wingPhase+=dt*15;
  }
  return {state,targets,update};
}
