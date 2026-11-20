const test = require('node:test');
const assert = require('node:assert/strict');

const openCourt = {walkable:[[-150,-150],[150,-150],[150,150],[-150,150]], movement:{eyeM:1.5}};
const opening = {x:-40, y:1.5, z:-30, yaw:0, mode:'land'};

async function court(seed) {
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 2**32);
  const flock = createCrowFlock(openCourt, opening, {random});
  for (const bird of flock.allBirds.slice(1)) {
    const x = bird.id * 5, z = 35;
    Object.assign(bird,{x,z,y:.2,roamX:x,roamZ:z,roamAt:Infinity,airborne:0,vx:0,vy:0,vz:0,
      yaw:0,speed:0,mode:'perch',wingPhase:0,gaitPhase:0});
  }
  return flock;
}

test('the same nineteen birds keep their identity and wing and stride cadence across visits', async () => {
  const first = await court(3), second = await court(731);
  assert.equal(first.allBirds.length,19);
  for (const bird of first.allBirds) {
    assert.equal(bird.personality, second.allBirds[bird.id].personality);
    if (bird.id) bird.roamX += 2;
  }
  first.update(.1, opening);
  const strides = new Set(), strokes = new Set();
  for (const bird of first.allBirds.slice(1)) {
    const {pace,flap} = bird.personality.habits;
    assert.ok(bird.speed>0);
    assert.ok(Math.abs(bird.gaitPhase / bird.speed - 1.1 * pace) < 1e-8);
    assert.ok(Math.abs(bird.wingPhase - .1 * 2 * Math.PI * 2.85 * flap) < 1e-8);
    strides.add(pace); strokes.add(flap);
  }
  assert.ok(strides.size > 4 && strokes.size > 4);
});

test('a timid forager moves away from a stranger while a bolder bird keeps its spot', async () => {
  const birds = (await court(9)).allBirds.slice(1,13);
  birds.sort((a,b) => a.personality.habits.boldness-b.personality.habits.boldness);
  async function encounter(id) {
    const flock = await court(9), bird = flock.allBirds[id], visitor = flock.allBirds[15];
    Object.assign(bird, {x:0, z:0, roamX:0, roamZ:0});
    Object.assign(visitor, {x:1.19, z:0, roamX:1.19, roamZ:0});
    for (let i=0; i<22; i++) flock.update(1/60, opening);
    assert.ok(bird.neighbourLook>0, 'the bird watches the stranger beside its feeding spot');
    return -bird.x;
  }
  const retreat = await encounter(birds[0].id);
  const hold = await encounter(birds.at(-1).id);
  assert.ok(retreat > hold + .07, JSON.stringify({retreat,hold}));
});
