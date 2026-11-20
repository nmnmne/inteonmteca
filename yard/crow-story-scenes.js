import { CROW_BEACON_DURATION, crowBeaconPulse } from './crow-beacon-code.js';

const durations = {
  opening: {knock: 3.8, cache: 4.4, beacon: 4.2, echo: 4.2},
  middle: {ripple: 3.2, lookout: 4.8, echo: 3.8, relay: 3.5, footprints: 4.1, decoy: 4.3},
  ending: {stash: 5.4, return: 4.8, portal: 4.7, gift: 4.9}
};

function ease(t, start, end) {
  const p = Math.max(0, Math.min(1, (t-start)/(end-start)));
  return p*p*(3-2*p);
}

function crest(t, start, end) {
  return Math.sin(Math.PI*ease(t,start,end))**2;
}

function beak(bird) {
  return {x: bird.x + Math.sin(bird.yaw)*.34, z: bird.z - Math.cos(bird.yaw)*.34,
    y: bird.y+.08+bird.storyPose.hop-.10*bird.storyPose.dip};
}

function moveKey(key, from, to, t, arc=0) {
  key.x = from.x+(to.x-from.x)*t;
  key.y = from.y+(to.y-from.y)*t + Math.sin(Math.PI*t)*arc;
  key.z = from.z+(to.z-from.z)*t;
}

function resetPose(pose) {
  pose.dip = pose.glance = pose.wings = pose.hop = 0;
}

// Every middle scene begins and ends with the key on the same mark. This lets
// a different bird investigate each clue without a cut in the brass key's path.
export function createCrowStoryPerformance(plan, state, finder, thief, lookout, stage, targets, face) {
  const scenes = [
    {phase:'opening', id:plan.opening},
    ...plan.middle.map(id => ({phase:'middle', id})),
    {phase:'ending', id:plan.ending}
  ];
  let end = 0;
  for (const scene of scenes) {
    scene.start = end;
    end += durations[scene.phase][scene.id];
    scene.end = end;
  }
  const ground = {x:stage.mark.x, y:.073, z:stage.mark.z};
  const recess = {x:stage.cache.x, y:-.10, z:stage.cache.z};
  const lock = {x:ground.x+.19*Math.sin(state.yaw), y:.53, z:ground.z-.19*Math.cos(state.yaw)};
  const f = finder.storyPose, t = thief.storyPose, a = lookout.storyPose;
  const signals = state.beacons, k = state.key;

  function exchange(seconds) {
    const replyAt = 1.46;
    signals.accomplice.pulse = crowBeaconPulse(signals.code, seconds);
    signals.thief.pulse = crowBeaconPulse(signals.code, seconds-replyAt);
    if (seconds>=0 && !signals.call) signals.call = {from:lookout.id, to:thief.id, code:signals.code};
    if (seconds>=replyAt && !signals.reply) signals.reply = {from:thief.id, to:lookout.id, code:signals.code};
    signals.acknowledged = seconds>=replyAt+CROW_BEACON_DURATION;
  }

  function opening(id,p) {
    switch (id) {
      case 'knock':
        f.dip = crest(p,.05,.27)+crest(p,.30,.52);
        k.y += .10*(crest(p,.16,.31)+crest(p,.41,.57));
        state.door = .68*crest(p,.47,.98);
        t.wings = .48*crest(p,.52,.92);
        break;
      case 'cache': {
        a.dip = .9*crest(p,0,.38);
        state.cache.open = ease(p,.02,.28)*(1-ease(p,.61,.88));
        const draw = ease(p,.24,.83);
        moveKey(k,recess,ground,draw,.34);
        k.scale = ease(p,.22,.37);
        k.tilt = .95*Math.sin(Math.PI*draw);
        f.dip = .64*crest(p,.77,.98);
        break;
      }
      case 'beacon':
        exchange(p*durations.opening.beacon-.16);
        k.scale = ease(p,.60,.78);
        k.y += .22*crest(p,.62,.95);
        a.glance = -.52*crest(p,0,.48);
        t.wings = .66*crest(p,.60,.94);
        break;
      case 'echo': {
        state.door = ease(p,0,.25)*(1-ease(p,.64,.95));
        state.echoScale = ease(p,.10,.28)*(1-ease(p,.39,.55));
        const drop = ease(p,.42,.87);
        k.scale = ease(p,.39,.51);
        moveKey(k,lock,ground,drop,.09);
        k.tilt = 1.5*(1-drop);
        f.wings = .72*crest(p,.32,.70);
        break;
      }
    }
  }

  function middle(id,p,seconds,dt) {
    switch (id) {
      case 'ripple':
        f.dip = crest(p,0,.31);
        state.ripple = ease(p,.17,.94);
        t.hop = .14*crest(p,.40,.69);
        a.hop = .13*crest(p,.53,.82);
        break;
      case 'lookout': {
        const patrolling = p>.07 && p<.52;
        targets.set(lookout.id,patrolling ? stage.meeting : stage.lookout);
        if (patrolling) face(lookout,stage.meeting,dt);
        a.glance = .87*crest(p,.18,.54)-.80*crest(p,.56,.94);
        t.wings = .82*crest(p,.16,.85);
        t.dip = .68*crest(p,.23,.81);
        break;
      }
      case 'echo':
        state.door = ease(p,.05,.28)*(1-ease(p,.70,.96));
        state.echoScale = crest(p,.24,.84);
        k.y += .32*crest(p,.19,.88);
        k.tilt = 1.4*crest(p,.20,.88);
        f.glance = .58*crest(p,.29,.67);
        break;
      case 'relay':
        exchange(seconds-.23);
        face(thief,lookout,dt);
        face(lookout,thief,dt);
        a.dip = .58*crest(p,.06,.30);
        t.dip = .63*crest(p,.48,.76);
        k.turn = .7*crest(p,.72,.99);
        break;
      case 'footprints':
        state.footprints = ease(p,.04,.94);
        f.dip = .65*crest(p,.05,.35);
        t.dip = .65*crest(p,.26,.55);
        a.dip = .70*crest(p,.50,.79);
        face(lookout,stage.cache,dt);
        state.cache.open = .28*crest(p,.62,.95);
        break;
      case 'decoy':
        state.constellationAge = 5.55+4*p;
        f.glance = -.62*crest(p,.21,.85);
        t.wings = .85*crest(p,.31,.83);
        a.hop = .16*crest(p,.41,.73);
        break;
    }
  }

  function ending(id,p,seconds,dt) {
    switch (id) {
      case 'stash': {
        t.dip = .85*crest(p,.01,.25);
        a.dip = .75*crest(p,.38,.62);
        face(thief,lookout,dt);
        face(lookout,thief,dt);
        const giver = beak(thief), receiver = beak(lookout);
        if (p<.29) moveKey(k,ground,giver,ease(p,.08,.26),.08);
        else if (p<.58) moveKey(k,giver,receiver,ease(p,.29,.56),.14);
        else moveKey(k,receiver,recess,ease(p,.60,.82),.08);
        state.cache.open = ease(p,.41,.60)*(1-ease(p,.82,.95));
        k.scale = 1-ease(p,.76,.83);
        f.dip = .88*crest(p,.82,.99);
        break;
      }
      case 'return': {
        const turn = ease(p,.31,.57);
        f.dip = .87*crest(p,.02,.32);
        state.evidence = ease(p,0,.18)*(1-turn);
        state.door = ease(p,.12,.32)*(1-ease(p,.57,.79));
        if (p<.55) moveKey(k,ground,lock,ease(p,.09,.34));
        else moveKey(k,lock,ground,ease(p,.58,.86));
        k.tilt = Math.PI*.5*ease(p,.10,.35)*(1-ease(p,.59,.86));
        k.turn = Math.PI*turn;
        a.dip = .65*crest(p,.82,.99);
        break;
      }
      case 'portal': {
        const pass = ease(p,.22,.71);
        state.door = ease(p,.02,.33)*(1-ease(p,.77,.98));
        moveKey(k,ground,lock,pass,.16);
        k.tilt = 1.54*pass;
        k.scale = 1-ease(p,.55,.73);
        state.constellationAge = p>=.59 ? 5.55+4*ease(p,.59,1) : 0;
        f.wings = .63*crest(p,.50,.91);
        break;
      }
      case 'gift': {
        f.dip = .77*crest(p,.40,.69);
        const receive = ease(p,.24,.63);
        moveKey(k,ground,beak(finder),receive,.14);
        k.tilt = .97*receive;
        t.dip = .88*crest(p,.61,.89);
        a.dip = .80*crest(p,.70,.98);
        exchange(seconds-.22);
        break;
      }
    }
  }

  function update(age,dt) {
    if (age>=end) return true;
    const index = scenes.findIndex(scene => age<scene.end);
    const scene = scenes[index];
    const seconds = age-scene.start, p = seconds/(scene.end-scene.start);
    if (state.sceneIndex!==index) {
      state.sceneIndex = index;
      state.phase = scene.phase;
      state.scene = scene.id;
      targets.set(lookout.id,stage.lookout);
      signals.call = signals.reply = null;
      signals.acknowledged = false;
    }
    resetPose(f); resetPose(t); resetPose(a);
    Object.assign(k,ground,{scale:1,turn:0,tilt:0});
    state.evidence = state.door = state.cache.open = 0;
    state.echoScale = state.constellationAge = state.ripple = state.footprints = 0;
    signals.accomplice.pulse = signals.thief.pulse = 0;
    face(finder,ground,dt); face(thief,ground,dt); face(lookout,ground,dt);
    if (scene.phase==='opening') opening(scene.id,p);
    else if (scene.phase==='middle') middle(scene.id,p,seconds,dt);
    else ending(scene.id,p,seconds,dt);
    return false;
  }
  return {update};
}
