const beat = 670, nod = 410;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function available(bird, flock) {
  const elapsed = flock.allBirds[0].elapsed ?? 0;
  const call = elapsed - (bird.musicReplyAt ?? -Infinity);
  const laugh = elapsed - (bird.laughAt ?? -Infinity);
  return bird.id !== 0 && !bird.storyPose && !bird.gazePose && !bird.encounterPose && !bird.prankPose && !bird.flightPose
    && bird.id !== flock.beacons?.sender.id && bird.id !== flock.beacons?.recipient.id
    && (call < -.5 || call > .45) && (laugh < -.5 || laugh > .65);
}

export function crowAuthorityBusy(bird, now = performance.now()) {
  return now < (bird.authorityFocus?.until ?? 0) || (bird.authoritySignal
    ? now < bird.authoritySignal.start + (bird.authoritySignal.count - 1) * beat + nod : false);
}

export function crowAuthorityPulse(bird, now = performance.now()) {
  const signal = bird.authoritySignal;
  if (!signal) return 0;
  const age = now - signal.start;
  if (age < 0 || age >= (signal.count - 1) * beat + nod) return 0;
  const stroke = age % beat;
  return stroke < nod ? Math.sin(Math.PI * stroke / nod) ** 2 : 0;
}

export function crowAuthorityLook(bird, now) {
  const focus = bird.authorityFocus;
  if (!focus || now < focus.since || now >= focus.until) return 0;
  const bearing = Math.atan2(focus.x - bird.x, bird.z - focus.z) - bird.yaw;
  const angle = Math.atan2(Math.sin(bearing), Math.cos(bearing));
  const weight = Math.min(1, (now - focus.since) / 450, (focus.until - now) / 450);
  return Math.max(-.83, Math.min(.83, angle)) * weight;
}

// The birds notice one another, exchange a double gesture, then pass a quieter
// signal through their neighbours. Only their own locations and roles matter.
export function createCrowAuthority(flock, random = Math.random) {
  const birds = flock.allBirds;
  const range = (min, max) => min + random() * (max - min);
  let phase = 'rest', nextAt, lastFrame, caller, partner, lastCaller;
  function rest(now, delay) {
    for (const bird of birds) {
      if (bird.authorityFocus) delete bird.authorityFocus;
      if (bird.authoritySignal) delete bird.authoritySignal;
    }
    phase = 'rest';
    caller = partner = null;
    nextAt = now + delay;
  }

  function notice(now) {
    const free = birds.filter(bird => available(bird, flock));
    const pairs = free.filter(bird => bird.id !== lastCaller && free.some(other => other !== bird && distance(bird, other) < 17))
      .sort((a, b) => distance(a, birds[0]) - distance(b, birds[0]));
    if (!pairs.length) return false;
    caller = pairs[Math.floor(random() * Math.min(4, pairs.length))];
    const neighbours = free.filter(bird => bird !== caller && distance(bird, caller) < 17)
      .sort((a, b) => distance(a, caller) - distance(b, caller));
    partner = neighbours[Math.floor(random() * Math.min(3, neighbours.length))];
    lastCaller = caller.id;
    const until = now + 3400;
    caller.authorityFocus = {peerId:partner.id, x:partner.x, z:partner.z, since:now, until};
    partner.authorityFocus = {peerId:caller.id, x:caller.x, z:caller.z, since:now, until};
    phase = 'notice';
    nextAt = now + 820;
    return true;
  }

  function update(now, outdoors) {
    if (!outdoors || (lastFrame !== undefined && now - lastFrame > 6500)) {
      if (phase !== 'rest') rest(now, range(5300, 10000));
      else nextAt = undefined;
      lastFrame = now;
      return;
    }
    lastFrame = now;
    if (nextAt === undefined) nextAt = now + range(5000, 10000);
    if (phase !== 'rest' && phase !== 'wave') {
      if (!available(caller, flock) || !available(partner, flock) || distance(caller, partner) > 25) {
        rest(now, range(2800, 6500));
        return;
      }
      caller.authorityFocus.x = partner.x; caller.authorityFocus.z = partner.z;
      partner.authorityFocus.x = caller.x; partner.authorityFocus.z = caller.z;
    }
    if (now < nextAt) return;
    if (phase === 'rest') {
      if (!notice(now)) nextAt = now + range(2400, 5200);
    } else if (phase === 'notice') {
      caller.authoritySignal = {start:now, count:2};
      phase = 'call';
      nextAt = now + beat + nod + 210;
    } else if (phase === 'call') {
      partner.authoritySignal = {start:now, count:2};
      phase = 'reply';
      nextAt = now + beat + nod + 210;
    } else if (phase === 'reply') {
      const neighbours = birds.filter(bird => bird !== partner && bird !== caller
        && available(bird, flock) && distance(bird, partner) < 35);
      neighbours.sort((a, b) => distance(a, partner) - distance(b, partner));
      neighbours.forEach((bird, i) => { bird.authoritySignal = {start:now + i * 140, count:1}; });
      phase = 'wave';
      nextAt = now + nod + 140 * neighbours.length;
    } else {
      rest(now, range(22000, 45000));
    }
  }
  return {update};
}
