const test=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');

test('eight seated copies repeat the surveyed roofs and go away on every side of the real yard',async()=>{
  const T=await import('../yard/vendor/three.module.js');
  const {addNeighbourCourtyards}=await import('../yard/neighbour-courtyards.js');
  const {createDigitalBoundary}=await import('../yard/digital-boundary.js');
  const {addRoof}=await import('../yard/roof-geometry.js');
  const scene=new T.Scene();
  scene.background=new T.Color(0x97b1bf); scene.fog=new T.Fog(0x87909a,90,260);
  const ground=new T.Mesh(new T.PlaneGeometry(250,295),new T.MeshBasicMaterial());
  ground.rotation.x=-Math.PI/2;
  ground.position.set(39,0,-2.5);
  scene.add(ground);
  const palette=Object.fromEntries(['felt','flat','red','metal','parapet'].map(key=>[key,new T.MeshStandardMaterial()]));
  for(const b of [...layout.buildings,...layout.utilityStructures]) addRoof(scene,b,palette);
  const edge=createDigitalBoundary(scene,layout,{skyColor:0x97b1bf,fogColor:0x87909a},new T.Mesh(),[]);
  const mesh=addNeighbourCourtyards(scene,layout,ground);
  edge.setNeighbours(mesh);
  assert.ok(mesh.isInstancedMesh);
  assert.equal(mesh.count,8);
  assert.equal(mesh.geometry.groups.length,0);
  const offsets=[];
  for(let i=0;i<8;i++) {
    const m=new T.Matrix4();mesh.getMatrixAt(i,m);
    offsets.push([m.elements[12],m.elements[14]]);
  }
  assert.deepEqual(offsets,[[-250,-295],[0,-295],[250,-295],[-250,0],[250,0],[-250,295],[0,295],[250,295]]);
  const roof=layout.buildings.find(b=>b.id==='tower-34');
  const center=roof.footprint.reduce(([x,z],p)=>[x+p[0]/roof.footprint.length,z+p[1]/roof.footprint.length],[0,0]);
  mesh.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(0,70,0),new T.Vector3(0,-1,0));
  for(const [x,z] of offsets) {
    ray.ray.origin.set(x+center[0],70,z+center[1]);
    const hit=ray.intersectObject(mesh)[0];
    assert.ok(hit && Math.abs(hit.point.y-roof.heightM-.05)<.01,'tower roof at original height and footprint');
  }
  for(const [inside,outside] of [
    [[-85.99,0],[-86.01,0]], [[163.99,0],[164.01,0]],
    [[0,-149.99],[0,-150.01]], [[0,144.99],[0,145.01]],
  ]) {
    edge.update(...inside); assert.equal(mesh.visible,true);
    edge.update(...outside); assert.equal(mesh.visible,false);
    edge.update(-180,200); assert.equal(mesh.visible,false,'backstage');
    edge.update(...outside); assert.equal(mesh.visible,false,'backstage exit before boundary');
    edge.update(...inside); assert.equal(mesh.visible,true);
  }
});

test('one instance batch follows the visible tiles when turning and includes both stereo eyes',async()=>{
  const T=await import('../yard/vendor/three.module.js');
  const {addNeighbourCourtyards}=await import('../yard/neighbour-courtyards.js');
  const scene=new T.Scene();
  const ground=new T.Mesh(new T.PlaneGeometry(250,295));
  ground.rotation.x=-Math.PI/2;
  ground.position.set(39,0,-2.5);
  scene.add(ground);
  const mesh=addNeighbourCourtyards(scene,layout,ground);
  const view=(dx,far)=>{
    const camera=new T.PerspectiveCamera(42,390/844,.1,far);
    camera.position.set(39,2,-2.5);
    camera.lookAt(39+dx,2,-2.5);
    camera.updateMatrixWorld();
    return camera;
  };
  function offsets(camera) {
    scene.onBeforeRender(null,scene,camera,null);
    const matrix=new T.Matrix4();
    return Array.from({length:mesh.count},(_,i)=>{
      mesh.getMatrixAt(i,matrix);
      return [matrix.elements[12],matrix.elements[14]];
    });
  }
  const east=view(1,155), west=view(-1,155);
  assert.deepEqual(offsets(east),[[250,0]]);
  const version=mesh.instanceMatrix.version;
  assert.deepEqual(offsets(east),[[250,0]]);
  assert.equal(mesh.instanceMatrix.version,version);
  assert.deepEqual(offsets(view(1,80)),[]);
  assert.deepEqual(offsets(west),[[-250,0]]);
  assert.deepEqual(offsets(new T.ArrayCamera([west,east])),[[-250,0],[250,0]]);
});
