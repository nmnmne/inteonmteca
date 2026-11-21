const test = require('node:test');
const assert = require('node:assert/strict');

async function courtyard(random = () => 0) {
  const {createCrowAuthority, crowAuthorityPulse, crowAuthorityLook} = await import('../yard/crow-authority.js');
  // The entire group is behind the point-of-view bird.
  const allBirds = [0, 5, 7, 11, 19, 80].map((x, id) => ({id, x, y:.2, z:id ? 10 : 0, yaw:0}));
  const flock = {allBirds, beacons:null};
  allBirds[0].elapsed = 302;
  return {birds:allBirds, flock, scene:createCrowAuthority(flock, random), pulse:crowAuthorityPulse, look:crowAuthorityLook};
}

test('birds independently notice each other, answer, relay the signal and rest even behind the camera', async () => {
  const {birds, scene, pulse, look} = await courtyard();
  const [camera, caller, partner, near, far, distant] = birds;
  const cameraBefore = {...camera};
  for (let t = 0; t < 5000; t += 100) scene.update(t, true);
  assert.ok(!birds.some(bird => bird.authoritySignal || bird.authorityFocus));
  scene.update(5000, true);
  assert.equal(caller.authorityFocus.peerId, partner.id);
  assert.equal(partner.authorityFocus.peerId, caller.id);
  assert.ok(look(caller, 5560) > .5 && look(partner, 5560) < -.5);
  scene.update(5820, true);
  assert.ok(pulse(caller, 6025) > .99 && pulse(caller, 6695) > .99);
  assert.equal(pulse(caller, 6340), 0);
  scene.update(7110, true);
  assert.ok(pulse(partner, 7315) > .99 && pulse(partner, 7985) > .99);
  scene.update(8400, true);
  assert.equal(near.authoritySignal.count, 1);
  assert.ok(near.authoritySignal.start < far.authoritySignal.start);
  assert.equal(distant.authoritySignal, undefined);
  assert.deepEqual(camera, cameraBefore);
  scene.update(9300, true);
  assert.ok(!birds.some(bird => bird.authoritySignal || bird.authorityFocus));
  for (let t = 10000; t < 31300; t += 1000) scene.update(t, true);
  assert.ok(!birds.some(bird => bird.authorityFocus));
  scene.update(31300, true);
  assert.ok(birds.some(bird => bird.authorityFocus));
  scene.update(32120, true);
  assert.ok(birds.some(bird => bird !== caller && bird.authoritySignal?.count === 2));
});

test('street scenes yield to stories, singing, flight jokes, buildings and hidden tabs', async () => {
  const {birds, flock, scene} = await courtyard();
  const [,story, singer, comic, witness, distant] = birds;
  story.storyPose = {}; singer.musicReplyAt = 302; comic.flightPose = {};
  for (let t=0; t<=5000; t+=100) scene.update(t, true);
  assert.ok(!birds.some(bird => bird.authorityFocus));
  story.storyPose = null;
  scene.update(7500, true);
  assert.equal(story.authorityFocus.peerId, witness.id);
  assert.equal(singer.authorityFocus, undefined);
  assert.equal(comic.authorityFocus, undefined);
  assert.equal(distant.authorityFocus, undefined);
  flock.beacons = {sender:{id:witness.id}, recipient:{id:comic.id}};
  scene.update(7700, true);
  assert.ok(!birds.some(bird => bird.authorityFocus || bird.authoritySignal));
  flock.beacons = null;
  scene.update(10900, true);
  assert.ok(story.authorityFocus);
  scene.update(11200, false);
  assert.ok(!birds.some(bird => bird.authorityFocus || bird.authoritySignal));
  scene.update(600000, true);
  assert.ok(!birds.some(bird => bird.authorityFocus || bird.authoritySignal));
});

test('some episodes open with a quiet glance towards the observer before the bird turns to its companion', async () => {
  const {birds, scene, look} = await courtyard(() => .75);
  const camera = birds[0];
  camera.yaw = -2.8;
  for (let t=0; t<=8750; t+=250) scene.update(t, true);
  const caller = birds.find(bird => bird.authorityFocus?.peerId === 0);
  assert.ok(caller && caller !== camera);
  const before = {...camera};
  assert.ok(Math.abs(look(caller,9360)) > .1);
  assert.ok(!birds.some(bird => bird.authoritySignal));
  scene.update(10000, true);
  assert.equal(look(caller,10000), 0);
  const peer = birds.find(bird => bird.id === caller.authorityFocus.peerId);
  assert.ok(peer !== camera && peer.authorityFocus.peerId === caller.id);
  scene.update(10600, true);
  assert.ok(!birds.some(bird => bird.authoritySignal));
  scene.update(10820, true);
  assert.equal(caller.authoritySignal.count, 2);
  assert.deepEqual(camera, before);
});
