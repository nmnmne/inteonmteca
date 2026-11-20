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

test('two crows signal, steal and stash the key while the finder examines the broken seal',async()=>{
  for (const aspect of [.46,1.6]) {
    const {flock,walk}=await route(aspect,()=>true);
    const {keyStory:s,birds}=flock, phases=new Set();
    let visibleDoor=false, keyWasTaken=false, foundKeyOnGround=false, sawVisit=false, movedOn=false;
    let call=false,reply=false,delivered=false,disappearedIntoCache=false,clueFound=false;
    for (let i=0;i<4000 && s.count<2;i++) {
      const p=walk.update(.1);
      if (s.phase==='idle') {
        sawVisit ||= flock.visit.phase==='sitting';
        movedOn ||= s.count===1 && flock.state.phase==='mission';
        continue;
      }
      assert.equal(flock.visit.kind,null);
      assert.equal(flock.canTakeOff(),false);
      assert.ok(s.finder>0 && s.thief>0 && s.accomplice>0);
      assert.equal(new Set([s.finder,s.thief,s.accomplice]).size,3);
      assert.equal(birds.filter(b=>b.storyPose).length,3);
      const signals=s.beacons;
      assert.ok(!(signals.accomplice.pulse && signals.thief.pulse));
      if (signals.accomplice.pulse>.50) {
        assert.equal(s.phase,'unlock');
        assert.deepEqual(signals.call,{from:s.accomplice,to:s.thief,code:signals.code});
        call=true;
      }
      if (signals.thief.pulse>.50) {
        assert.equal(s.phase,'unlock'); assert.ok(call);
        assert.deepEqual(signals.reply,{from:s.thief,to:s.accomplice,code:signals.code});
        reply=true;
      }
      if (s.phase==='steal') assert.ok(call && reply && signals.acknowledged);
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
      if (s.phase==='stash') {
        const holder=birds[s.accomplice], held=Math.hypot(s.key.x-holder.x,s.key.z-holder.z);
        delivered ||= held>.29 && held<.41 && s.key.y>.20 && s.key.scale===1;
        disappearedIntoCache ||= s.key.scale===0 && s.cache.open>.9 && s.key.y<.04
          && Math.hypot(s.key.x-s.cache.x,s.key.z-s.cache.z)<.04;
        clueFound ||= s.key.scale===0 && s.cache.open<.1 && s.evidence===1 && birds[s.finder].storyPose.dip>.35;
        const cx=s.cache.x-p.x,cz=s.cache.z-p.z;
        assert.ok(Math.abs((cx*Math.cos(p.yaw)+cz*Math.sin(p.yaw))/(cx*Math.sin(p.yaw)-cz*Math.cos(p.yaw)))
          <aspect*Math.tan(p.fov*Math.PI/360));
      }
    }
    assert.deepEqual([...phases],['approach','knock','unlock','steal','escape','handoff','stash']);
    assert.ok(visibleDoor && keyWasTaken && foundKeyOnGround && sawVisit && movedOn);
    assert.ok(delivered && disappearedIntoCache && clueFound);
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
  assert.equal(flock.keyStory.cache.open,0);
  assert.equal(flock.keyStory.evidence,0);
  assert.equal(flock.keyStory.beacons.thief.pulse,0);
  assert.equal(flock.keyStory.beacons.accomplice.pulse,0);
  assert.ok(flock.birds.every(b=>!b.storyPose));
  for (let i=0;i<1400;i++) walk.update(.1);
  assert.equal(flock.keyStory.count,0);
  assert.ok(flock.state.missionCount>=1);
});

test('each address uses three short glints and the same pair cycles through four distinct phrases',async()=>{
  const {crowBeaconCode,crowBeaconPulse,CROW_BEACON_DURATION}=await import('../yard/crow-beacon-code.js');
  const phrases=new Set();
  for(let episode=0;episode<4;episode++) {
    const code=crowBeaconCode(7,2,episode), onsets=[];
    let lit=false;
    for(let i=0; i<Math.ceil(CROW_BEACON_DURATION*100); i++) {
      const now=crowBeaconPulse(code,i/100)>.1;
      if (now && !lit) onsets.push(i);
      lit=now;
    }
    assert.equal(onsets.length,3);
    assert.equal(crowBeaconPulse(code,-.1),0);
    assert.equal(crowBeaconPulse(code,CROW_BEACON_DURATION+.1),0);
    phrases.add(onsets.join(','));
  }
  assert.equal(phrases.size,4);
});

test('a reply to the wrong crow or with another rhythm cannot start the theft',async()=>{
  for (const mismatch of ['to','code']) {
    const {flock,walk}=await route(.46,()=>true),s=flock.keyStory;
    for (let i=0;i<1800 && !s.beacons.reply;i++) walk.update(.1);
    assert.ok(s.beacons.reply && !s.beacons.acknowledged);
    s.beacons.reply[mismatch]=mismatch==='to' ? s.finder : (s.beacons.code+1)%4;
    for(let i=0;i<50 && s.phase!=='idle';i++) {
      walk.update(.1);
      assert.ok(!s.beacons.acknowledged && s.evidence===0 && s.cache.open===0);
    }
    assert.equal(s.phase,'idle');
    assert.equal(s.count,0);
    assert.ok(flock.birds.every(b=>!b.storyPose));
  }
});

test('the door opens and the brass key moves even when the next facade finishes batching mid-story',async()=>{
  const {createCrowKeyDoor}=await import('../yard/crow-key-door.js');
  const {batchStaticDecoration}=await import('../yard/static-batches.js');
  const {Scene,Vector3}=await import('../yard/vendor/three.module.js');
  const s={phase:'knock',elapsed:0,x:3,z:1,yaw:.4,door:0,key:{x:3,y:.073,z:1,tilt:0,turn:0,scale:1},
    cache:{x:3.4,z:1.7,open:0},evidence:0};
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
  const lights=scene.getObjectByName('crow-key-constellation');
  assert.equal(lights.visible,false);
  s.phase='escape';s.door=0;s.elapsed=8.15;
  model.update(s);scene.updateMatrixWorld(true);
  assert.equal(door.visible,false);
  assert.equal(lights.visible,true);
  assert.equal(lights.geometry.getAttribute('position').count,13);
  assert.equal(lights.material.uniforms.age.value,8.15);
  s.elapsed=9.7;model.update(s);
  assert.equal(lights.visible,false);
  const cache=scene.getObjectByName('crow-key-cache'),grate=scene.getObjectByName('crow-cache-grate');
  const seal=scene.getObjectByName('crow-torn-seal');
  const rim=()=>new Vector3(0,-.4,0).applyMatrix4(grate.matrixWorld);
  const closed=rim();
  assert.equal(seal.visible,false);
  s.phase='stash';s.evidence=1;s.cache.open=1;model.update(s);scene.updateMatrixWorld(true);
  assert.ok(Math.abs(rim().y-closed.y)>.3);
  assert.equal(seal.visible,true);
  assert.ok(new Vector3().setFromMatrixPosition(seal.matrixWorld).distanceTo(new Vector3(s.x,.077,s.z))<1e-6);
  assert.ok(Math.hypot(cache.position.x-s.cache.x,cache.position.z-s.cache.z)<1e-6);
  s.phase='idle';model.update(s);assert.equal(model.group.visible,false);
  model.dispose();
});
