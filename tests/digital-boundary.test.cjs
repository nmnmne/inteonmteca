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
