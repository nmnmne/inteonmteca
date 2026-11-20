import { wallCorners } from './facade-frame.js';
import { roofDeckY, roofParapet } from './roof-geometry.js';

// The distance is from a point on the moving plumage to the physical house.
export const CROW_WALL_CONTACT_M = .10;
const birdRadius = 1.15; // Encloses the animated wings, tail and ground hop.

function extrusionDistance(horizontal,vertical) {
  return horizontal>0 && vertical>0 ? Math.hypot(horizontal,vertical) : Math.max(horizontal,vertical);
}

export function createCrowWallContact(layout) {
  const source = layout?.buildings || [];
  const edgeData = [], inverseLengths = [], bounds = [];
  const buildings = new Float32Array(source.length*4);
  const parapets = new Float32Array(source.length*2);
  let maxEdges = 0;
  function appendRing(ring) {
    const first = edgeData.length/4;
    for (let j=0; j<ring.length; j++) {
      const [ax,az] = ring[j], [bx,bz] = ring[(j+1)%ring.length];
      edgeData.push(ax,az,bx,bz);
      inverseLengths.push(1/((bx-ax)**2+(bz-az)**2));
    }
    maxEdges = Math.max(maxEdges,ring.length);
    return first;
  }
  for (let i=0; i<source.length; i++) {
    const building = source[i], rim = roofParapet(building);
    const ring = rim?.outer || wallCorners(building.footprint);
    buildings.set([appendRing(ring),ring.length,0,roofDeckY(building)], i*4);
    if (rim) parapets.set([appendRing(rim.inner),rim.topY], i*2);
    const xs=ring.map(p=>p[0]), zs=ring.map(p=>p[1]);
    bounds.push({minX:Math.min(...xs), maxX:Math.max(...xs), minZ:Math.min(...zs), maxZ:Math.max(...zs)});
  }
  // Static vec4 arrays shared with the plumage shader. A candidate is tested
  // against finite segments, including inner corners, and both vertical caps.
  const edges = Float32Array.from(edgeData);

  function ringDistance(first,count,x,z) {
    const end = first+count;
    let inside = false, nearestSq = Infinity;
    for (let j=first; j<end; j++) {
      const e=j*4, ax=edges[e], az=edges[e+1], bx=edges[e+2], bz=edges[e+3];
      const px=x-ax, pz=z-az, dx=bx-ax, dz=bz-az;
      const t=Math.max(0,Math.min(1,(px*dx+pz*dz)*inverseLengths[j]));
      const sx=px-t*dx, sz=pz-t*dz;
      nearestSq = Math.min(nearestSq,sx*sx+sz*sz);
      if ((az>z)!==(bz>z) && px < pz*dx/dz) inside = !inside;
    }
    return Math.sqrt(nearestSq)*(inside ? -1 : 1);
  }

  function distanceToHouse(id,x,y,z,maxDistance=Infinity,profile=null) {
    const box = bounds[id], meta = id*4;
    if (!box || x < box.minX-maxDistance || x > box.maxX+maxDistance ||
        z < box.minZ-maxDistance || z > box.maxZ+maxDistance) return Infinity;
    const deck = buildings[meta+3], rimTop = parapets[id*2+1];
    if (y > Math.max(deck,rimTop)+maxDistance || -y > maxDistance) return Infinity;
    const count = buildings[meta+1], horizontal = ringDistance(buildings[meta],count,x,z);
    if (profile) { profile.horizontal=horizontal; profile.top=deck; }
    const floor = buildings[meta+2]-y;
    let d = extrusionDistance(horizontal,Math.max(floor,y-deck));
    if (rimTop && (y>deck || y-deck > Math.max(horizontal,floor))) {
      const inner = ringDistance(parapets[id*2],count,x,z);
      if (profile && horizontal<=0 && inner>=0) profile.top=rimTop;
      d = Math.min(d,extrusionDistance(Math.max(horizontal,-inner), Math.max(floor,y-rimTop)));
    }
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

  return {edges,buildings,parapets,maxEdges,distanceToHouse,resolve};
}
