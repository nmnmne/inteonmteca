const {test}=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');
test('marked green line is already 40%; full state is 20 walking seconds outside',async()=>{
 const {virtualAmount}=await import('../yard/digital-boundary.js');
 for(const [x,z] of layout.virtualBoundary.noticeableRing) assert.ok(Math.abs(virtualAmount(layout,x,z)-.4)<.0001);
 assert.equal(layout.virtualBoundary.fullOutsideM/layout.movement.speedMps,20);
 for(const [x,z] of [[-138,0],[216,0],[0,-202],[0,197]]) assert.equal(virtualAmount(layout,x,z),1);
 assert.equal(virtualAmount(layout,layout.spawn.x,layout.spawn.z),0);
});
test('domes stay anchored and digital houses retain original footprints',async()=>{
 const THREE=await import('../yard/vendor/three.module.js');
 const {createDigitalBoundary}=await import('../yard/digital-boundary.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,90,260);
 const outside=new THREE.Mesh();const edge=createDigitalBoundary(scene,layout,{skyColor:0xabcdef,fogColor:0xeeeeee},outside,[]);
 const first=scene.getObjectByName('digital-dome-1'),second=scene.getObjectByName('digital-dome-2'),before=first.position.clone();
 edge.update(-650,0);assert.ok(first.position.equals(before));assert.ok(second.material.opacity>0 && first.material.opacity>0);
 const houses=scene.getObjectByName('digital-buildings').children.filter(m=>m.isMesh);assert.equal(houses.length,layout.buildings.length);
 assert.ok(houses.every(m=>m.material.fog===false && m.userData.digitalProxy));
 edge.update(layout.spawn.x,layout.spawn.z);assert.equal(scene.getObjectByName('digital-buildings').visible,false);
});


test('crossing the violet dome makes sky, fog and ground black and restores them on return', async()=>{
 const THREE=await import('../yard/vendor/three.module.js');
 const {createDigitalBoundary}=await import('../yard/digital-boundary.js');
 const {createLightingTransition}=await import('../yard/lighting-transition.js');
 const {lightingPresetForLayout}=await import('../yard/baked-lighting.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,90,260);
 scene.add(new THREE.AmbientLight(),new THREE.HemisphereLight(),new THREE.DirectionalLight());
 const ground=new THREE.MeshLambertMaterial(),outside=new THREE.Mesh();
 const preset=lightingPresetForLayout(layout,0);
 const edge=createDigitalBoundary(scene,layout,preset,outside,[ground]);
 const lighting=createLightingTransition(scene,layout,preset,{enteredAt:0,deadline:30000});
 const dome=scene.getObjectByName('digital-dome-2');
 const at=(dx,dz,factor)=>{edge.update(dome.position.x+dx*dome.scale.x*factor,dome.position.z+dz*dome.scale.z*factor);lighting.update(10000);};
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2]]){
  at(dx,dz,.999);
  assert.equal(scene.userData.outsideOuterDome,false);
  assert.notEqual(scene.background.getHex(),0);
  assert.notEqual(ground.color.getHex(),0);
  at(dx,dz,1.001);
  assert.equal(scene.userData.outsideOuterDome,true);
  assert.equal(scene.background.getHex(),0);
  assert.equal(scene.fog.color.getHex(),0);
  assert.equal(ground.color.getHex(),0);
  assert.equal(scene.getObjectByName('digital-ground').material.opacity,0);
  lighting.update(20000);
  assert.equal(scene.background.getHex(),0,'lighting changes cannot restore a tinted sky outside');
 }
 at(1,0,.999);
 assert.notEqual(scene.background.getHex(),0);
 assert.notEqual(ground.color.getHex(),0);
 assert.ok(scene.getObjectByName('digital-ground').material.opacity>0);
 lighting.dispose();
});

test('deferred building attachments reuse shader patches and adopt the current boundary state',async()=>{
 const THREE=await import('../yard/vendor/three.module.js');
 const {createDigitalBoundary}=await import('../yard/digital-boundary.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,90,260);
 const edge=createDigitalBoundary(scene,layout,{skyColor:0xabcdef,fogColor:0xeeeeee},new THREE.Mesh(),[]);
 const original=new THREE.MeshLambertMaterial();
 const first=new THREE.Mesh(new THREE.BoxGeometry(),original);first.userData.digitalBuilding=true;scene.add(first);
 edge.attachBuildings();const patched=first.material;
 edge.attachBuildings();assert.equal(first.material,patched);
 edge.update(-650,0);
 const second=new THREE.Mesh(first.geometry,original);second.userData.digitalBuilding=true;scene.add(second);
 edge.attachBuildings();assert.equal(second.material,patched);assert.equal(second.visible,false);
 first.removeFromParent();second.removeFromParent();
 const batch=new THREE.Mesh(first.geometry,patched);batch.userData.digitalBuilding=true;scene.add(batch);
 edge.attachBuildings();assert.equal(batch.material,patched);assert.equal(batch.visible,false);
 const shader={uniforms:{},fragmentShader:'#include <dithering_fragment>'};patched.onBeforeCompile(shader);
 assert.equal(shader.fragmentShader.match(/uniform float digitalMix/g).length,1);
 edge.update(layout.spawn.x,layout.spawn.z);assert.equal(batch.visible,true);
 assert.equal(scene.getObjectByName('digital-buildings').children.filter(m=>m.isMesh).length,layout.buildings.length);
});
