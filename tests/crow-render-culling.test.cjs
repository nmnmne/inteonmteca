const assert = require('node:assert/strict');
const test = require('node:test');

test('each view skips only the off-screen tail of the flock and restores all instance IDs', async () => {
  const THREE = await import('../yard/vendor/three.module.js');
  const {createCrowModels} = await import('../yard/crow-models.js');
  const models = createCrowModels(null, 4);
  const mesh = models.group.getObjectByName('crow-plumage');
  const camera = new THREE.PerspectiveCamera(90, 1, .1, 70);
  const matrix = new THREE.Matrix4();
  // Instance 2 is just outside the edge, but its near wing can reach into view.
  for (const [id, x, z] of [[0,-100,-10], [1,0,-10], [2,11.3,-10], [3,0,10]]) {
    mesh.setMatrixAt(id,matrix.makeTranslation(x,0,z));
  }
  models.group.position.set(5,0,0);
  models.group.updateMatrixWorld();
  camera.position.set(5,0,0);
  function drawAt(yaw) {
    camera.rotation.y=yaw;
    camera.updateMatrixWorld();
    mesh.onBeforeRender(null,null,camera);
    const submitted=mesh.count;
    mesh.onAfterRender();
    assert.equal(mesh.count,4,'the next view, shadows and raycasts can see all slots');
    return submitted;
  }
  assert.equal(drawAt(0),3,'the partially visible bird keeps its own slot');
  assert.equal(drawAt(Math.PI),4,'the reverse view can see the last bird');
  camera.position.y=100;
  assert.equal(drawAt(0),0,'a clear view submits no plumage');
  mesh.count=1;
  mesh.onBeforeRender(null,null,camera);
  mesh.onAfterRender();
  assert.equal(mesh.count,1,'a shorter caller-specified flock is preserved');
  models.dispose();
});
