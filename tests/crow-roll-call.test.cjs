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

test('only one randomly selected partner gets one camera nod across multiple gatherings', async () => {
  const {createCrowRollCall} = await import('../yard/crow-roll-call.js');
  const recipients = new Set();
  for (const draw of [.01,.51,.99]) {
    const leader = {id:0,x:0,y:.42,z:0,yaw:0,pitch:0};
    const birds = [leader,...[-1,0,1].map((x,i)=>({id:i+1,x,y:.2,z:-4,slot:i,
      yaw:0,airborne:0,called:true,inParty:true}))];
    const visit = {recipientId:null};
    let call=createCrowRollCall(birds,()=>draw,visit);
    let pulses=0, previous=false;
    for (let meeting=0;meeting<3;meeting++) {
      if (meeting === 2) call=createCrowRollCall(birds,()=>1-draw,visit);
      call.reset();
      for (let i=0;i<3000 && call.state.phase!=='done';i++) {
        const s=call.state;
        leader.yaw=s.yaw; leader.pitch=s.pitch+s.nodOffset;
        call.update(1/60,leader,birds.length);
        const active=s.nodOffset<-.001;
        if (active) {
          assert.equal(meeting,0);
          assert.equal(s.targetId,s.nodRecipientId);
          if (!previous) pulses++;
        }
        previous=active;
      }
      assert.equal(call.state.phase,'done');
    }
    assert.equal(pulses,1); recipients.add(call.state.nodRecipientId);
  }
  assert.equal(recipients.size,3);
});
