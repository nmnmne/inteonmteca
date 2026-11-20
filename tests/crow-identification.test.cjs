const test = require('node:test');
const assert = require('node:assert/strict');

test('a tap on the yard identifies the nearer overlapping bird and respects walls', async () => {
  const {crowAtPoint} = await import('../yard/crow-identification.js');
  const T = await import('../yard/vendor/three.module.js');
  const camera = new T.PerspectiveCamera(60, 2, .1, 100);
  camera.updateMatrixWorld();
  const rect = {left:10, top:20, width:600, height:300};
  const bird = (id, z) => ({id, x:0, y:0, z, airborne:0, personality:{name:String(id)}});
  const birds = [bird(0, -.3), bird(2, -8), bird(1, -4), bird(3, 4)];
  const pick = (solids, x = 310) => crowAtPoint(birds, camera, solids, rect, x, 170);
  assert.equal(pick([]).id, 1);
  assert.equal(pick([], 50), null);
  const wall = new T.Mesh(new T.BoxGeometry(1, 2, .2));
  wall.position.z = -2;
  wall.updateMatrixWorld();
  assert.equal(pick([wall]), null);
  wall.position.x = 8;
  wall.updateMatrixWorld();
  assert.equal(pick([wall]).id, 1);
  wall.geometry.dispose();
  wall.material.dispose();
});
