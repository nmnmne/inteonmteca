const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

async function physicalHouses() {
  const {createCrowWallContact} = await import('../yard/crow-wall-contact.js');
  const {gableProfile} = await import('../yard/roof-geometry.js');
  const {Plane, Vector3} = await import('../yard/vendor/three.module.js');
  const buildings = [...layout.buildings, ...layout.utilityStructures.filter(b => b.role === 'electric-kiosk')];
  const solids = createCrowWallContact({buildings});
  return buildings.map((building, id) => {
    const gable = gableProfile(building);
    if (!gable) return {id:building.id, distance:(x,y,z,limit) => solids.distanceToHouse(id,x,y,z,limit)};
    const vec = ([x,z], y) => new Vector3(x,y,z);
    const slopes = [gable.left, gable.right].map(([a,b]) => {
      const plane = new Plane().setFromCoplanarPoints(vec(a,gable.eaveY),vec(b,gable.eaveY),vec(gable.ridge[0],gable.ridgeY));
      return plane.normal.y < 0 ? plane.negate() : plane;
    });
    const point = new Vector3();
    return {id:building.id, distance(x,y,z,limit) {
      // Signed distances to both roof planes include the space below the sloped
      // metal. The footprint at mid-wall height provides the finite walls.
      const horizontal = solids.distanceToHouse(id,x,1,z,limit);
      if (horizontal === Infinity) return Infinity;
      point.set(x,y,z);
      return Math.max(horizontal, -y, slopes[0].distanceToPoint(point), slopes[1].distanceToPoint(point));
    }};
  });
}

// Signed distances change by at most the distance travelled. An interval whose
// midpoint is farther outside than its half-length cannot pierce any wall or
// roof. Subdivide ambiguous intervals to a two-millimetre penetration tolerance.
function crosses(house, a, b, length, tolerance = .002) {
  const mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:(a.z+b.z)/2};
  const half = length / 2;
  const d = house.distance(mid.x,mid.y,mid.z,half);
  if (d < -tolerance) return true;
  if (d + tolerance >= half) return false;
  return crosses(house,a,mid,half,tolerance) || crosses(house,mid,b,half,tolerance);
}

const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const point = ({x,y,z}) => ({x,y,z});

test('only the viewing crow can cross a physical house; companions travel around it and rejoin', async t => {
  const {createAutoWalk, ambientOpeningView} = await import('../yard/auto-walk.js');
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const houses = await physicalHouses();
  const traversed = new Set(), reunited = new Set(), movers = new Set();
  for (let seed of [7,29]) {
    const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 2**32);
    const view = ambientOpeningView(layout);
    const flock = createCrowFlock(layout,view,{random});
    const walk = createAutoWalk(layout,{openingView:view,random,flock});
    const birds = flock.allBirds, previous = birds.map(point), origin = birds.map(point);
    const active = new Map(), returning = [];
    assert.equal(birds.length,19);
    for (let frame = 0; frame < 150*60; frame++) {
      const pose = walk.update(1/60);
      assert.equal(pose.x,birds[0].x);
      assert.equal(pose.z,birds[0].z);
      for (const house of houses) {
        if (house.distance(pose.x,pose.y,pose.z,0) < -.25) {
          if (!active.has(house)) active.set(house,{
            house, entry:point(pose), followers:birds.slice(1).filter(b => b.inParty).map(b => ({id:b.id,from:point(b)})),
          });
        } else if (active.has(house)) {
          const crossing = active.get(house);
          active.delete(house);
          if (distance(crossing.entry,pose) > 7) {
            traversed.add(house.id);
            returning.push({...crossing, expires:frame + 18*60});
          }
        }
      }
      for (const bird of birds.slice(1)) {
        const prev = previous[bird.id], length = distance(prev,bird);
        assert.ok(Number.isFinite(length), 'finite position for crow '+bird.id);
        for (const house of houses) {
          if (crosses(house,prev,bird,length)) {
            assert.fail('crow '+bird.id+' entered '+house.id+' at '+(frame/60).toFixed(2)+' s from '+
              JSON.stringify(prev)+' to '+JSON.stringify(point(bird)));
          }
        }
        if (distance(bird,origin[bird.id])>2) movers.add(bird.id);
        Object.assign(prev,point(bird));
      }
      for (let i=returning.length-1; i>=0; i--) {
        const crossing=returning[i];
        if (frame>crossing.expires) { returning.splice(i,1); continue; }
        for (const {id,from} of crossing.followers) {
          const bird = birds[id];
          if (bird.inParty && distance(bird,pose)<18 && crosses(crossing.house,from,bird,distance(from,bird),.25)) {
            // A straight flight from this follower's entry-side position to its
            // current position would have cut through the house. Its measured
            // path stayed outside throughout and it caught up with the leader.
            reunited.add(id);
          }
        }
      }
    }
  }
  t.diagnostic('Five simulated minutes: '+movers.size+' moving companions, '+traversed.size+' houses crossed by the POV, '+reunited.size+' companions rejoined after a physical detour.');
  assert.equal(movers.size,18);
  assert.ok(traversed.size>=1,'the normal POV itinerary crossed a house');
  assert.ok(reunited.size>=1,'a companion bypassed a house and returned to the same party');
});
