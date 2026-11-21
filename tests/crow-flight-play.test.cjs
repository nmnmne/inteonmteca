const test=require('node:test');
const assert=require('node:assert/strict');

const view={x:0,y:5,z:0,pitch:0,yaw:0,fov:64,aspect:.46};
async function fixture() {
  const {createCrowFlightPlay}=await import('../yard/crow-flight-play.js');
  const {crowPersonality}=await import('../yard/crow-personalities.js');
  const birds=[{...view,id:0},...[-1,1].map((x,i)=>({
    id:i+1,x,y:5,z:-6,yaw:0,airborne:1,personality:crowPersonality(i+1)
  }))];
  return {birds,play:createCrowFlightPlay(birds)};
}

test('flying birds perform two different jokes; the partner answers after the cue while both keep their path',async()=>{
  const {birds,play}=await fixture(), route=birds.map(({x,y,z,yaw})=>[x,y,z,yaw]);
  let kind,actor,partner,episodes=[],sawCue=false,sawReply=false,firstRoll,oppositeRoll=false;
  for (let i=0;i<3600 && episodes.length<2;i++) {
    const t=i/60;
    play.update(t,true,view);
    if (!kind && play.state.kind) {
      kind=play.state.kind;actor=birds[play.state.actorId];partner=birds[play.state.partnerId];
      sawCue=sawReply=oppositeRoll=false; firstRoll=0;
    }
    if (kind && play.state.kind) {
      const a=actor.flightPose,b=partner.flightPose;
      if (kind==='false-dive') {
        if (a.dip>.30) sawCue=true;
        if (b.dip>.30) {assert.ok(sawCue);sawReply=true;}
      } else {
        if (Math.abs(a.roll)>.32) {
          sawCue=true;firstRoll ||= Math.sign(a.roll);
          if (Math.sign(a.roll)!==firstRoll) oppositeRoll=true;
        }
        if (Math.abs(b.roll)>.32) {assert.ok(sawCue);sawReply=true;}
      }
    } else if (kind) {
      assert.ok(sawCue && sawReply);
      if (kind==='wing-mirror') assert.ok(oppositeRoll);
      assert.equal(actor.flightPose,null);assert.equal(partner.flightPose,null);
      episodes.push(kind);kind=null;
    }
  }
  assert.deepEqual(episodes,['false-dive','wing-mirror']);
  assert.deepEqual(birds.map(({x,y,z,yaw})=>[x,y,z,yaw]),route);
  assert.equal(play.state.count,2);
  assert.ok(birds.some(b=>b.laughAt>5));
});

test('two off-camera neighbours can start a joke until one is needed in a story',async()=>{
  const {birds,play}=await fixture();
  Object.assign(birds[0], {yaw:Math.PI, pitch:1.2});
  play.update(4,true);
  assert.ok(play.state.kind);
  const partner=birds[play.state.partnerId];
  assert.ok(partner.flightPose);
  partner.storyPose={dip:.3};
  play.update(6.6,true,view);
  assert.equal(play.state.count,0);
  assert.equal(partner.flightPose,null);
  assert.ok(birds.every(b=>b.laughAt===undefined));
  assert.deepEqual(partner.storyPose,{dip:.3});
});

test('on the ground a successful decoy can draw a chuckle only after the partner reacts',async()=>{
  const {createCrowPranks}=await import('../yard/crow-pranks.js');
  const {crowPersonality}=await import('../yard/crow-personalities.js');
  const birds=[{...view,id:0,y:.42},...[1,2].map((id,i)=>({id,x:i,y:.2,z:-5,yaw:0,
    senior:false,called:false,airborne:0,wingPhase:0,gaitPhase:0,personality:crowPersonality(id)}))];
  const play=createCrowPranks(birds,()=>true,()=>.5);
  let reaction=false;
  for (let i=0;i<160;i++) {
    const time=i/20;
    play.update(.05,time,'gather');
    const partner=birds[play.state.partnerId];
    if (partner?.prankPose.hop>.09) reaction=true;
    if (birds.some(b=>b.laughAt!==undefined)) {
      assert.ok(reaction);
      assert.equal(play.state.phase,'retreat');
      assert.equal(play.state.kind,'decoy');
      return;
    }
  }
  assert.fail('the partner reacted but neither bird answered');
});

test('queued signals and crows watching each other have priority over a flight joke',async()=>{
  const {birds,play}=await fixture(), now=performance.now();
  birds[1].authoritySignal={start:now+100,count:1};
  play.update(4,true,view);
  assert.equal(play.state.kind,null);
  birds[1].authoritySignal={start:now-1500,count:2};
  birds[1].authorityFocus={until:now+2400};
  play.update(6,true,view);
  assert.equal(play.state.kind,null);
  delete birds[1].authorityFocus;
  play.update(8,true,view);
  assert.ok(play.state.kind);
});

test('a jump past the gesture cannot produce laughter without the partner answering',async()=>{
  const {birds,play}=await fixture();
  play.update(4,true);
  play.update(4.5,true);
  play.update(9,true);
  assert.equal(play.state.count,0);
  assert.ok(birds.every(b=>b.laughAt===undefined));
});
