const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

async function createRoute(seed, aspect = 390 / 844) {
  const {createAutoWalk, ambientOpeningView} = await import('../yard/auto-walk.js');
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const openingView = ambientOpeningView(layout, aspect);
  const flock = createCrowFlock(layout, openingView, {random});
  const walk = createAutoWalk(layout, {openingView, random, flock});
  return {walk, flock};
}

test('two neighbours frame the first-person opening in portrait and landscape', async () => {
  for (const aspect of [390 / 844, 1.6]) {
    const {walk, flock} = await createRoute(17, aspect);
    const {pose} = walk;
    assert.equal(flock.birds.length, 13);
    for (const b of flock.birds.slice(1, 3)) {
      const dx = b.x - pose.x, dz = b.z - pose.z;
      const ahead = dx * Math.sin(pose.yaw) - dz * Math.cos(pose.yaw);
      const side = dx * Math.cos(pose.yaw) + dz * Math.sin(pose.yaw);
      assert.ok(ahead > 3 && Math.abs(side / ahead) < aspect * Math.tan(pose.fov * Math.PI / 360));
    }
  }
});

test('the thirteen persistent crows elect elders, disperse and meet their physical quorum before each mission', async () => {
  const {isWalkable} = await import('../yard/navigation.js');
  const targets = new Set(), seniorCounts = new Set();
  let sawSolo = false, sawSplit = false, sawSearch = false, sawNewElders = false;
  for (const seed of [1, 4, 7, 10]) {
    const {walk, flock} = await createRoute(seed);
    const {state, birds} = flock;
    const roster = [...birds];
    let missions = 0, previousPhase = state.phase, previousSize = 1;
    let previousElders = '', previousLanding = 0;
    for (let frame = 0; frame < 3000 && missions < 5; frame++) {
      const pose = walk.update(.2);
      assert.equal(birds.filter(b => b.inParty).length, state.partySize);
      assert.deepEqual(birds.map(b => b.id), [0,1,2,3,4,5,6,7,8,9,10,11,12]);
      assert.ok(birds[0].inParty && birds[0].senior);
      assert.equal(birds[0].x, pose.x);
      assert.equal(birds[0].z, pose.z);
      const elders = birds.filter(b => b.senior).map(b => b.id);
      assert.equal(elders.length, state.seniorCount);
      if (previousLanding > 0 && state.landingCount === previousLanding) {
        assert.equal(elders.join(','), previousElders, 'ranks change at touchdown');
      } else if (state.landingCount) {
        sawNewElders ||= previousLanding > 0 && elders.join(',') !== previousElders;
        if (state.landingCount > 1) seniorCounts.add(elders.length);
      }
      previousLanding = state.landingCount;
      previousElders = elders.join(',');
      for (const b of birds.slice(1)) {
        assert.equal(b, roster[b.id], 'departing birds retain their identity');
        assert.ok(Number.isFinite(b.yaw) && Number.isFinite(b.bank));
        assert.ok(Math.hypot(b.x - pose.x, b.y - pose.y, b.z - pose.z) >= .84);
        if (b.y < .32) assert.ok(isWalkable(layout, b.x, b.z, .15), 'ground perch clears mapped obstacles');
      }
      if (state.missionCount !== missions) {
        assert.equal(state.missionCount, missions + 1);
        assert.equal(state.partySize, state.targetSize);
        assert.equal(previousPhase, 'ready', 'takeoff follows a sustained physical gathering');
        for (const b of birds.filter(b => b.id && b.inParty)) {
          assert.ok(Math.hypot(b.x - pose.x, b.z - pose.z) < 18 && b.y < 1.3);
        }
        targets.add(state.targetSize);
        missions++;
      }
      sawSolo ||= state.phase === 'gather' && state.partySize === 1;
      sawSearch ||= state.phase === 'gather' && Number.isFinite(state.searchYaw);
      sawSplit ||= state.phase === 'mission' && previousPhase === 'mission' && state.partySize < previousSize;
      previousSize = state.partySize;
      previousPhase = state.phase;
    }
    assert.equal(missions, 5, 'no stalled recruitment or camera route');
  }
  assert.ok(sawSolo && sawSplit && sawSearch && sawNewElders);
  assert.ok(targets.has(2) && targets.has(13));
  assert.ok(seniorCounts.size > 2);
});

test('flock decisions and poses agree at different display frame rates', async () => {
  const a = await createRoute(12), b = await createRoute(12);
  for (let i = 0; i < 1200; i++) {
    a.walk.update(1 / 15);
    for (let j = 0; j < 4; j++) b.walk.update(1 / 60);
  }
  assert.deepEqual(a.flock.state, b.flock.state);
  assert.deepEqual(a.flock.birds, b.flock.birds);
});

test('a flying leader can lose its entire party, then bring all twelve neighbours on another mission', async () => {
  const {walk, flock} = await createRoute(5);
  const {state, birds} = flock;
  let soloMission = 0, before = null, wandering = false, recruited = false;
  for (let i = 0; i < 2500; i++) {
    walk.update(.2);
    if (state.phase === 'mission' && state.partySize === 1) {
      if (!soloMission) {
        soloMission = state.missionCount;
        before = birds.slice(1).map(b => ({x: b.x, z: b.z}));
      }
      assert.ok(birds.slice(1).every(b => !b.inParty && !b.called));
      wandering ||= birds.slice(1).some((b, j) => Math.hypot(b.x - before[j].x, b.z - before[j].z) > .8);
    }
    if (soloMission && state.phase === 'gather' && state.partySize > 1) recruited = true;
    if (recruited && state.missionCount > soloMission && state.phase === 'mission' && state.partySize === 13) {
      assert.equal(state.targetSize, 13);
      assert.ok(wandering);
      return;
    }
  }
  assert.fail('solo flight must be followed by a new gathering and full-flock flight');
});
