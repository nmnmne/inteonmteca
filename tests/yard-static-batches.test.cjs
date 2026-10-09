const {test} = require('node:test');
const assert = require('node:assert/strict');

test('static batches preserve world geometry, normals, UVs and protected object identities', async () => {
  const THREE = await import('../yard/vendor/three.module.js');
  const {batchStaticDecoration} = await import('../yard/static-batches.js');
  const scene = new THREE.Scene(), parent = new THREE.Group();
  parent.position.set(1,2,3); parent.rotation.y=.6; scene.add(parent);
  const material = new THREE.MeshLambertMaterial();
  const original = [];
  for (let i=0;i<3;i++) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);
    mesh.position.set(i,0,0); mesh.rotation.z=.2;parent.add(mesh);original.push(mesh);
  }
  const protectedMesh=new THREE.Mesh(new THREE.BoxGeometry(),material);
  const named=new THREE.Mesh(new THREE.BoxGeometry(),material);named.name='entrance-door';
  const hiddenParent=new THREE.Group();hiddenParent.visible=false;
  hiddenParent.add(new THREE.Mesh(new THREE.BoxGeometry(),material));scene.add(hiddenParent);
  scene.add(protectedMesh,named);scene.updateMatrixWorld(true);
  const expected=original.map(m=>m.geometry.toNonIndexed().applyMatrix4(m.matrixWorld));
  batchStaticDecoration(scene,[protectedMesh]);
  assert.deepEqual(scene.userData.staticBatches,{sources:3,batches:1,savedMeshes:2});
  assert.equal(scene.getObjectByName('entrance-door'),named);
  assert.equal(protectedMesh.parent,scene);
  assert.equal(hiddenParent.children.length,1);
  const batch=scene.getObjectByName('static-decoration-0');
  const actual=batch.geometry.clone().applyMatrix4(batch.matrixWorld);
  for(const name of ['position','normal','uv']) {
    const values=expected.flatMap(g=>Array.from(g.attributes[name].array));
    assert.equal(actual.attributes[name].array.length,values.length);
    values.forEach((v,i)=>assert.ok(Math.abs(v-actual.attributes[name].array[i])<1e-5,`${name} ${i}`));
  }
  assert.equal(batch.matrixAutoUpdate,false);
});
