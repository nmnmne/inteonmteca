const test=require('node:test');
const assert=require('node:assert/strict');

async function setup() {
  const {createResidentOrbTrail}=await import('../yard/resident-orb-trail.js');
  const trail=createResidentOrbTrail();
  const geometry=trail.mesh.geometry;
  const point=(x,y=0,z=0,restart=false)=>trail.update({x,y,z},1,restart);
  function path() {
    const p=geometry.getAttribute('position'), age=geometry.getAttribute('ageM');
    return Array.from({length:geometry.drawRange.count/6+1},(_,i)=>[
      p.getX(2*i),p.getY(2*i),p.getZ(2*i),age.getX(2*i)]);
  }
  return {trail,geometry,point,path};
}

test('the orb keeps the last ten metres around real 3D corners, including a partial first segment',async()=>{
  const {trail,point,path}=await setup();
  try {
    point(0);point(2);point(4);point(6);point(6,3);point(6,6);point(6,6,2.5);
    assert.deepEqual(path(),[[4.5,0,0,10],[6,0,0,8.5],[6,6,0,2.5],[6,6,2.5,0]]);
    for(let i=0;i<80;i++)point(6,6,2.5);
    assert.deepEqual(path()[0],[4.5,0,0,10]);
    point(6,6,1.5);
    assert.deepEqual(path().at(-2),[6,6,2.5,1]);
    assert.deepEqual(path()[0],[5.5,0,0,10]);
    assert.ok(trail.mesh.visible && !trail.mesh.material.depthWrite && trail.mesh.material.transparent);
  } finally {trail.dispose();}
});

test('a hidden, teleported or reconstructed orb never draws the intervening line',async()=>{
  const {trail,geometry,point,path}=await setup();
  try {
    point(1);assert.equal(trail.mesh.visible,false);
    point(2);assert.equal(trail.mesh.visible,true);
    point(18);assert.equal(geometry.drawRange.count,0);
    point(19);assert.deepEqual(path(),[[18,0,0,1],[19,0,0,0]]);
    point(20,0,0,true);assert.equal(trail.mesh.visible,false);
    point(21);trail.clear();assert.equal(geometry.drawRange.count,0);
    point(-32);point(-31);
    assert.deepEqual(path(),[[-32,0,0,1],[-31,0,0,0]]);
  } finally {trail.dispose();}
});

test('slow curved travel keeps its exact cutoff and fixed GPU buffers through ring wrap and growth',async()=>{
  const {trail,point,path,geometry}=await setup();
  const buffers=[...Object.values(geometry.attributes)];
  try {
    const points=[], lengths=[];let total=0;
    for(let i=0;i<9000;i++){
      const x=i*.0034,y=.35*Math.sin(i*.012),z=.18*Math.cos(i*.014);
      if(i)total+=Math.hypot(x-points[i-1][0],y-points[i-1][1],z-points[i-1][2]);
      points.push([x,y,z]);lengths.push(total);point(x,y,z);
    }
    const start=total-10,index=lengths.findIndex(s=>s>=start);
    const a=points[index-1], b=points[index], u=(start-lengths[index-1])/(lengths[index]-lengths[index-1]);
    const visible=path(), tail=visible[0], head=visible.at(-1);
    a.forEach((v,k)=>assert.ok(Math.abs(tail[k]-(v+(b[k]-v)*u))<.00001));
    assert.deepEqual([tail[3],head[3]],[10,0]);
    assert.ok(visible.length<=161);
    assert.deepEqual(Object.values(geometry.attributes),buffers);
  } finally {trail.dispose();}
});
