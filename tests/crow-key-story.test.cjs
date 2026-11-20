const test=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');

async function route(aspect, allowed) {
  const {createCrowFlock}=await import('../yard/crow-flock.js');
  const {ambientOpeningView,createAutoWalk}=await import('../yard/auto-walk.js');
  let seed=17;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const openingView=ambientOpeningView(layout,aspect);
  const flock=createCrowFlock(layout,openingView,{random,residentVisits:true,allowKeyStory:allowed});
  return {flock,walk:createAutoWalk(layout,{openingView,random,flock})};
}

test('the stolen key stays in view, exits with a real bird, and both birds rejoin ordinary flock life',async()=>{
  for (const aspect of [.46,1.6]) {
    const {flock,walk}=await route(aspect,()=>true);
    const {keyStory:s,birds}=flock, phases=new Set();
    let visibleDoor=false, keyWasTaken=false, foundKeyOnGround=false, sawVisit=false, movedOn=false;
    for (let i=0;i<4000 && s.count<2;i++) {
      const p=walk.update(.1);
      if (s.phase==='idle') {
        sawVisit ||= flock.visit.phase==='sitting';
        movedOn ||= s.count===1 && flock.state.phase==='mission';
        continue;
      }
      assert.equal(flock.visit.kind,null);
      assert.equal(flock.canTakeOff(),false);
      assert.ok(s.finder>0 && s.thief>0 && s.finder!==s.thief);
      phases.add(s.phase);
      const dx=s.x-p.x,dz=s.z-p.z;
      const ahead=dx*Math.sin(p.yaw)-dz*Math.cos(p.yaw), side=dx*Math.cos(p.yaw)+dz*Math.sin(p.yaw);
      assert.ok(ahead>1.8 && Math.abs(side/ahead)<aspect*Math.tan(p.fov*Math.PI/360));
      foundKeyOnGround ||= s.phase==='knock' && s.key.y<.1 && birds[s.finder].storyPose.dip>.5;
      visibleDoor ||= s.door>.99 && s.key.y>.38;
      if (s.phase==='escape' && s.elapsed>7.9) {
        assert.equal(s.door,0);
        const thief=birds[s.thief];
        const held=Math.hypot(s.key.x-thief.x,s.key.z-thief.z);
        keyWasTaken ||= held>.30 && held<.40 && Math.hypot(s.key.x-s.x,s.key.z-s.z)>.8;
      }
    }
    assert.deepEqual([...phases],['approach','knock','unlock','steal','escape']);
    assert.ok(visibleDoor && keyWasTaken && foundKeyOnGround && sawVisit && movedOn);
    assert.equal(s.count,2);
    assert.equal(birds.filter(b=>b.storyPose).length,0);
    assert.equal(birds.length,13);
  }
});

test('disabling the story mid-scene releases actors and the camera hold',async()=>{
  let enabled=true;
  const {flock,walk}=await route(1.6,()=>enabled);
  for (let i=0;i<1000 && !flock.keyStory.door;i++) walk.update(.1);
  assert.ok(flock.keyStory.door>0);
  enabled=false;
  walk.update(.1);
  assert.equal(flock.keyStory.phase,'idle');
  assert.equal(flock.keyStory.door,0);
  assert.ok(flock.birds.every(b=>!b.storyPose));
  for (let i=0;i<1400;i++) walk.update(.1);
  assert.equal(flock.keyStory.count,0);
  assert.ok(flock.state.missionCount>=1);
});

test('the door opens and the brass key moves even when the next facade finishes batching mid-story',async()=>{
  const {createCrowKeyDoor}=await import('../yard/crow-key-door.js');
  const {batchStaticDecoration}=await import('../yard/static-batches.js');
  const {Scene,Vector3}=await import('../yard/vendor/three.module.js');
  const s={phase:'knock',elapsed:0,x:3,z:1,yaw:.4,door:0,key:{x:3,y:.073,z:1,tilt:0,turn:0,scale:1}};
  const scene=new Scene(), model=createCrowKeyDoor();
  scene.add(model.group);model.update(s);
  batchStaticDecoration(scene,[]);
  s.phase='unlock';s.door=1;s.key.x=3.33;s.key.y=.44;
  model.update(s);scene.updateMatrixWorld(true);
  const door=scene.getObjectByName('crow-key-doorway'), key=scene.getObjectByName('crow-brass-key');
  assert.equal(key.matrixAutoUpdate,false);
  assert.equal(door.visible,true);
  assert.ok(new Vector3().setFromMatrixPosition(key.matrixWorld).distanceTo(new Vector3(3.33,.44,1))<1e-6);
  assert.ok(new Vector3().setFromMatrixPosition(door.matrixWorld).distanceTo(door.position)<1e-6);
  model.dispose();
});
