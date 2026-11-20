import { pointInRing } from './navigation.js';

const gap = (a,b) => Math.hypot(b.x-a.x,b.z-a.z);
const bearing = (a,b) => Math.atan2(b.x-a.x,a.z-b.z);
const angle = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const smooth = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };
const beat = (t,start,duration) => Math.sin(Math.PI*smooth((t-start)/duration))**2;

// Two of the existing birds find a key which opens a door standing in thin air.
// A second key remains inside the doorway while the thief escapes with the first.
export function createCrowKeyStory(layout,birds,clearGround,allowed) {
  const leader=birds[0], targets=new Map();
  const state={phase:'idle',count:0,elapsed:0,x:0,z:0,yaw:0,door:0,
    key:{x:0,y:0,z:0,tilt:0,turn:0,scale:1}, finder:null, thief:null};
  let began=0, nextAt=0, landing=0, finder, thief, escape, escapeFrom;

  function offset(origin,yaw,side,forward) {
    return {x:origin.x+Math.cos(yaw)*side+Math.sin(yaw)*forward,
      z:origin.z+Math.sin(yaw)*side-Math.cos(yaw)*forward};
  }
  function clearPath(a,b) {
    const n=Math.max(1,Math.ceil(gap(a,b)/.4));
    for(let i=0;i<=n;i++){
      const t=i/n;
      if (!clearGround(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)) return false;
    }
    return true;
  }
  function stage(heading) {
    for(const side of [0,-.3,.3,-.65,.65]) for(const forward of [2.7,3.5,4.2]) {
      const mark=offset(leader,heading,side,forward);
      if (!clearPath(leader,mark) || !pointInRing(mark.x,mark.z,layout.walkable)) continue;
      const flip=state.count%2 ? -1 : 1;
      const a=offset(mark,heading,-.63*flip,.1), b=offset(mark,heading,.64*flip,-.25);
      const out=offset(mark,heading,1.50*flip,-.82);
      if (clearPath(a,b) && clearPath(b,out)) return {mark,a,b,out};
    }
    return null;
  }
  function start(time,flock,heading) {
    const set=stage(heading);
    if (!set) return;
    const nearest=birds.slice(1).filter(b=>time>=b.breakUntil)
      .sort((a,b)=>gap(a,set.mark)-gap(b,set.mark));
    if (nearest.length<2 || gap(nearest[1],set.mark)>16) return;
    [finder,thief]=nearest;
    targets.set(finder.id,set.a); targets.set(thief.id,set.b);
    finder.storyPose={dip:0,glance:0,wings:0,hop:0}; thief.storyPose={...finder.storyPose};
    Object.assign(state,{phase:'approach',elapsed:0,x:set.mark.x,z:set.mark.z,yaw:heading,
      door:0,finder:finder.id,thief:thief.id});
    Object.assign(state.key,{x:state.x,y:.073,z:state.z,tilt:0,turn:0,scale:1});
    escape=set.out; began=time; landing=flock.landingCount;
  }
  function clear(time,completed) {
    finder.storyPose=thief.storyPose=null;
    targets.clear();
    state.phase='idle'; state.door=0; state.finder=state.thief=null;
    if (completed) state.count++;
    nextAt=time+(completed ? 75 : 10);
  }
  function face(b,target,dt) {
    b.yaw+=angle(b.yaw,bearing(b,target))*Math.min(1,dt*5);
  }
  function update(dt,time,flock,visitBusy) {
    if (state.phase==='idle') {
      if (flock.phase!=='ready' || visitBusy || landing===flock.landingCount || time<nextAt || !allowed()) return;
      if (leader.speed>.16) return;
      nextAt=time+.4;
      start(time,flock,leader.yaw);
      return;
    }
    if (leader.mode!=='walk' || !allowed()) { clear(time,false); return; }
    const age=time-began, k=state.key, f=finder.storyPose, t=thief.storyPose;
    if (state.phase==='approach') {
      if (finder.y<.34 && thief.y<.34 && gap(finder,targets.get(finder.id))<.35 && gap(thief,targets.get(thief.id))<.35) {
        state.phase='knock'; began=time;
      } else if (age>8) clear(time,false);
      return;
    }
    state.elapsed=age;
    face(finder,state,dt);
    if (age<6.6) face(thief,state,dt);
    f.dip=.99*(beat(age,.3,.6)+beat(age,1.32,.6)+beat(age,8.4,.65));
    t.glance=.45*beat(age,.7,1.65);
    if (age<2.1) {
      k.y=.073+.07*(beat(age,.52,.46)+beat(age,1.56,.5));
      return;
    }
    const lift=smooth((age-2.1)/1.1);
    state.door=smooth((age-3.55)/1.45)*(1-smooth((age-7.3)/.52));
    k.y=.073+.38*lift; k.tilt=lift*Math.PI/2;
    k.turn=smooth((age-3.1)/1.15)*Math.PI;
    if (age<5.65) {
      state.phase='unlock';
      f.wings=.68*beat(age,3.6,1.1);
      return;
    }
    const beak=offset(thief,thief.yaw,0,.34);
    if (age<6.6) {
      state.phase='steal';
      const reach=smooth((age-5.65)/.95);
      k.x=state.x+(beak.x-state.x)*reach;
      k.z=state.z+(beak.z-state.z)*reach;
      k.y+=(thief.y+.08-k.y)*reach;
      return;
    }
    if (state.phase!=='escape') {
      state.phase='escape'; targets.set(thief.id,escape);
      escapeFrom={x:k.x,y:k.y,z:k.z};
    }
    t.hop=.15*beat(age,6.64,.63); t.wings=.85*beat(age,6.62,.7);
    const catchUp=smooth((age-6.6)/.3);
    k.x=escapeFrom.x+(beak.x-escapeFrom.x)*catchUp;
    k.z=escapeFrom.z+(beak.z-escapeFrom.z)*catchUp;
    k.y=escapeFrom.y+(thief.y+.08+t.hop-escapeFrom.y)*catchUp;
    k.turn+=angle(state.yaw,thief.yaw)*catchUp; k.tilt=1.0+.15*Math.sin(age*6);
    k.scale=1-smooth((age-9.1)/.65);
    if (age>9.8) clear(time,true);
  }
  return {state,targets,update};
}
