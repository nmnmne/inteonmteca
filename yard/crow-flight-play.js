import { crowAuthorityBusy } from './crow-authority.js';

const angle = (yaw, target) => Math.atan2(Math.sin(target-yaw), Math.cos(target-yaw));
const pulse = (age, start, duration) => {
  const part = (age-start)/duration;
  return part>0 && part<1 ? Math.sin(Math.PI*part)**2 : 0;
};
const resting = () => ({roll:0, glance:0, wings:0, tail:0, dip:0});
export function createCrowFlightPlay(birds, reserved) {
  const state = {kind:null, actorId:null, partnerId:null, count:0};
  let actor, partner, began=0, nextAt=3, side=1, started=0, showedCue=false, answered=false;
  const flying = b => b.airborne>.68 && b.y>1.6 && !b.gazePose && !b.storyPose && !b.prankPose && !b.encounterPose
    && !crowAuthorityBusy(b) && !reserved?.(b.id);
  function start(time) {
    const flyers = birds.slice(1).filter(flying);
    let best=Infinity;
    for (let i=0; i<flyers.length; i++) for (let j=i+1; j<flyers.length; j++) {
      const a=flyers[i], b=flyers[j], gap=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
      // A pair flying together has time to watch a gesture and return it.
      if (gap<.85 || gap>6.5 || Math.abs(angle(a.yaw,b.yaw))>1.1) continue;
      const score=gap+.3*Math.hypot(a.x-birds[0].x,a.z-birds[0].z);
      if (score>=best) continue;
      best=score;
      if (started%2) { actor=b; partner=a; } else { actor=a; partner=b; }
    }
    if (!actor) return;
    const dx=partner.x-actor.x, dz=partner.z-actor.z;
    side=Math.sign(dx*Math.cos(actor.yaw)+dz*Math.sin(actor.yaw)) || 1;
    state.kind=started++%2 ? 'wing-mirror' : 'false-dive';
    state.actorId=actor.id; state.partnerId=partner.id;
    actor.flightPose=resting(); partner.flightPose=resting();
    began=time; showedCue=false; answered=false;
  }
  function finish(time, completed) {
    if (completed) {
      state.count++;
      // The response must finish before either bird chuckles. Some pairs fly on quietly.
      if ((actor.id+partner.id+state.count)%3!==0) {
        const amused=partner.personality.habits.sociability>.5 ? partner : actor;
        amused.laughAt=time;
      }
    }
    actor.flightPose=partner.flightPose=null;
    actor=partner=null;
    state.kind=state.actorId=state.partnerId=null;
    nextAt=time+(completed ? 14+(state.count*7)%11 : 2);
  }
  function update(time, inFlight) {
    if (!actor) {
      if (!inFlight || time<nextAt) return;
      nextAt=time+1.3; start(time);
      return;
    }
    if (!inFlight || !flying(actor) || !flying(partner)
        || Math.hypot(actor.x-partner.x,actor.y-partner.y,actor.z-partner.z)>9) {
      finish(time,false); return;
    }
    const age=time-began, a=actor.flightPose, b=partner.flightPose;
    if (state.kind==='false-dive') {
      const dive=pulse(age,.10,.75), brake=pulse(age,.72,.6);
      const copy=pulse(age,.97,.72), surprise=pulse(age,1.55,.64);
      a.dip=.50*dive-.16*brake; a.tail=.48*brake; a.wings=.60*brake;
      a.roll=side*.22*dive; a.glance=side*.72*pulse(age,1.28,.85);
      b.glance=-side*.70*(pulse(age,.25,.6)+surprise); b.dip=.44*copy-.15*surprise;
      b.tail=.63*surprise; b.wings=.83*surprise; b.roll=-side*.23*surprise;
    } else {
      const rock=t=>pulse(t,.08,.47)-pulse(t,.66,.54);
      const cue=rock(age), echo=rock(age-.86);
      a.roll=side*.49*cue; a.glance=side*.65*pulse(age,1.37,.79);
      a.wings=.71*Math.abs(cue); a.tail=.29*Math.abs(cue);
      b.roll=side*.49*echo; b.glance=-side*.73*pulse(age,.16,.62);
      b.wings=.71*Math.abs(echo); b.tail=.29*Math.abs(echo);
    }
    if (age<.85 && Math.max(Math.abs(a.roll),Math.abs(a.dip))>.075) showedCue=true;
    if (showedCue && age>.85 && Math.max(Math.abs(b.roll),Math.abs(b.dip))>.075) answered=true;
    if (age>=2.28) finish(time,answered);
  }
  return {state,update};
}
