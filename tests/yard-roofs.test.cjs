const {test}=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');

async function builtRoofs() {
  const T=await import('../yard/vendor/three.module.js');
  const {addRoof,createRoofPerches,roofParapet}=await import('../yard/roof-geometry.js');
  const palette=Object.fromEntries(['felt','flat','red','metal','parapet'].map(name=>[name,new T.MeshStandardMaterial()]));
  const scene=new T.Scene();
  for (const item of [...layout.buildings,...layout.utilityStructures]) addRoof(scene,item,palette);
  scene.updateMatrixWorld();
  const down=new T.Vector3(0,-1,0);
  const hit=(x,z)=>new T.Raycaster(new T.Vector3(x,100,z),down).intersectObjects(scene.children,false)[0];
  return {T,palette,scene,hit,perches:createRoofPerches(layout),roofParapet};
}

test('all nine physical roofs support pigeon feet at their actual rendered height',async()=>{
  const {hit,perches,scene,palette}=await builtRoofs();
  const sizes=new Set();
  for (const building of [...layout.buildings,...layout.utilityStructures]) {
    const places=perches.filter(perch=>perch.houseId===building.id);
    if (building.id==='house-14') {
      assert.equal(places.length,4);
      assert.equal(places.filter(p=>hit(p.x,p.z).object.name==='roof-parapet-house-14').length,3);
    } else if (building.role==='electric-kiosk') {
      assert.ok(places.length>=2 && places.length<=3);
    } else {
      assert.ok(places.length>=1 && places.length<=5,building.id);
      sizes.add(places.length);
    }
    for (const {x,y,z} of places) {
      const surface=hit(x,z);
      assert.ok(surface?.object.name.endsWith('-'+building.id),building.id);
      assert.ok(Math.abs(surface.point.y-y)<1e-4,building.id+' pigeon foot height');
    }
  }
  const {createRoofPerches}=await import('../yard/roof-geometry.js');
  assert.deepEqual(perches,createRoofPerches(layout));
  assert.ok(sizes.size>=3,'different rooftops have different sized gatherings');
  assert.equal(scene.getObjectByName('roof-house-14').material,palette.felt);
  assert.equal(scene.getObjectByName('roof-electric-kiosk').material,palette.metal);
  assert.ok(layout.buildings.filter(h=>h.id!=='house-14').every(h=>scene.getObjectByName('roof-'+h.id).material===palette.flat));
});

test('the nine-storey parapet wraps every edge and miter of its concave roof without covering the deck',async()=>{
  const {hit,roofParapet}=await builtRoofs();
  const {facadeNormal}=await import('../yard/facade-frame.js');
  const building=layout.buildings.find(h=>h.id==='house-14');
  const {outer,inner,baseY,topY}=roofParapet(building);
  for (let i=0; i<outer.length; i++) {
    const a=outer[i], b=outer[(i+1)%outer.length], n=facadeNormal(a,b,outer);
    for (const along of [.025,.5,.975]) {
      const x=a[0]+(b[0]-a[0])*along, z=a[1]+(b[1]-a[1])*along;
      const mid=hit(x-n[0]*.2,z-n[1]*.2);
      assert.equal(mid?.object.name,'roof-parapet-house-14',`edge ${i} at ${along}`);
      assert.ok(Math.abs(mid.point.y-baseY-.4)<1e-4);
    }
    const innerOffset=(a[0]-inner[i][0])*n[0]+(a[1]-inner[i][1])*n[1];
    assert.ok(Math.abs(innerOffset-.4)<1e-8);
    const felt=hit((a[0]+b[0])/2-n[0]*.42,(a[1]+b[1])/2-n[1]*.42);
    assert.equal(felt?.object.name,'roof-house-14');
    assert.ok(Math.abs(felt.point.y-(topY-.4))<1e-4);
  }
});

test('the two vertical ends of the kiosk gable both close the space below its ridge',async()=>{
  const {T,scene}=await builtRoofs();
  const kiosk=layout.utilityStructures.find(s=>s.role==='electric-kiosk');
  const [a,b,c,d]=kiosk.footprint;
  const mids=[[a,d],[b,c]].map(([p,q])=>new T.Vector3((p[0]+q[0])/2,kiosk.heightM+.42,(p[1]+q[1])/2));
  const mesh=scene.getObjectByName('roof-electric-kiosk');
  for (const i of [0,1]) {
    const dir=mids[1-i].clone().sub(mids[i]).normalize();
    const outside=mids[i].clone().addScaledVector(dir,-2);
    const face=new T.Raycaster(outside,dir).intersectObject(mesh)[0];
    assert.ok(face && Math.abs(face.distance-2)<.01);
  }
});
