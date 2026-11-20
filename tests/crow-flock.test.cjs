const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

async function createRoute(seed, aspect = 390 / 844, residentVisits = false) {
  const {createAutoWalk, ambientOpeningView} = await import('../yard/auto-walk.js');
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const openingView = ambientOpeningView(layout, aspect);
  const flock = createCrowFlock(layout, openingView, {random, residentVisits});
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
  for (let seed = 1; seed <= 12; seed++) {
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

test('one wingmate leaves with the leader while another waits twenty seconds at the same perch', async () => {
  const {walk, flock} = await createRoute(17);
  const {state, birds} = flock;
  for (let tick = 0; tick < 1200 && !state.missionCount; tick++) walk.update(.1);
  assert.ok(state.missionCount === 1 && state.targetSize >= 3, 'the first mission has at least two wingmates');
  const party = birds.slice(1).filter(b => b.inParty).sort((a,b) => a.launchAt - b.launchAt);
  const first = party[0], last = party.at(-1);
  const origin = {x:last.x,z:last.z};
  let firstLift = null, lateLift = null, groundDistance = 0, approach = 0;
  for (let tick = 1; tick <= 260; tick++) {
    const age = tick / 10;
    const fromLeaderX = birds[0].x - last.x, fromLeaderZ = birds[0].z - last.z;
    const x = last.x, z = last.z;
    walk.update(.1);
    if (first.y > 1.1 && firstLift === null) firstLift = age;
    if (last.y > 1.1 && lateLift === null) lateLift = age;
    if (age < 19.8) {
      assert.ok(last.inParty && last.y < .85, 'the late crow really stays grounded');
      groundDistance = Math.max(groundDistance, Math.hypot(last.x-origin.x,last.z-origin.z));
    }
    if (age > 20 && last.inParty) {
      const gap = Math.hypot(fromLeaderX,fromLeaderZ);
      if (gap > 1) approach += ((last.x-x)*fromLeaderX + (last.z-z)*fromLeaderZ) / gap;
    }
  }
  assert.ok(firstLift > 0 && firstLift < 4, 'the first companion climbs with the camera');
  assert.ok(groundDistance < 2, 'the delayed bird stays by its own takeoff point');
  assert.ok(lateLift >= 19.8 && lateLift < 23 && approach > 4, 'the late bird takes off and flies towards its flock');
});

test('a bird already in flight can peel away from the leader and continue flying on its own', async () => {
  const {walk, flock} = await createRoute(5);
  const {birds, state} = flock;
  for (let tick = 0; tick < 4000; tick++) {
    const airborneParty = birds.slice(1).filter(b => b.inParty && b.y > 2);
    walk.update(.1);
    const leaver = airborneParty.find(b => state.phase === 'mission' && !b.called && !b.inParty && b.breakUntil > 0);
    if (!leaver) continue;
    const start = {x:leaver.x,z:leaver.z};
    const dx = leaver.x-birds[0].x, dz = leaver.z-birds[0].z;
    for (let step = 0; step < 15; step++) {
      walk.update(.1);
      assert.ok(!leaver.inParty && leaver.y > .85, 'separation begins as a flight, not an instant landing');
    }
    assert.ok(Math.hypot(leaver.x-start.x,leaver.z-start.z) > 2);
    assert.ok(Math.hypot(leaver.x-birds[0].x-dx,leaver.z-birds[0].z-dz) > 1.5, 'the escaping path diverges from the moving formation');
    return;
  }
  assert.fail('the flock never produced an airborne breakaway');
});

test('two ground crows approach, feint and respond, then release their poses and carry on', async () => {
  const {walk, flock} = await createRoute(7, 1.6, true);
  const {birds, prank, visit} = flock;
  let episode, finished = false, previousPhase = 'idle';
  for (let frame = 0; frame < 14000; frame++) {
    walk.update(.05);
    if (prank.phase === 'idle') {
      assert.ok(birds.every(b => !b.prankPose));
      if (episode?.reacted && previousPhase === 'retreat') {
        assert.ok(episode.dipped && episode.initialGap - episode.closest > .15, 'a real approach precedes the feint');
        finished = true;
        break;
      }
      episode = null;
    } else {
      const actor = birds[prank.actorId], partner = birds[prank.partnerId];
      assert.ok(actor.id > 0 && partner.id > 0 && actor !== partner);
      assert.ok(actor.y < .85 && partner.y < .85);
      if (['approach','sitting'].includes(visit.phase)) {
        assert.ok(!visit.birds.includes(actor.id) && !visit.birds.includes(partner.id));
      }
      const gap = Math.hypot(actor.x-partner.x,actor.z-partner.z);
      if (!episode) {
        assert.equal(prank.phase, 'approach');
        episode = {initialGap:gap,closest:gap,dipped:false,reacted:false};
      }
      episode.closest = Math.min(episode.closest,gap);
      if (prank.phase === 'feint') {
        episode.dipped ||= actor.prankPose?.dip > .5;
        episode.reacted ||= episode.dipped && partner.prankPose?.hop > .12 && partner.prankPose?.wings > .4;
      }
    }
    previousPhase = prank.phase;
  }
  assert.ok(finished, 'a paired prank with a reaction and retreat should finish on the real route');
});

test('the resident and existing crows take turns visiting a real perch, sit, then release the flock', async () => {
  const {isWalkable, pointInRing} = await import('../yard/navigation.js');
  const {walk, flock} = await createRoute(7, 390 / 844, true);
  const {visit, birds, state} = flock, roster = [...birds];
  const completed = [];
  let previous = 'idle', origin, approach, sitting = 0, mission = 0;
  for (let tick = 0; tick < 6000; tick++) {
    walk.update(.1);
    const partners = visit.birds.map(id => birds[id]);
    assert.equal(birds.length, 13);
    assert.ok(birds.every((b,i) => b === roster[i]));
    assert.equal(visit.y, 0);
    assert.ok(visit.amount >= 0 && visit.amount <= 1);
    if (visit.phase !== 'idle') {
      assert.ok(pointInRing(visit.x, visit.z, layout.walkable) && isWalkable(layout,visit.x,visit.z,.16));
      assert.equal(new Set(visit.birds).size, partners.length);
      assert.ok(partners.length > 0 && partners.every(b => b.id > 0));
      assert.equal(flock.canTakeOff(), false);
    }
    if (visit.phase === 'approach' && previous === 'idle') {
      approach = new Map(partners.map(b => [b.id,{x:b.x,z:b.z}]));
      origin = {x:visit.x,z:visit.z};
      sitting = 0;
    }
    if (visit.phase === 'sitting') {
      const travel = Math.hypot(visit.x-origin.x, visit.z-origin.z);
      const facing = Math.atan2(birds[0].x-visit.x,birds[0].z-visit.z);
      assert.ok(Math.cos(visit.yaw-facing) > .78,'the camera crow sees the resident during its glance');
      assert.equal(visit.amount, 1);
      if (visit.kind === 'resident') {
        assert.ok(travel > 1.3);
        assert.ok(partners.every(b => Math.hypot(b.x-approach.get(b.id).x,b.z-approach.get(b.id).z)<.36));
      } else {
        assert.ok(travel < .001);
        assert.ok(partners.every(b => Math.hypot(b.x-approach.get(b.id).x,b.z-approach.get(b.id).z)>2));
      }
      for (const b of partners) {
        assert.equal(b.mode,'perch');
        const gap = Math.hypot(b.x-visit.x,b.z-visit.z);
        assert.ok(gap > .35 && gap < 1.3);
      }
      sitting += .1;
    }
    if (visit.phase === 'leaving' && previous === 'sitting') {
      assert.ok(sitting >= 5.9 && sitting <= 10.1);
      completed.push(visit.kind);
      mission = state.missionCount;
    }
    if (completed.length >= 2 && state.missionCount > mission) break;
    previous = visit.phase;
  }
  assert.deepEqual(completed,['resident','crows']);
  assert.ok(state.missionCount > mission);
  assert.equal(visit.phase,'idle');
  assert.equal(visit.amount,0);
  assert.equal(visit.kind,null);
});

test('losing a rendezvous site releases the visitor hold within five seconds', async () => {
  const {createCrowVisits} = await import('../yard/crow-visits.js');
  const birds = [{id:0,x:0,y:.42,z:0,mode:'walk',speed:1}];
  const visits = createCrowVisits(layout, birds, () => false, () => .5);
  const flock = {phase:'ready',landingCount:1};
  visits.update(.1,1,flock,0);
  assert.ok(visits.holdLeader());
  flock.phase = 'gather';
  visits.update(.1,6.1,flock,0);
  assert.equal(visits.holdLeader(),false);
  flock.phase = 'ready';
  visits.update(.1,7,flock,0);
  assert.equal(visits.holdLeader(),false);
});

test('a flying leader can lose its entire party, then bring all twelve neighbours on another mission', async () => {
  for (let seed = 1; seed <= 12; seed++) {
    const {walk, flock} = await createRoute(seed);
    const {state, birds} = flock;
    let soloMission = 0, before = null, wandering = false, recruited = false;
    for (let i = 0; i < 3600; i++) {
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
  }
  assert.fail('solo flight must be followed by a new gathering and full-flock flight');
});
