const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('a crow rides each moving birch, and recruitment releases its perch', async () => {
  const {Scene, MeshLambertMaterial, Vector3} = await import('../yard/vendor/three.module.js');
  const {addCourtyardTrees} = await import('../yard/landscaping.js');
  const {createCrowTreePrank} = await import('../yard/crow-tree-prank.js');
  const scene = new Scene(), material = new MeshLambertMaterial();
  const trees = layout.circles.filter(t => t.id.startsWith('tree-'));
  addCourtyardTrees(scene,{bark:() => material},trees);
  const rig = scene.userData.crowTrees;
  assert.ok(trees.length >= 2);
  for (const [index,tree] of trees.entries()) {
    const seat = rig.perches.find(p => p.treeId === tree.id);
    const leader = {id:0,x:seat.x-5,y:seat.y,z:seat.z,yaw:Math.PI/2};
    const bird = {id:1,x:seat.x,y:seat.y,z:seat.z,yaw:0,breakUntil:0,wingPhase:0};
    const prank = createCrowTreePrank([leader,bird],() => rig);
    const pivot = scene.getObjectByName(tree.id), foot = new Vector3();
    let seated=false, finished=false, raised=false, hops=0, maxSway=0;
    for (let tick=0; tick<900; tick++) {
      prank.update(1/60,tick/60);
      const target = prank.targets.get(bird.id);
      if (target && !target.perched) {
        for (const key of ['x','y','z']) bird[key] += (target[key]-bird[key])*.055;
      }
      if (prank.state.phase === 'perched') {
        seated=true;
        assert.equal(prank.state.treeId,tree.id);
        maxSway=Math.max(maxSway,pivot.quaternion.angleTo(scene.quaternion));
        const perch=rig.perches.find(p => Math.hypot(p.x-bird.x,p.z-bird.z)<1e-8);
        assert.ok(perch);
        pivot.localToWorld(foot.copy(perch.local));
        assert.ok(Math.hypot(foot.x-bird.x,foot.z-bird.z)<1e-8);
        const lift=bird.y-.20-foot.y;
        assert.ok(lift>=-1e-8 && lift<=.26+1e-8);
        if (lift>.05 && !raised) hops++;
        raised=lift>.05;
        if (index>0 && hops===1) bird.called=true;
      } else if (seated) {
        finished=true;
        assert.equal(target,undefined);
        break;
      }
    }
    assert.ok(finished && maxSway>.05);
    assert.equal(hops,index===0 ? 3 : 1);
    for (let tick=0; tick<500; tick++) rig.update(1/60);
    assert.equal(pivot.quaternion.angleTo(scene.quaternion),0);
  }
});
