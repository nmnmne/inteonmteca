import * as THREE from './vendor/three.module.js';
import {sliceFourBox} from './four-space-room.js';

// Outer envelope of the central chamber, with the same U,V,S,Q basis as its beams.
const halfWidth=3.02, height=3.55, halfDepth=1.82, projectionDistance=14;
const corners=new Float64Array(64), edges=[];
for (let i=0;i<16;i++) {
  const u=i&1?halfWidth:-halfWidth, v=i&2?height:0, s=i&4?halfDepth:-halfDepth, q=i&8?1:-1;
  corners.set([u+.74*q,v+.17*q,s+.40*q,.53*u+.34*(v-1.55)+.39*s+1.52*q],4*i);
  for (const bit of [1,2,4,8]) if (!(i&bit)) edges.push([i,i|bit,bit]);
}

function drawing(capacity,material,lines,name) {
  const geometry=new THREE.BufferGeometry();
  const positions=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positions);
  geometry.setDrawRange(0,0);
  const mesh=lines ? new THREE.LineSegments(geometry,material) : new THREE.Mesh(geometry,material);
  mesh.name=name; mesh.frustumCulled=false;
  mesh.userData.bakedShadowCaster=mesh.userData.bakedShadowReceiver=false;
  return {mesh,positions,finish(count){
    geometry.setDrawRange(0,count);
    positions.clearUpdateRanges();
    if (count) positions.addUpdateRange(0,count*3);
    positions.needsUpdate=true;
  }};
}

export function createFourSpaceModel() {
  const group=new THREE.Group(), frame=new THREE.Group();
  group.name='four-space-wall-model'; group.visible=false; group.add(frame);
  const cage=drawing(64,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}),true,'four-space-projection');
  const shell=drawing(96,new THREE.MeshBasicMaterial({
    color:0xbb9f81,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
  }),false,'four-space-cut-faces');
  const rim=drawing(96,new THREE.LineBasicMaterial({color:0xe2d2ae,transparent:true,depthWrite:false}),true,'four-space-cut-rim');
  frame.add(cage.mesh,shell.mesh,rim.mesh);
  const cool=new THREE.Color(0x90b2b0), far=new THREE.Color(0xa6a1bd), fourth=new THREE.Color(0xb79276);
  const colors=new THREE.Float32BufferAttribute(new Float32Array(64*3),3);
  edges.forEach(([a,b,bit],i)=>{
    const color=bit===8 ? fourth : (a&8 ? far : cool);
    for (const vertex of [2*i,2*i+1]) colors.setXYZ(vertex,color.r,color.g,color.b);
  });
  cage.mesh.geometry.setAttribute('color',colors);
  const rotated=new Float64Array(64), hits=new Float32Array(96), usedEdges=new Uint8Array(32*32);
  const projected=Array.from({length:16},()=>new THREE.Vector3()), bounds=new THREE.Sphere();
  let previousRotation=NaN, previousW=NaN;
  function rebuildCage(angle) {
    const cs=Math.cos(angle),sn=Math.sin(angle),tilt=.38*sn,cz=Math.cos(tilt),sz=Math.sin(tilt);
    for (let i=0;i<16;i++) {
      const j=4*i,x=corners[j],y=corners[j+1],z=corners[j+2],w=corners[j+3];
      const rw=sn*x+cs*w;
      rotated[j]=cs*x-sn*w;
      rotated[j+1]=y;
      rotated[j+2]=cz*z-sz*rw;
      rotated[j+3]=sz*z+cz*rw;
      const k=projectionDistance/(projectionDistance-rotated[j+3]);
      projected[i].set(rotated[j],y-height/2,rotated[j+2]).multiplyScalar(k);
    }
    for (let i=0;i<edges.length;i++) {
      const [a,b]=edges[i];
      cage.positions.setXYZ(2*i,projected[a].x,projected[a].y,projected[a].z);
      cage.positions.setXYZ(2*i+1,projected[b].x,projected[b].y,projected[b].z);
    }
    cage.finish(64);
    // Frame the entire rotating solid in the same physical display space. The
    // section and the full projection share this single uniform transformation.
    bounds.setFromPoints(projected);
    const scale=.40/bounds.radius;
    frame.scale.setScalar(scale);frame.position.copy(bounds.center).multiplyScalar(-scale);
  }
  function rebuildSection(w) {
    let triangles=0,lines=0;
    usedEdges.fill(0);
    const plane=4*w, k=projectionDistance/(projectionDistance-plane);
    function put(attr,offset,id) {
      const i=3*id;
      attr.setXYZ(offset,k*hits[i],k*(hits[i+1]-height/2),k*hits[i+2]);
    }
    sliceFourBox(rotated,plane,(_side,loop,links)=>{
      const initial=links[loop[0]];
      for(let i=1;i<loop.length-1;i++) {
        put(shell.positions,triangles++,initial);
        put(shell.positions,triangles++,links[loop[i]]);
        put(shell.positions,triangles++,links[loop[i+1]]);
      }
      for(let i=0;i<loop.length;i++) {
        const a=links[loop[i]],b=links[loop[(i+1)%loop.length]];
        const key=Math.min(a,b)*32+Math.max(a,b);
        if(usedEdges[key]) continue;
        usedEdges[key]=1;
        put(rim.positions,lines++,a);put(rim.positions,lines++,b);
      }
    },hits);
    shell.finish(triangles);rim.finish(lines);
  }
  function update(w,rotation,visibility) {
    group.visible=visibility>.001;
    if (!group.visible) return;
    cage.mesh.material.opacity=.70*visibility;
    shell.mesh.material.opacity=.30*visibility;
    rim.mesh.material.opacity=.94*visibility;
    const turned=rotation!==previousRotation;
    if (turned) rebuildCage(rotation);
    if (turned || w!==previousW) rebuildSection(w);
    previousRotation=rotation;previousW=w;
  }
  function dispose() {
    group.removeFromParent();
    for(const {mesh} of [cage,shell,rim]) {mesh.geometry.dispose();mesh.material.dispose();}
  }
  return {group,update,dispose};
}
