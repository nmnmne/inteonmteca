const test=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');
const rectangle=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const house=footprint=>({footprint,heightM:10});
async function routerFor(buildings,utilityStructures) {
  const {createCrowFlightRouter}=await import('../yard/crow-flight-route.js');
  return createCrowFlightRouter({buildings,utilityStructures});
}
function follow(router,bird,goal) {
  const trail=[],aims=new Set();
  for (let i=0;i<2000;i++) {
    if (Math.hypot(bird.x-goal[0],bird.y-goal[1],bird.z-goal[2])<.05) return {trail,aims};
    const aim=router.waypoint(bird,...goal),dy=(aim.y??goal[1])-bird.y,dx=aim.x-bird.x,dz=aim.z-bird.z;
    if (aim.detour) aims.add(aim.x.toFixed(1)+','+aim.z.toFixed(1));
    const t=Math.min(1,.23/Math.max(1e-6,Math.hypot(dx,dy,dz)));
    const x=bird.x+dx*t,y=bird.y+dy*t,z=bird.z+dz*t;
    assert.ok(router.clearStep(bird.x,bird.y,bird.z,x,y,z),'all legs of the chosen detour must be traversable');
    Object.assign(bird,{x,y,z});trail.push([x,y,z]);
  }
  assert.fail('bird did not return to its goal');
}
test('fly around a long or L-shaped building and a compound of touching houses using stable corners',async()=>{
  const shapes=[
    {rings:[rectangle(-18,-2,18,2)],start:[0,-6],goal:[.1,4,6]},
    {rings:[[[0,0],[16,0],[16,5],[5,5],[5,22],[0,22]]],start:[12,9],goal:[-4,4,9]},
    {rings:[rectangle(-3,-7,3,7),rectangle(3,3,19,10)],start:[-7,5],goal:[22,4,6]},
  ];
  for (const {rings,start,goal} of shapes) {
    const router=await routerFor(rings.map(house)), bird={id:1,x:start[0],z:start[1],y:4};
    assert.equal(router.clearStep(bird.x,bird.y,bird.z,...goal),false);
    const {trail,aims}=follow(router,bird,goal);
    assert.ok(aims.size>=1 && aims.size<=8,'a steady path through surveyed corners');
    assert.ok(trail.length>30 && trail.length<350);
  }
  const notch=await routerFor(shapes[1].rings.map(house));
  assert.ok(notch.clearStep(8,4,7,13,4,15),'open part of the bounding rectangle is accessible');
});
test('a target inside a house waits on the accessible side and is intercepted after it exits',async()=>{
  const router=await routerFor([house(rectangle(-10,-2,10,2))]), bird={id:3,x:0,y:4,z:-6};
  const first={...router.waypoint(bird,0,4,0)};
  assert.ok(first.detour && first.z< -2.9);
  Object.assign(bird,{x:first.x,z:first.z});
  for (let i=0;i<100;i++) {
    const wait=router.waypoint(bird,Math.sin(i)*.06,4,Math.cos(i)*.06);
    assert.equal(wait.x,first.x);assert.equal(wait.z,first.z);
  }
  const goal=[.1,4,5];follow(router,bird,goal);
  assert.equal(router.waypoint(bird,...goal).detour,false);
});
test('swept collision handles climbing, roof descent, the tower parapet and the sloped kiosk',async()=>{
  const router=await routerFor([house(rectangle(-4,-3,4,3))]);
  assert.equal(router.clearStep(-10,2,0,10,16,0),false);
  assert.ok(router.clearStep(-8,11,0,8,11,0));
  assert.equal(router.clearStep(0,13,0,0,5,0),false);
  assert.ok(router.clearStep(0,13,0,0,10.25,0),'feet can settle on a flat roof');
  const bird={id:2,x:0,y:10.25,z:0};follow(router,bird,[9,2,0]);
  const tower={...house(rectangle(-8,-8,8,8)),roofParapetM:{height:.65,width:.4}};
  const rim=await routerFor([tower]);
  assert.equal(rim.clearStep(0,10.75,0,12,10.75,0),false);
  assert.ok(rim.clearStep(0,11.2,0,12,11.2,0));
  const kiosk={...house(rectangle(-2,-3,2,3)),heightM:3,role:'electric-kiosk'};
  const booth=await routerFor([], [kiosk]);
  assert.equal(booth.clearStep(-6,3.7,0,6,3.7,0),false);
  assert.ok(booth.clearStep(-6,4.2,0,6,4.2,0));
});
test('a spawn or a moving target at the real shared building corner can be placed entirely outside',async()=>{
  const router=await routerFor(layout.buildings,layout.utilityStructures);
  const corner=layout.buildings.find(b=>b.id==='house-46-b').footprint.at(-1);
  assert.equal(router.clearStep(corner[0],3,corner[1],corner[0],3,corner[1]),false);
  const spawn=router.safePoint(corner[0],3,corner[1]);
  assert.ok(Math.hypot(spawn.x-corner[0],spawn.z-corner[1])>1);
  assert.ok(router.clearStep(spawn.x,3,spawn.z,spawn.x,3,spawn.z));
});
