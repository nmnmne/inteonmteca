const test = require('node:test');
const assert = require('node:assert/strict');

test('the perch stays under the feet when a turn or a new camera view repacks the visible pigeons', async () => {
  const {createRoofPigeons} = await import('../yard/roof-pigeons.js');
  const {PerspectiveCamera,Matrix4,Vector3} = await import('../yard/vendor/three.module.js');
  const pigeons = createRoofPigeons([{x:0,y:10,z:4,heading:.4},{x:0,y:11,z:-5,heading:-.2}]);
  const camera = new PerspectiveCamera(60,1,.1,200);
  camera.position.set(0,11,0);
  const bird=pigeons.group.children[0];
  assert.equal(bird.count,2);
  assert.equal(bird.material.vertexColors,true);
  bird.geometry.computeBoundingBox();
  assert.ok(Math.abs(bird.geometry.boundingBox.min.y)<.001);
  assert.ok(bird.geometry.boundingBox.max.z-bird.geometry.boundingBox.min.z>.32);

  function feet() {
    const matrix=new Matrix4();
    bird.getMatrixAt(0,matrix);
    return new Vector3().setFromMatrixPosition(matrix).toArray();
  }
  assert.equal(pigeons.hasVisibleRoost(camera),true);
  pigeons.update(0,camera);
  assert.equal(bird.count,1);
  assert.deepEqual(feet(),[0,11,-5]);
  const pose=bird.geometry.getAttribute('pigeonPose'), initial=pose.array.slice(0,4);
  pigeons.update(0,camera);
  assert.deepEqual(pose.array.slice(0,4),initial);
  pigeons.update(.7,camera);
  assert.notDeepEqual(pose.array.slice(0,4),initial);
  assert.deepEqual(feet(),[0,11,-5]);
  camera.rotation.y=Math.PI;
  pigeons.update(0,camera);
  assert.deepEqual(feet(),[0,10,4]);
  camera.position.set(0,10,-80);
  assert.equal(pigeons.hasVisibleRoost(camera),false);
  camera.rotation.y=0;
  pigeons.update(0,camera);
  assert.equal(bird.count,0);
  pigeons.dispose();
  const empty = createRoofPigeons();
  assert.equal(empty.hasVisibleRoost(camera),false);
  empty.update(1,camera);
  empty.dispose();
});
