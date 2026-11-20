// The distance is from a point on the moving plumage to the physical house.
export const CROW_WALL_CONTACT_M = .10;
const birdRadius = 1.15; // Encloses the animated wings, tail and ground hop.

function wallCorners(footprint) {
  // addWall offsets each facade 2 cm along its left normal. Intersect those
  // offset planes at each corner, preserving the recesses of house 14 and tower 34.
  const ring = footprint.filter(([x,z],i) => {
    const next = footprint[(i+1)%footprint.length];
    return x!==next[0] || z!==next[1];
  });
  if (ring.length < 3) return [];
  const normals = ring.map(([x,z], i) => {
    const [nextX,nextZ] = ring[(i+1)%ring.length];
    const dx = nextX-x, dz = nextZ-z, len = Math.hypot(dx,dz);
    return [-dz/len, dx/len];
  });
  return ring.map(([x,z], i) => {
    const a = normals[(i+ring.length-1)%ring.length], b = normals[i];
    const joint = 1+a[0]*b[0]+a[1]*b[1];
    if (joint < .000001) return [x+.02*b[0], z+.02*b[1]];
    const miter = .02 / joint;
    return [x+(a[0]+b[0])*miter, z+(a[1]+b[1])*miter];
  });
}

export function createCrowWallContact(layout) {
  const source = layout?.buildings || [];
  const edgeData = [], inverseLengths = [], bounds = [];
  const buildings = new Float32Array(source.length*4);
  let maxEdges = 0;
  for (let i=0; i<source.length; i++) {
    const {footprint,heightM} = source[i];
    const ring = wallCorners(footprint);
    const first = edgeData.length/4;
    const roof = heightM+.05; // Flat roof surface drawn by createYardScene.
    let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
    for (let j=0; j<ring.length; j++) {
      const [ax,az] = ring[j], [bx,bz] = ring[(j+1)%ring.length];
      edgeData.push(ax,az,bx,bz);
      inverseLengths.push(1/((bx-ax)**2+(bz-az)**2));
      minX=Math.min(minX,ax); maxX=Math.max(maxX,ax);
      minZ=Math.min(minZ,az); maxZ=Math.max(maxZ,az);
    }
    bounds.push({minX,maxX,minZ,maxZ});
    buildings.set([first,ring.length,0,roof], i*4);
    maxEdges = Math.max(maxEdges,ring.length);
  }
  // Static vec4 arrays shared with the plumage shader. A candidate is tested
  // against finite segments, including inner corners, and both vertical caps.
  const edges = Float32Array.from(edgeData);

  function distanceToHouse(id,x,y,z,maxDistance=Infinity) {
    const box = bounds[id], meta = id*4;
    if (!box || x < box.minX-maxDistance || x > box.maxX+maxDistance ||
        z < box.minZ-maxDistance || z > box.maxZ+maxDistance) return Infinity;
    const vertical = Math.max(buildings[meta+2]-y, y-buildings[meta+3]);
    if (vertical > maxDistance) return Infinity;
    const first = buildings[meta], end = first+buildings[meta+1];
    let inside = false, nearestSq = Infinity;
    for (let j=first; j<end; j++) {
      const e=j*4, ax=edges[e], az=edges[e+1], bx=edges[e+2], bz=edges[e+3];
      const px=x-ax, pz=z-az, dx=bx-ax, dz=bz-az;
      const t=Math.max(0,Math.min(1,(px*dx+pz*dz)*inverseLengths[j]));
      const sx=px-t*dx, sz=pz-t*dz;
      nearestSq = Math.min(nearestSq,sx*sx+sz*sz);
      if ((az>z)!==(bz>z) && px < pz*dx/dz) inside = !inside;
    }
    const horizontal = Math.sqrt(nearestSq)*(inside ? -1 : 1);
    const d = horizontal>0 && vertical>0 ? Math.hypot(horizontal,vertical) : Math.max(horizontal,vertical);
    return d > maxDistance ? Infinity : d;
  }

  function resolve(x,y,z,out,offset=0) {
    // House 46-a and 46-b meet at one vertex; both volumes can intersect a wing.
    let first=-1, second=-1, firstDistance=Infinity, secondDistance=Infinity;
    for (let id=0; id<source.length; id++) {
      const d = distanceToHouse(id,x,y,z,birdRadius+CROW_WALL_CONTACT_M);
      if (d < -birdRadius) { first=-2; second=-1; break; }
      if (d < firstDistance) {
        second=first; secondDistance=firstDistance;
        first=id; firstDistance=d;
      } else if (d < secondDistance) {
        second=id; secondDistance=d;
      }
    }
    out[offset]=first; out[offset+1]=second;
  }

  return {edges,buildings,maxEdges,distanceToHouse,resolve};
}
