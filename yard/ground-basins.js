import * as THREE from './vendor/three.module.js';
import { distanceToSegment, isWalkable, pointInRing } from './navigation.js';

function bounds(ring) {
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  return {ring, west:Math.min(...xs), east:Math.max(...xs), north:Math.min(...zs), south:Math.max(...zs)};
}

function nearRing(x, z, r, area) {
  if (x < area.west-r || x > area.east+r || z < area.north-r || z > area.south+r) return false;
  return pointInRing(x,z,area.ring) || nearEdge(x,z,r,area.ring);
}

function nearEdge(x, z, r, ring) {
  return ring.some((a, i) => {
    const b = ring[(i+1) % ring.length];
    return distanceToSegment(x,z,a[0],a[1],b[0],b[1]) < r;
  });
}

// Both the original baked shore and the small additional basins share one
// draw, the shadow receiver and the courtyard's existing reflection atlas.
export function groundBasinGeometry(layout) {
  const lot = bounds(layout.walkable);
  const position = [], profile = [], uv = [], normal = [], index = [];
  function vertex(x,y,z,depth,kind) {
    position.push(x,y,z); normal.push(0,1,0); profile.push(depth,kind);
    uv.push((x-lot.west)/(lot.east-lot.west), (lot.south-z)/(lot.south-lot.north));
  }
  vertex(lot.west,.034,lot.north,0,0); vertex(lot.west,.034,lot.south,0,0);
  vertex(lot.east,.034,lot.north,0,0); vertex(lot.east,.034,lot.south,0,0);
  index.push(0,1,2,2,1,3);
  let seed = 9183621;
  const rand = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
  const lawns = (layout.landscaping?.patches || []).map(p => ({...bounds(p.polygon), holes:(p.holes || []).map(bounds)}));
  const paths = (layout.landscaping?.paths || []).map(p => bounds(p.polygon));
  for (const s of layout.surfaces || []) if (s.kind !== 'asphalt') paths.push(bounds(s.polygon));
  const roads = [];
  for (const road of layout.roads || []) {
    if (road.render === false || road.kind !== 'asphalt') continue;
    for (let i=1; i<road.centerline.length; i++) {
      const [ax,az] = road.centerline[i-1], [bx,bz] = road.centerline[i];
      roads.push({ax,az,bx,bz,width:road.widthM, foot:road.id==='spawn-pedestrian-link'});
    }
  }
  const onStrip = (x,z,r,road) => distanceToSegment(x,z,road.ax,road.az,road.bx,road.bz) < road.width/2 + r;
  const pathsOnly = roads.filter(road => road.foot);
  function clear(x,z,r) {
    return pointInRing(x,z,lot.ring) && !nearEdge(x,z,r,lot.ring) && isWalkable(layout,x,z,r) &&
      !paths.some(p => nearRing(x,z,r,p)) && !pathsOnly.some(road => onStrip(x,z,r,road));
  }
  function overlapsLawn(x,z,r,lawn) {
    if (!nearRing(x,z,r,lawn)) return false;
    return !lawn.holes.some(hole => pointInRing(x,z,hole.ring) && !nearEdge(x,z,r,hole.ring));
  }
  function stamp(x,z,length,width,angle,kind) {
    const base = position.length / 3, sides=14, y=kind===1 ? .038 : .052;
    vertex(x,y,z,1,kind);
    const a=rand()*Math.PI*2, b=rand()*Math.PI*2, cos=Math.cos(angle), sin=Math.sin(angle);
    for (let i=0; i<sides; i++) {
      const t = i * Math.PI*2 / sides;
      const r = .84+.10*Math.sin(3*t+a)+.06*Math.cos(5*t+b);
      const u = length*r*Math.cos(t), v=width*r*Math.sin(t);
      vertex(x+u*cos-v*sin,y,z+u*sin+v*cos,0,kind);
      index.push(base,base+1+(i+1)%sides,base+1+i);
    }
  }
  for (const road of roads) {
    if (road.foot) continue;
    const dx=road.bx-road.ax, dz=road.bz-road.az, span=Math.hypot(dx,dz);
    const angle=Math.atan2(dz,dx);
    // Elongated wheel ruts sit either side of each mapped road's centre.
    for (let s=2; s<span-2; s+=2.0+rand()*2.1) {
      const side = (rand()<.5 ? -1 : 1)*road.width*(.12+rand()*.12);
      const x=road.ax+(s*dx-side*dz)/span, z=road.az+(s*dz+side*dx)/span;
      const length=.82+rand()*1.42, width=Math.min(.38+rand()*.51,road.width*.22);
      if (clear(x,z,length) && !lawns.some(lawn => overlapsLawn(x,z,length,lawn))) {
        stamp(x,z,length,width,angle+(rand()-.5)*.12,1);
      }
    }
  }
  for (const lawn of lawns) {
    // Sampling the bounding box then rejecting points outside its polygon
    // yields a uniform, low density even on thin or concave planting beds.
    const w=lawn.east-lawn.west, h=lawn.south-lawn.north;
    const trials=Math.ceil(w*h/135);
    for (let i=0; i<trials; i++) {
      const x=lawn.west+w*rand(), z=lawn.north+h*rand(), length=.30+rand()*.52;
      if (!pointInRing(x,z,lawn.ring) || nearEdge(x,z,length,lawn.ring) ||
          lawn.holes.some(hole=>nearRing(x,z,length,hole)) || !clear(x,z,length) ||
          roads.some(road=>onStrip(x,z,length,road))) continue;
      stamp(x,z,length,length*(.51+.33*rand()),Math.PI*rand(),2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('basinProfile',new THREE.Float32BufferAttribute(profile,2));
  geometry.setIndex(index);
  return geometry;
}
