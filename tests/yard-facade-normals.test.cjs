const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const {resolveFacadeAnchor} = await import('../yard/site-details.js');
  const {pointInRing} = await import('../yard/navigation.js');
  const layout = JSON.parse(fs.readFileSync('yard/data/site-layout.json', 'utf8'));
  for (const building of layout.buildings) {
    building.footprint.forEach((a, edgeIndex) => {
      const b = building.footprint[(edgeIndex + 1) % building.footprint.length];
      const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
      const p = resolveFacadeAnchor(layout, {buildingId:building.id, edgeIndex, alongM:length/2, offsetM:0.1});
      assert.equal(pointInRing(p.x,p.z,building.footprint), false, `${building.id} edge ${edgeIndex} details must be outside even on concave footprints`);
    });
  }
  console.log('PASS: all facade normals outside footprints');
})().catch(error=>{console.error(error);process.exitCode=1;});
