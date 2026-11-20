const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('wet shoulders stay on the mapped drives, and lawn hollows are fewer and smaller', async () => {
  const { groundBasinGeometry } = await import('../yard/ground-basins.js');
  const { pointInRing, isWalkable, distanceToSegment } = await import('../yard/navigation.js');
  const geometry = groundBasinGeometry(layout);
  const position = geometry.getAttribute('position'), basin = geometry.getAttribute('basinProfile');
  const inPatch = (x,z,p) => pointInRing(x,z,p.polygon) && !p.holes?.some(h=>pointInRing(x,z,h));
  const roads = layout.roads.filter(r=>r.render!==false && r.kind==='asphalt');
  const onDrive = (x,z,road) => road.centerline.slice(1).some(([bx,bz],i)=>{
    const [ax,az]=road.centerline[i];
    return distanceToSegment(x,z,ax,az,bx,bz) <= road.widthM/2;
  });
  const centers=[0,0,0], area=[0,0,0];
  for (let i=4; i<position.count; i++) {
    const x=position.getX(i), z=position.getZ(i), kind=basin.getY(i);
    assert.ok(isWalkable(layout,x,z,0) && pointInRing(x,z,layout.walkable));
    assert.ok(!layout.landscaping.paths.some(path=>inPatch(x,z,path)));
    const lawn=layout.landscaping.patches.some(p=>inPatch(x,z,p));
    assert.equal(lawn,kind===2);
    assert.equal(roads.some(r=>r.id!=='spawn-pedestrian-link' && onDrive(x,z,r)),kind===1);
    assert.ok(!onDrive(x,z,roads.find(r=>r.id==='spawn-pedestrian-link')));
    if (basin.getX(i)===1) centers[kind]++;
  }
  for (let i=6; i<geometry.index.count; i+=3) {
    const [a,b,c]=[i,i+1,i+2].map(j=>geometry.index.getX(j));
    const dx=position.getX(b)-position.getX(a), dz=position.getZ(b)-position.getZ(a);
    const ex=position.getX(c)-position.getX(a), ez=position.getZ(c)-position.getZ(a);
    area[basin.getY(a)]+=(dz*ex-dx*ez)/2;
  }
  assert.ok(centers[2]>40 && centers[2]<centers[1]*.8, centers);
  assert.ok(area[1]>0 && area[2]>0 && area[1]/centers[1]>3*area[2]/centers[2], area);
  // Four original vertices and one indexed draw with no extra material groups.
  assert.equal(basin.getY(0),0);
  assert.equal(geometry.groups.length,0);
});
