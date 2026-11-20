import { pointInRing } from './navigation.js';
import { CROW_BEACON_DURATION, crowBeaconCode, crowBeaconPulse } from './crow-beacon-code.js';

const gap = (a,b) => Math.hypot(b.x-a.x,b.z-a.z);
const bearing = (a,b) => Math.atan2(b.x-a.x,a.z-b.z);
const angle = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const smooth = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };
const beat = (t,start,duration) => Math.sin(Math.PI*smooth((t-start)/duration))**2;
const callAt=2.78, replyAt=4.20;

// The finder opens the impossible door. Two other flock members use its reflection
// as a distraction, pass the real key beak-to-beak and hide it under a grate.
export function createCrowKeyStory(layout,birds,clearGround,allowed) {
  const leader=birds[0], targets=new Map();
  const state={phase:'idle',count:0,elapsed:0,x:0,z:0,yaw:0,door:0,
    key:{x:0,y:0,z:0,tilt:0,turn:0,scale:1},cache:{x:0,z:0,open:0},evidence:0,
    finder:null,thief:null,accomplice:null,
    beacons:{code:0,call:null,reply:null,acknowledged:false,thief:{pulse:0},accomplice:{pulse:0}}};
  let began=0,nextAt=0,landing=0,finder,thief,accomplice,escape,rendezvous,escapeFrom,handoffAt;

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
      const lookout=offset(mark,heading,-.12*flip,1.22);
      const meeting=offset(mark,heading,.63*flip,.79);
      const cache=offset(mark,heading,-.10*flip,.86);
      if (clearPath(a,b) && clearPath(b,out) && clearPath(out,meeting) && clearPath(meeting,lookout)
          && clearPath(lookout,cache)) return {mark,a,b,out,lookout,meeting,cache};
    }
    return null;
  }
  function start(time,flock,heading) {
    const set=stage(heading);
    if (!set) return;
    const nearest=birds.slice(1).filter(b=>time>=b.breakUntil)
      .sort((a,b)=>gap(a,set.mark)-gap(b,set.mark));
    if (nearest.length<3 || gap(nearest[2],set.mark)>16) return;
    [finder,thief,accomplice]=nearest;
    targets.set(finder.id,set.a); targets.set(thief.id,set.b); targets.set(accomplice.id,set.lookout);
    for (const bird of [finder,thief,accomplice]) bird.storyPose={dip:0,glance:0,wings:0,hop:0};
    Object.assign(state,{phase:'approach',elapsed:0,x:set.mark.x,z:set.mark.z,yaw:heading,
      door:0,evidence:0,finder:finder.id,thief:thief.id,accomplice:accomplice.id});
    Object.assign(state.cache,set.cache,{open:0});
    state.beacons.code=crowBeaconCode(accomplice.id,thief.id,state.count);
    state.beacons.call=state.beacons.reply=null; state.beacons.acknowledged=false;
    Object.assign(state.key,{x:state.x,y:.073,z:state.z,tilt:0,turn:0,scale:1});
    escape=set.out; rendezvous=set.meeting; escapeFrom=handoffAt=null;
    began=time; landing=flock.landingCount;
  }
  function clear(time,completed) {
    finder.storyPose=thief.storyPose=accomplice.storyPose=null;
    targets.clear();
    state.phase='idle'; state.door=state.evidence=state.cache.open=0;
    state.finder=state.thief=state.accomplice=null;
    state.beacons.call=state.beacons.reply=null;
    state.beacons.acknowledged=false;
    state.beacons.thief.pulse=state.beacons.accomplice.pulse=0;
    if (completed) state.count++;
    nextAt=time+(completed ? 75 : 10);
  }
  function face(b,target,dt) {
    b.yaw+=angle(b.yaw,bearing(b,target))*Math.min(1,dt*5);
  }
  function addressed(message,from,to,code) {
    return message?.from===from.id && message.to===to.id && message.code===code;
  }
  function exchangeSignals(age) {
    const signals=state.beacons, code=signals.code;
    if (!signals.call && age>=callAt) signals.call={from:accomplice.id,to:thief.id,code};
    if (!signals.reply && age>=replyAt && addressed(signals.call,accomplice,thief,code)) {
      signals.reply={from:thief.id,to:accomplice.id,code:signals.call.code};
    }
    signals.accomplice.pulse=signals.call ? crowBeaconPulse(signals.call.code,age-callAt) : 0;
    signals.thief.pulse=signals.reply ? crowBeaconPulse(signals.reply.code,age-replyAt) : 0;
    if (age>=replyAt+CROW_BEACON_DURATION && addressed(signals.reply,thief,accomplice,code)) {
      signals.acknowledged=true;
    }
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
    const age=time-began,k=state.key,f=finder.storyPose,t=thief.storyPose,a=accomplice.storyPose;
    if (state.phase==='approach') {
      if ([finder,thief,accomplice].every(b=>b.y<.34 && gap(b,targets.get(b.id))<.39)) {
        state.phase='knock'; began=time;
      } else if (age>8) clear(time,false);
      return;
    }
    state.elapsed=age;
    face(finder,state,dt);
    if (age<6.6) face(thief,state,dt);
    else if (age>=8.55 && gap(thief,rendezvous)<.45) face(thief,accomplice,dt);
    // The lookout checks the yard; only the thief answers its ankle light.
    const passingKey=age>=8.55 && (handoffAt===null || age-handoffAt<.8);
    face(accomplice,age<3.8 ? leader : age<6.1 || passingKey ? thief : state.cache,dt);
    a.glance=.64*beat(age,.1,1.5)-.62*beat(age,1.65,1.5);
    exchangeSignals(age);
    f.dip=.99*(beat(age,.3,.6)+beat(age,1.32,.6)+beat(age,8.4,.65));
    t.glance=.45*beat(age,.7,1.65);
    // The finder follows the false bird into the sky, then pecks where it vanishes.
    f.glance=.48*beat(age,6.05,1.85)-.34*beat(age,7.9,1.55);
    if (age>6.6) f.wings=.40*beat(age,6.6,1.65);
    if (age<2.1) {
      k.y=.073+.07*(beat(age,.52,.46)+beat(age,1.56,.5));
      return;
    }
    const lift=smooth((age-2.1)/1.1);
    state.door=smooth((age-3.55)/1.45)*(1-smooth((age-7.3)/.52));
    k.y=.073+.38*lift; k.tilt=lift*Math.PI/2;
    k.turn=smooth((age-3.1)/1.15)*Math.PI;
    if (!state.beacons.acknowledged || age<5.65) {
      state.phase='unlock';
      f.wings=.68*beat(age,3.6,1.1);
      if (age>6.6) clear(time,false);
      return;
    }
    const beak=offset(thief,thief.yaw,0,.34);
    state.evidence=smooth((age-5.78)/.47);
    if (age<6.6) {
      state.phase='steal';
      const reach=smooth((age-5.65)/.95);
      k.x=state.x+(beak.x-state.x)*reach;
      k.z=state.z+(beak.z-state.z)*reach;
      k.y+=(thief.y+.08-k.y)*reach;
      return;
    }
    if (!escapeFrom) {
      state.phase='escape'; targets.set(thief.id,escape);
      escapeFrom={x:k.x,y:k.y,z:k.z};
    }
    t.hop=.15*beat(age,6.64,.63); t.wings=.85*beat(age,6.62,.7);
    const catchUp=smooth((age-6.6)/.3);
    k.x=escapeFrom.x+(beak.x-escapeFrom.x)*catchUp;
    k.z=escapeFrom.z+(beak.z-escapeFrom.z)*catchUp;
    k.y=escapeFrom.y+(thief.y+.08+t.hop-escapeFrom.y)*catchUp;
    k.turn+=angle(state.yaw,thief.yaw)*catchUp; k.tilt=1.0+.15*Math.sin(age*6);
    if (age<8.55) return;
    if (state.phase==='escape') {
      state.phase='handoff'; targets.set(thief.id,rendezvous);
    }
    if (handoffAt===null) {
      if (age>9.6 && gap(thief,accomplice)<1.05 && thief.speed<.45) handoffAt=age;
      else if (age>15) clear(time,false);
      return;
    }
    const exchanged=age-handoffAt;
    const passing=smooth(exchanged/.8), hiding=smooth((exchanged-1.35)/1.1);
    const receiver=offset(accomplice,accomplice.yaw,0,.34);
    a.dip=.42*beat(exchanged,.12,.9)+.92*beat(exchanged,1.2,1.5);
    const tipY=accomplice.y+.08-.10*a.dip;
    k.x+=(receiver.x-k.x)*passing;
    k.z+=(receiver.z-k.z)*passing;
    k.y+=(tipY-k.y)*passing;
    k.turn+=angle(thief.yaw,accomplice.yaw)*passing;
    if (exchanged<.8) return;
    state.phase='stash';
    state.cache.open=smooth((exchanged-.8)/.57)*(1-smooth((exchanged-2.53)/.67));
    k.x+=(state.cache.x-k.x)*hiding; k.z+=(state.cache.z-k.z)*hiding;
    k.y+=(-.10-k.y)*hiding; k.tilt*=1-hiding;
    k.scale=1-smooth((hiding-.78)/.22);
    // The finder inspects the broken seal while the accomplice shuts the lid.
    f.dip+=.93*beat(exchanged,2.6,.73);
    if (exchanged>3.8) clear(time,true);
  }
  return {state,targets,update};
}
