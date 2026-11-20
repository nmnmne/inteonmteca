const test = require('node:test');
const assert = require('node:assert/strict');

test('an unanswered look holds the turn, including when the leader looks away mid-reply', async () => {
  const {createCrowRollCall} = await import('../yard/crow-roll-call.js');
  const leader = {id:0, x:0, y:.42, z:0, yaw:0, pitch:0};
  const birds = [leader, ...[-.5, .5].map((x,i) => ({id:i+1, x, y:.2, z:-3.8,
    slot:i, yaw:0, airborne:0, called:true, inParty:true}))];
  const call = createCrowRollCall(birds), s = call.state;
  function step(facing) {
    leader.yaw = facing ? s.yaw : Math.PI;
    leader.pitch = facing ? s.pitch : 0;
    call.update(1/60, leader, birds.length);
  }
  call.reset();
  for (let i=0; i<600; i++) step(false);
  const first = s.targetId;
  assert.ok(first === 1 || first === 2);
  assert.equal(s.phase,'look');
  assert.deepEqual(s.answered,[]);
  for (let i=0; i<180 && s.phase!=='reply'; i++) step(true);
  assert.equal(s.phase,'reply');
  for (let i=0; i<300; i++) step(false);
  assert.equal(s.targetId,first);
  assert.deepEqual(s.answered,[]);
  for (let i=0; i<600 && s.phase!=='done'; i++) step(true);
  assert.equal(s.phase,'done');
  assert.deepEqual(s.answered,[first,3-first]);
  assert.ok(birds.slice(1).every(b => b.gazePose === null));
  call.reset();
  assert.deepEqual(s.answered,[]);
  assert.equal(s.targetId,null);
});
