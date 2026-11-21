const test = require('node:test');
const assert = require('node:assert/strict');

async function courtyard() {
  const {createCrowAuthority, crowAuthorityPulse, crowLessonDemoMs} = await import('../yard/crow-authority.js');
  const allBirds = [0, 4, 9, 1, 45].map((x, id) => ({id, x, y:.2, z:0}));
  const flock = {allBirds, beacons:null};
  allBirds[0].elapsed = 302;
  return {allBirds, flock, game:createCrowAuthority(flock), pulse:crowAuthorityPulse, ready:crowLessonDemoMs};
}

test('the teacher shows two separate nods; repeating the pulse sends a wave through the nearby flock', async () => {
  const {allBirds, game, pulse, ready} = await courtyard();
  const [camera, teacher, far, near, distant] = allBirds;
  assert.ok(game.teach(teacher, 0));
  assert.equal(game.answer(200), 'watch');
  assert.ok(pulse(teacher, 295) > .99);
  assert.equal(pulse(teacher, 565), 0);
  assert.ok(pulse(teacher, 935) > .99);
  assert.equal(game.answer(ready + 50), 'once');
  assert.equal(game.answer(ready + 70), 'once');
  assert.equal(game.answer(ready + 710), 'flock');
  assert.ok(teacher.authoritySignal.start < near.authoritySignal.start);
  assert.ok(near.authoritySignal.start < far.authoritySignal.start);
  assert.equal(pulse(far, far.authoritySignal.start + 1200), 0);
  assert.equal(camera.authoritySignal, undefined);
  assert.equal(distant.authoritySignal, undefined);
  assert.equal(game.answer(ready + 1300), 'expired');
});

test('story, beacon and musical gestures retain their actors; expired and interrupted lessons can be retaken', async () => {
  const {allBirds, flock, game, ready} = await courtyard();
  const [,teacher, rival, neighbour] = allBirds;
  teacher.flightPose = {};
  assert.equal(game.teach(teacher, 0), false);
  teacher.flightPose = null;
  teacher.gazePose = {};
  assert.equal(game.teach(teacher, 0), false);
  teacher.gazePose = null;
  assert.ok(game.teach(teacher, 0));
  game.answer(ready);
  teacher.storyPose = {};
  assert.equal(game.answer(ready + 600), 'expired');
  assert.equal(teacher.authoritySignal, undefined);
  teacher.storyPose = null;
  assert.ok(game.teach(teacher, 10000));
  assert.equal(game.answer(22000), 'expired');
  assert.ok(game.teach(teacher, 24000));
  assert.equal(game.answer(24000 + ready), 'once');
  assert.equal(game.answer(24000 + ready + 3000), 'once');
  rival.musicReplyAt = 302;
  flock.beacons = {sender:{id:neighbour.id}, recipient:{id:4}};
  assert.equal(game.answer(24000 + ready + 3600), 'alone');
  assert.equal(rival.authoritySignal, undefined);
  assert.equal(neighbour.authoritySignal, undefined);
  assert.ok(game.teach(teacher, 30000));
  game.cancel();
  assert.equal(game.answer(30000 + ready), 'expired');
});
