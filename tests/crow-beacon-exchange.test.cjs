const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('a free pair sends and echoes one address, then stays silent',async () => {
  const {createCrowBeaconExchange} = await import('../yard/crow-beacon-exchange.js');
  const birds = [{id:0,x:0,y:.4,z:0,yaw:0}, ...[1,2,3].map(id=>({
    id,x:id-2,y:.2,z:-4,yaw:id*.8,airborne:0,speed:0,
  }))];
  const original = structuredClone(birds);
  const routine = createCrowBeaconExchange(birds,()=>true,new Set([2]));
  routine.update(5,true);
  assert.equal(routine.current,null);
  const sample = (time,side) => {
    routine.update(time,true);
    assert.equal(routine.current.sender.id,1);
    assert.equal(routine.current.recipient.id,3);
    return routine.current[side].pulse;
  };
  const sent=[],echo=[];
  for(let i=0; i<110; i++) sent.push(sample(6+i/100,'sender'));
  for(let i=0; i<110; i++) {
    echo.push(sample(7.56+i/100,'recipient'));
    assert.equal(routine.current.sender.pulse,0);
  }
  const peaks = sent.filter((v,i)=>v>.35 && !(sent[i-1]>.35));
  assert.equal(peaks.length,3);
  assert.ok(echo.every((v,i)=>Math.abs(v-sent[i])<1e-8));
  for(let t=9; t<=28; t++) {routine.update(t,true); assert.equal(routine.current,null);}
  routine.update(40,true);
  assert.ok(routine.current);
  routine.update(40.1,false);
  assert.equal(routine.current,null);
  assert.deepEqual(birds,original);
});

test('the real walk shows one pair by day and night and yields the scene to the thieves',async () => {
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const {createCrowModels} = await import('../yard/crow-models.js');
  const {createAutoWalk,ambientOpeningView} = await import('../yard/auto-walk.js');
  const openingView = ambientOpeningView(layout,.46);
  let seed=17, enabled=true;
  const random = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const flock = createCrowFlock(layout,openingView,{random,allowKeyStory:()=>true,allowBeacons:()=>enabled});
  const walk = createAutoWalk(layout,{openingView,random,flock});
  const models = createCrowModels(null,flock.allBirds.length-1);
  let first=false, reply=false, storyLight=false;
  try {
    for(let i=0; i<2000 && !(first && reply && storyLight); i++) {
      walk.update(.1);
      const story=flock.keyStory, exchange=flock.beacons;
      if (story.phase!=='idle') assert.equal(exchange,null);
      const inStory=story.beacons?.thief.pulse>.4;
      if (!(inStory || exchange?.sender.pulse>.4 || exchange?.recipient.pulse>.4)) continue;
      for(const daylight of [0,1]) {
        models.update(flock.allBirds,.1,0,daylight,story,exchange);
        const pair=models.group.getObjectByName('crow-leg-beacons');
        assert.ok(pair?.visible);
        const sender=pair.getObjectByName('crow-beacon-thief');
        const recipient=pair.getObjectByName('crow-beacon-accomplice');
        const senderBird=flock.birds[inStory ? story.thief : exchange.sender.id];
        const recipientBird=flock.birds[inStory ? story.accomplice : exchange.recipient.id];
        for(const [lamp,bird] of [[sender,senderBird],[recipient,recipientBird]]) {
          assert.ok(Math.abs(lamp.position.x-bird.x)<.17 && Math.abs(lamp.position.z-bird.z)<.17);
          assert.ok(lamp.position.y<bird.y);
        }
        assert.equal(pair.children.filter(mesh=>mesh.name.endsWith('-signal') && mesh.visible).length,1);
        assert.equal(models.group.children.filter(g=>g.name==='crow-leg-beacons').length,1);
      }
      models.update(flock.allBirds,.1,1,1,story,exchange);
      assert.equal(models.group.getObjectByName('crow-leg-beacons').visible,false);
      first ||= exchange?.sender.pulse>.4; reply ||= exchange?.recipient.pulse>.4;
      storyLight ||= inStory;
    }
    assert.ok(first && reply && storyLight);
    enabled=false;
    for(let i=0; i<600; i++) {walk.update(.1); assert.equal(flock.beacons,null);}
  } finally { models.dispose(); }
});
