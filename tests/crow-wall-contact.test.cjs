const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<.00003, `${actual} != ${expected}`);

test('contact is measured from the rendered facade, its roof and their finite corner in metres', async () => {
  const {createCrowWallContact,CROW_WALL_CONTACT_M} = await import('../yard/crow-wall-contact.js');
  const wall = createCrowWallContact({buildings:[{
    heightM:6, footprint:[[0,0],[8,0],[8,8],[0,8],[0,0]],
  }]});
  const sample = (x,y,z) => wall.distanceToHouse(0,x,y,z);
  // These four walls are offset inwards by .02 m for this winding.
  const surface = .02, roof = 6.05;
  near(sample(4,3,surface),0);
  near(sample(4,3,surface-.1),CROW_WALL_CONTACT_M);
  assert.ok(sample(4,3,surface-.11)>CROW_WALL_CONTACT_M);
  assert.ok(sample(4,3,surface-.09)<CROW_WALL_CONTACT_M);
  near(sample(4,roof+.10,4),CROW_WALL_CONTACT_M);
  near(sample(4,roof+.08,surface-.06),CROW_WALL_CONTACT_M);
  near(sample(surface-.06,3,surface-.08),CROW_WALL_CONTACT_M);
  near(sample(4,2,4),-2);
  assert.equal(wall.distanceToHouse(0,1,20,1,.1),Infinity);
});

test('a notch inside a house bounding box is still outdoors, even near its reentrant corner', async () => {
  const {createCrowWallContact} = await import('../yard/crow-wall-contact.js');
  const wall = createCrowWallContact({buildings:[{
    heightM:9, footprint:[[0,0],[8,0],[8,3],[3,3],[3,8],[0,8]],
  }]});
  near(wall.distanceToHouse(0,6,4,6),3.02);
  near(wall.distanceToHouse(0,3.03,4,3.03),.05);
  near(wall.distanceToHouse(0,2.92,4,2.90),-.10);
  near(wall.distanceToHouse(0,2,4,6),-.98);
});

test('the ten-centimetre crow effect follows the top and both sides of the nine-storey parapet', async () => {
  const {createCrowWallContact} = await import('../yard/crow-wall-contact.js');
  const {roofParapet} = await import('../yard/roof-geometry.js');
  const index = layout.buildings.findIndex(b=>b.id==='house-14');
  const rim = roofParapet(layout.buildings[index]), wall = createCrowWallContact(layout);
  const [a,b] = rim.outer, dx=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dx,dz);
  const side = Math.sign(dx*(rim.inner[0][1]-a[1])-dz*(rim.inner[0][0]-a[0]));
  function sample(inward, height, limit) {
    const x=(a[0]+b[0])/2-inward*side*dz/length;
    const z=(a[1]+b[1])/2+inward*side*dx/length;
    return wall.distanceToHouse(index,x,rim.baseY+height,z,limit);
  }
  near(sample(.20,.50,.101),.10);
  near(sample(-.10,.30),.10);
  near(sample(.50,.30),.10);
  near(sample(.20,.35),-.05);
  near(sample(2,.25),.25);
  near(sample(.46,.48),.10);
});

test('the current courtyard sends adjacent houses to the shader and culls open sky and deep interiors', async () => {
  const {createCrowWallContact} = await import('../yard/crow-wall-contact.js');
  const wall = createCrowWallContact(layout);
  const ids = new Float32Array(5);
  ids.fill(77);
  // Shared endpoint of house 46-a and 46-b. Leave unrelated instances intact.
  wall.resolve(105.72,5,-80.69,ids,2);
  assert.deepEqual([...ids.slice(2,4)].sort(),[5,6]);
  assert.equal(ids[0],77); assert.equal(ids[1],77); assert.equal(ids[4],77);
  wall.resolve(105.72,16,-80.69,ids);
  assert.deepEqual([...ids.slice(0,2)],[-1,-1]);
  wall.resolve(-55.5,8,75,ids);
  assert.deepEqual([...ids.slice(0,2)],[-2,-1]);
  wall.resolve(layout.spawn.x,.4,layout.spawn.z,ids);
  assert.deepEqual([...ids.slice(0,2)],[-1,-1]);
  assert.equal(wall.maxEdges,Math.max(...layout.buildings.map(b=>b.footprint.length)));
  for (let i=0;i<layout.buildings.length;i++) {
    const b=layout.buildings[i], first=wall.buildings[i*4]*4, [a,c]=b.footprint;
    const len=Math.hypot(c[0]-a[0],c[1]-a[1]);
    // Project the stored wall back onto the exact normal used by addWall.
    near(((wall.edges[first]-a[0])*(a[1]-c[1])+(wall.edges[first+1]-a[1])*(c[0]-a[0]))/len,.02);
    near(wall.buildings[i*4+3],b.heightM+.05);
  }
});
