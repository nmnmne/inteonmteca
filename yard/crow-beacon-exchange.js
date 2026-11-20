import {crowBeaconCode, crowBeaconPulse, CROW_BEACON_DURATION} from './crow-beacon-code.js';

// Two neighbours exchange their address without interrupting their normal movement.
export function createCrowBeaconExchange(birds, clearGround, occupied) {
  const leader = birds[0], replyAt = CROW_BEACON_DURATION + .46;
  let exchange = null, sender, recipient, began = 0, nextAt = 6, episode = 0;
  const eligible = bird => bird.airborne < .14 && bird.y < .35 && !occupied.has(bird.id);
  const distance = (a,b) => Math.hypot(b.x-a.x,b.z-a.z);

  // Project the ankle into the walker's YXZ camera, including its bank in turns.
  // Leave room for the bird to step and the short beam to span a few pixels.
  function visible(bird,view,margin) {
    const dx=bird.x-view.x, dy=bird.y-.145-view.y, dz=bird.z-view.z;
    const sy=Math.sin(view.yaw), cy=Math.cos(view.yaw);
    const sp=Math.sin(view.pitch || 0), cp=Math.cos(view.pitch || 0);
    const sr=Math.sin(view.roll || 0), cr=Math.cos(view.roll || 0);
    const side=dx*cy+dz*sy, ahead=dx*sy-dz*cy;
    const up=dy*cp-ahead*sp, depth=dy*sp+ahead*cp;
    const height=depth*Math.tan((view.fov ?? 64)*Math.PI/360);
    return depth>1 && depth<15 && Math.abs(side*cr+up*sr)<height*(view.aspect ?? 1.6)*margin
      && Math.abs(up*cr-side*sr)<height*margin;
  }

  function choose(view) {
    const nearby = birds.slice(1).filter(bird => {
      return eligible(bird) && bird.speed<=.8 && visible(bird,view,.82);
    });
    let best = Infinity, pair = null;
    for (let i=0; i<nearby.length; i++) {
      for (let j=i+1; j<nearby.length; j++) {
        const a = nearby[i], b = nearby[j], span = distance(a,b);
        if (span < .6 || span > 6) continue;
        // Prefer a close pair, rotating priority when several share the same perch.
        const score = distance(leader,a)+distance(leader,b)+span+(a.id*3+b.id+episode*5)%7;
        if (score >= best) continue;
        const steps = Math.ceil(span/.5);
        let clear = true;
        for (let step=1; step<steps; step++) {
          if (!clearGround(a.x+(b.x-a.x)*step/steps,a.z+(b.z-a.z)*step/steps)) { clear=false; break; }
        }
        if (clear) { pair = episode % 2 ? [b,a] : [a,b]; best = score; }
      }
    }
    return pair;
  }

  function update(time, enabled, view=leader) {
    if (!enabled || leader.y > 3.5) {
      exchange = null;
      nextAt = Math.max(nextAt,time+2);
      return;
    }
    if (!exchange) {
      if (time < nextAt) return;
      nextAt = time + 1.5;
      const pair = choose(view);
      if (!pair) return;
      [sender,recipient] = pair;
      began = time;
      const code = crowBeaconCode(sender.id,recipient.id,++episode);
      exchange = {sender:{id:sender.id}, recipient:{id:recipient.id}, code};
    }
    const age = time-began;
    if (!visible(sender,view,.93) || !visible(recipient,view,.93)) {
      exchange = null;
      nextAt = time+1.5;
      return;
    }
    if (age >= replyAt+CROW_BEACON_DURATION || !eligible(sender) || !eligible(recipient) || distance(sender,recipient)>7) {
      exchange = null;
      nextAt = time + 20 + (episode * 7) % 18;
      return;
    }
    exchange.sender.pulse = crowBeaconPulse(exchange.code,age);
    exchange.recipient.pulse = crowBeaconPulse(exchange.code,age-replyAt);
  }
  return {update, get current() { return exchange; }};
}
