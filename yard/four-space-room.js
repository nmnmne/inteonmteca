import * as THREE from './vendor/three.module.js';

// Each cube on the boundary of a four-box cuts the W plane in one polygon.
// Index its perimeter by intersected edges; no tetrahedron diagonals are drawn.
function edgesOf(dimensions) {
  const edges=[];
  for (let a=0;a<2**dimensions;a++) for (let bit=1;bit<2**dimensions;bit*=2) {
    if (!(a&bit)) edges.push([a,a|bit]);
  }
  return edges;
}
const cubeEdges=edgesOf(3), boxEdges=edgesOf(4);
function cubePerimeter(mask) {
  const links=cubeEdges.map(()=>[]);
  let first=-1;
  for (const bit of [1,2,4]) for (const side of [0,bit]) {
    const cut=[];
    cubeEdges.forEach(([a,b],i)=>{
      if ((a&bit)===side && (b&bit)===side && (((mask>>a)^(mask>>b))&1)) cut.push(i);
    });
    if (cut.length===2) {
      const [a,b]=cut;
      links[a].push(b);links[b].push(a);first=a;
    }
  }
  if (first<0) return [];
  const path=[];
  let previous=-1, current=first;
  do {
    path.push(current);
    const neighbours=links[current];
    if (neighbours.length!==2) return []; // A nonplanar sign pattern.
    const next=neighbours[0]===previous ? neighbours[1] : neighbours[0];
    previous=current;current=next;
  } while (current!==first);
  return path;
}
const perimeters=Array.from({length:256},(_,mask)=>cubePerimeter(mask));
const facets=[];
for (const bit of [1,2,4,8]) for (const side of [0,bit]) {
  const corners=Array.from({length:16},(_,i)=>i).filter(i=>(i&bit)===side);
  const links=cubeEdges.map(([a,b])=>boxEdges.findIndex(([x,y])=>x===corners[a] && y===corners[b]));
  facets.push({corners,links});
}

// XYZ and W have the same metric inside this operation. The eight faces of
// a general cut are planar convex polygons (some can be empty).
export function sliceFourBox(vertices, plane, onFace, hits=new Float32Array(32*3)) {
  let mask=0;
  for (let i=0;i<16;i++) if (vertices[4*i+3]<plane) mask|=1<<i;
  if (!mask || mask===65535) return;
  boxEdges.forEach(([a,b],id)=>{
    if (!(((mask>>a)^(mask>>b))&1)) return;
    const first=4*a, second=4*b;
    const t=(plane-vertices[first+3])/(vertices[second+3]-vertices[first+3]);
    for (let j=0;j<3;j++) hits[3*id+j]=vertices[first+j]+t*(vertices[second+j]-vertices[first+j]);
  });
  facets.forEach(({corners,links},face)=>{
    let code=0;
    for (let i=0;i<8;i++) code|=((mask>>corners[i])&1)<<i;
    const loop=perimeters[code];
    if (loop.length>=3) onFace(face,loop,links,hits);
  });
}

const chambers=[
  {x:-.45,z:3.65,w:-2.75,width:2.62,height:3.05,slant:-.88,ink:0x526e74,edge:0x93b9b5},
  {x:0,z:0,w:0,width:3.02,height:3.55,slant:.74,ink:0x606b80,edge:0xa4b9c8},
  {x:.34,z:-3.65,w:2.75,width:2.75,height:3.28,slant:-.67,ink:0x716578,edge:0xb9adc6}
];
function chamberBlocks(chamber) {
  const blocks=[];
  function beam(x,y,z,hx,hy,hz,trim=false) {
    const points=new Float64Array(16*4);
    for (let i=0;i<16;i++) {
      const u=x+((i&1)?hx:-hx), v=y+((i&2)?hy:-hy), s=z+((i&4)?hz:-hz), q=(i&8)?1:-1;
      points.set([u+chamber.slant*q, v+.17*q, s+.40*q, .53*u+.34*(v-1.55)+.39*s+1.52*q],4*i);
    }
    blocks.push({points,chamber,ink:new THREE.Color(trim?0x9b886e:chamber.ink),
      edge:new THREE.Color(trim?0xd1b591:chamber.edge)});
  }
  const r=chamber.width, h=chamber.height, depth=1.82;
  beam(0,.04,0,r,.065,depth);
  beam(0,h,0,r,.075,depth);
  // A wall with clerestory slots and a portico on the opposite side.
  beam(-r,.64,0,.09,.54,depth);
  beam(-r,h-.31,0,.09,.23,depth);
  for (const z of [-1.53,1.53]) {
    beam(-r,h/2,z,.115,h/2,.14);
    beam(r,h/2,z,.14,h/2,.14);
  }
  // The door has actual jambs and a lintel. Its centre stays open as the
  // oblique W slab enters at one jamb, crosses the lintel and leaves the other.
  const width=1.06;
  for (const side of [-1,1]) {
    beam(side*(r+width)/2,1.18,-1.57,(r-width)/2,1.1,.10);
    beam(side*(width+.01),1.19,-1.44,.04,1.09,.035,true);
  }
  beam(0,(h+2.3)/2,-1.57,r,(h-2.3)/2,.10);
  beam(0,2.32,-1.44,width+.05,.045,.035,true);
  return blocks;
}

function layer(capacity,lines) {
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  const color=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',position);geometry.setAttribute('color',color);
  geometry.setDrawRange(0,0);
  const common={vertexColors:true,transparent:true,depthWrite:false};
  const material=lines ? new THREE.LineBasicMaterial(common) : new THREE.MeshBasicMaterial({
    ...common,side:THREE.DoubleSide,forceSinglePass:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const mesh=lines ? new THREE.LineSegments(geometry,material) : new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  mesh.name=lines?'four-space-section-rims':'four-space-section-walls';
  mesh.userData.bakedShadowCaster=mesh.userData.bakedShadowReceiver=false;
  let used=0;
  return {mesh,begin(){used=0;},vertex(hits,id,ink,shade) {
    position.setXYZ(used,hits[3*id],hits[3*id+1],hits[3*id+2]);
    color.setXYZ(used,ink.r*shade,ink.g*shade,ink.b*shade);used++;
  },finish(){
    geometry.setDrawRange(0,used);
    for (const attr of [position,color]) {
      attr.clearUpdateRanges();if (used) attr.addUpdateRange(0,used*3);
      attr.needsUpdate=true;
    }
  },dispose(){geometry.dispose();material.dispose();}};
}

export function createSectionRooms() {
  const blocks=chambers.flatMap(chamberBlocks);
  // A sliced cube has at most six vertices per facet. Scalars never allocate
  // geometry during a camera pass; all rooms share two draw calls.
  const faces=layer(blocks.length*8*12,false), rims=layer(blocks.length*8*12,true);
  const group=new THREE.Group();
  group.name='four-space-section-rooms';group.visible=false;
  group.add(faces.mesh,rims.mesh);
  const vertices=new Float64Array(64), hits=new Float32Array(96);
  const shades=[.76,.93,.66,1,.82,.94,.74,1.09];
  let lastW=NaN,lastAngle=NaN;
  function update(w,rotation,visibility) {
    group.visible=visibility>.001;
    if (!group.visible) return;
    faces.mesh.material.opacity=.82*visibility;
    rims.mesh.material.opacity=.78*visibility;
    if (Math.abs(w-lastW)<.0001 && Math.abs(rotation-lastAngle)<.0001) return;
    lastW=w;lastAngle=rotation;
    const c=Math.cos(rotation),s=Math.sin(rotation);
    const tilt=.38*Math.sin(rotation), cz=Math.cos(tilt), sz=Math.sin(tilt);
    faces.begin();rims.begin();
    for (const {points,chamber,ink,edge} of blocks) {
      for (let i=0;i<64;i+=4) {
        const x=points[i],z=points[i+2],q=points[i+3];
        const rw=s*x+c*q;
        vertices[i]=chamber.x+c*x-s*q;
        vertices[i+1]=points[i+1];
        vertices[i+2]=chamber.z+cz*z-sz*rw;
        vertices[i+3]=chamber.w+sz*z+cz*rw;
      }
      sliceFourBox(vertices,4*w,(facet,loop,links,at)=>{
        for (let i=1;i<loop.length-1;i++) {
          faces.vertex(at,links[loop[0]],ink,shades[facet]);
          faces.vertex(at,links[loop[i]],ink,shades[facet]);
          faces.vertex(at,links[loop[i+1]],ink,shades[facet]);
        }
        for (let i=0;i<loop.length;i++) {
          const a=links[loop[i]], b=links[loop[(i+1)%loop.length]];
          // Both adjacent boundary faces contain this edge. Keep just one.
          const [a0,a1]=boxEdges[a], [b0,b1]=boxEdges[b];
          const sharedAxes=15 & ~((a0^a1) | (b0^b1) | (a0^b0));
          const axis=1<<(facet>>1);
          if (axis>(sharedAxes^axis)) continue;
          rims.vertex(at,a,edge,1);rims.vertex(at,b,edge,1);
        }
      },hits);
    }
    faces.finish();rims.finish();
  }
  return {group,update,dispose(){group.removeFromParent();faces.dispose();rims.dispose();}};
}
