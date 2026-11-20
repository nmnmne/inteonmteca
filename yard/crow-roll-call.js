const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const bearing = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
const pulse = (age, start, length) => Math.sin(Math.PI * clamp((age - start) / length, 0, 1)) ** 2;

// The leader is the camera. A wingmate must see that camera turn towards it,
// catch its eye, and answer the leader's nod before another bird is addressed.
export function createCrowRollCall(birds) {
  const leader = birds[0];
  const state = {phase:'idle', targetId:null, answered:[], held:0, yaw:0, pitch:0, tilt:0};
  let target = null, age = 0, landing = 0;

  function release() {
    if (target) target.gazePose = null;
    target = null;
    state.targetId = null;
    state.held = state.tilt = age = 0;
  }
  function reset() {
    release();
    state.phase = 'idle';
    state.answered.length = 0;
    landing++;
  }
  function select() {
    let best = Infinity;
    for (const bird of birds) {
      if (!bird.called || !bird.inParty || bird.airborne > .2 || state.answered.includes(bird.id)) continue;
      const offAxis = Math.abs(turn(leader.yaw, bearing(leader, bird)));
      if (offAxis < best) { target = bird; best = offAxis; }
    }
    if (!target) return;
    target.gazePose = {glance:0, dip:0, wingTip:0, hop:0, wings:0};
    state.targetId = target.id;
    state.phase = 'look';
  }
  function update(dt, pose, targetSize) {
    if (state.phase === 'done') return;
    if (target && (!target.called || !target.inParty)) {
      release();
      state.phase = 'idle';
    }
    if (!target) select();
    if (!target) return;

    const bird = target, gesture = bird.gazePose;
    const back = bearing(bird, leader);
    bird.yaw += clamp(turn(bird.yaw, back), -2.8*dt, 2.8*dt);
    // Cock the beak slightly to present the nearer of the two lateral eyes.
    const eyeSide = bird.slot % 2 ? 1 : -1;
    const head = clamp(turn(bird.yaw, back - eyeSide*.10), -.93, .93);
    gesture.glance += clamp(head - gesture.glance, -5.2*dt, 5.2*dt);
    const face = bird.yaw + gesture.glance;
    const eyeX = bird.x + .20*Math.sin(face) + eyeSide*.063*Math.cos(face);
    const eyeZ = bird.z - .20*Math.cos(face) + eyeSide*.063*Math.sin(face);
    const eyeY = bird.y + .12 + gesture.hop;
    const dx = eyeX - leader.x, dz = eyeZ - leader.z;
    state.yaw = Math.atan2(dx, -dz);
    const pitch = Math.atan2(eyeY - leader.y, Math.hypot(dx, dz));
    state.pitch = pitch;
    const aligned = Math.abs(turn(pose.yaw, state.yaw)) < .115 && Math.abs(pose.pitch - pitch) < .09
      && Math.abs(turn(face, back)) < .16 && Math.abs(gesture.dip - pitch) < .12 && bird.airborne < .2;
    gesture.dip = pitch; // The receiver raises its beak towards the higher camera eye.
    state.held = aligned ? state.held + dt : 0;
    age += dt;

    if (state.phase === 'look') {
      if (state.held >= .32) { state.phase = 'signal'; age = 0; }
      return;
    }
    // Once per gathering the leader fakes a second bow with a cocked head.
    const feint = state.answered.length === (landing - 1) % (targetSize - 1);
    if (state.phase === 'signal') {
      state.pitch -= .103*pulse(age, 0, .4) + (feint ? .066*pulse(age, .39, .30) : 0);
      state.tilt = (bird.slot % 2 ? -1 : 1) * (feint ? .083 : .038) * pulse(age, .04, feint ? .65 : .39);
      if (age >= (feint ? .73 : .48)) { state.phase = 'reply'; age = state.tilt = 0; }
      return;
    }
    const beat = pulse(age, .03, .45), answer = (bird.id + landing) % 3;
    gesture.dip += (answer === 0 ? .42 : .23) * beat;
    gesture.wingTip = (bird.slot % 2 ? -1 : 1) * (answer === 1 ? .93 : .46) * beat;
    gesture.hop = answer === 2 ? .13 * beat : 0;
    // Wait for both faces to settle again after the reply, even if a neighbour
    // bumped the receiver or the camera was still following the hop.
    if (age < .73 || state.held < .18) return;
    state.answered.push(bird.id);
    release();
    state.phase = state.answered.length === targetSize - 1 ? 'done' : 'idle';
  }
  return {state, reset, update};
}
