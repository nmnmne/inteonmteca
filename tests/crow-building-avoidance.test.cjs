const test = require('node:test');
const assert = require('node:assert/strict');

const house = {id:'block', heightM:14, roof:'flat', footprint:[[-4,-8],[4,-8],[4,8],[-4,8]]};
const court = {buildings:[house], walkable:[[-80,-60],[80,-60],[80,60],[-80,60]], movement:{eyeM:1.35}};
const opening = {x:-17, y:3.5, z:0, yaw:Math.PI/2, mode:'land', fov:64};

async function fixture(view = opening, seed = 731, layout = court) {
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const random = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  return createCrowFlock(layout,view,{random});
}

function checkSegment(from, to) {
  const distance = Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
  const steps = Math.max(1,Math.ceil(distance/.2));
  for (let i=0; i<=steps; i++) {
    const t = i/steps, y=from.y+(to.y-from.y)*t;
    if (y>15) continue;
    const x=from.x+(to.x-from.x)*t, z=from.z+(to.z-from.z)*t;
    const gap=Math.hypot(Math.max(0,Math.abs(x)-4),Math.max(0,Math.abs(z)-8));
    assert.ok(gap>=.85-1e-7, 'bird '+to.id+' clipped the house at '+[x,y,z]);
  }
}

test('the observer crosses a building while its escort and both visiting families stay outside it', async () => {
  const flock=await fixture();
  const birds=flock.allBirds.slice(1);
  const escort=birds[0];
  Object.assign(escort,{x:-12,y:3.5,z:0,vx:0,vy:0,vz:0,called:true,inParty:true,slot:0,
    launchAt:0,formationSide:0,formationForward:1});
  let crossed=false, furthest=0;
  for (let frame=0;frame<680;frame++) {
    const from=birds.map(({x,y,z})=>({x,y,z}));
    const x=Math.min(15,opening.x+frame*.15);
    const pose={...opening,x,mode:'flap'};
    flock.update(.05,pose);
    assert.equal(flock.birds[0].x,x);
    crossed ||= Math.abs(x)<3;
    for (let i=0;i<birds.length;i++) checkSegment(from[i],birds[i]);
    furthest=Math.max(furthest,Math.abs(escort.z));
  }
  assert.ok(crossed);
  assert.ok(furthest>8.85,'escort went around an end of the house');
  assert.ok(escort.x>9,'escort rejoined the observer on the far side');
});

test('even a scene restored inside a house spawns all eighteen other birds outside',async()=>{
  const inside={...opening,x:0,z:0};
  for(const seed of [9,44,183]){
    const flock=await fixture(inside,seed);
    assert.deepEqual([flock.birds[0].x,flock.birds[0].z],[0,0]);
    assert.equal(flock.allBirds.length,19);
    for(const bird of flock.allBirds.slice(1))checkSegment(bird,bird);
  }
});

test('an escort climbs past the roof edge before following above it, and descends outside again',async()=>{
  const layout={...court, buildings:[{...house, heightM:6}]};
  const start={...opening,x:-13,y:3,yaw:0}, flock=await fixture(start,717,layout);
  const bird=flock.birds[1];
  Object.assign(bird,{x:-13,y:2,z:0,called:true,inParty:true,slot:0,vx:0,vy:0,vz:0,
    formationSide:0,formationForward:0,launchAt:0});
  let over=false, clearAfterDescent=false;
  for(let frame=0;frame<400;frame++){
    const roof=frame<200;
    flock.update(.05,{...start,x:roof?0:14,y:roof?6.8:2,mode:'flap'});
    if(Math.abs(bird.x)<4 && Math.abs(bird.z)<8){
      assert.ok(bird.y>=6.18,'crow descended into the roof');
      over=true;
    }
    if(!roof && bird.x>10 && bird.y<5)clearAfterDescent=true;
  }
  assert.ok(over && clearAfterDescent);
});
