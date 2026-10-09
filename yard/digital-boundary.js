import * as THREE from './vendor/three.module.js';
import { pointInRing, distanceToSegment } from './navigation.js';
const smooth = (x,a,b) => THREE.MathUtils.smootherstep(x,a,b);
const signedDistance = (x,z,ring) => {
  const d = Math.min(...ring.map((p,i)=>{const q=ring[(i+1)%ring.length];return distanceToSegment(x,z,p[0],p[1],q[0],q[1]);}));
  return pointInRing(x,z,ring) ? -d : d;
};
export function virtualAmount(layout,x,z) {
  const config=layout.virtualBoundary, ring=config?.noticeableRing || layout.walkable;
  const d=signedDistance(x,z,ring), edge=signedDistance(x,z,layout.walkable);
  if(d<0)return .4*smooth(d,-(config?.insideFadeM || 18),0);
  const remaining=Math.max(0,(config?.fullOutsideM || 52)-edge);
  return .4+.6*smooth(d/Math.max(.001,d+remaining),0,1);
}
export function createDigitalBoundary(scene,layout,sun,outside,groundMaterials) {
  const cx=39,cz=-2.5, span=700;
  const grid=new THREE.GridHelper(span,100,0x80e8d3,0x408d82);grid.name='digital-ground';
  grid.position.set(cx,.055,cz);grid.material.transparent=true;grid.material.depthWrite=false;grid.material.fog=false;grid.material.opacity=0;scene.add(grid);
  const domes=[1,1.65].map((scale,i)=>{
    const material=new THREE.MeshBasicMaterial({color:i?0x9989ec:0x66cdb8,wireframe:true,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,fog:false});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,i?16:28,i?7:12,0,Math.PI*2,0,Math.PI/2),material);
    mesh.name=`digital-dome-${i+1}`;mesh.position.set(cx,0,cz);mesh.scale.set(220*scale,125*scale,240*scale);mesh.userData.bakedShadowCaster=false;scene.add(mesh);return mesh;
  });
  const low=new THREE.Group();low.name='digital-buildings';scene.add(low);
  const mix={value:0}, lowMix={value:0};let detailed=[];
  const patch=(material,uniform,inverse)=>{
    const original=material.onBeforeCompile;
    material.onBeforeCompile=(shader,renderer)=>{
      original.call(material,shader,renderer);shader.uniforms.digitalMix=uniform;
      shader.fragmentShader='uniform float digitalMix;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
        float cell=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
        if (${inverse?'cell >= digitalMix':'cell < digitalMix'}) discard;`);
    };
    material.customProgramCacheKey=()=>`digital-${inverse}`;material.needsUpdate=true;
  };
  for(const b of layout.buildings){
    const shape=new THREE.Shape(b.footprint.map(p=>new THREE.Vector2(p[0],-p[1])));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:b.heightM,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);
    const material=new THREE.MeshBasicMaterial({color:0x345e65,fog:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});patch(material,lowMix,true);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`digital-${b.id}`;mesh.userData.digitalProxy=true;mesh.userData.bakedShadowCaster=false;low.add(mesh);
    const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,20),new THREE.LineBasicMaterial({color:0x9ff7df,transparent:true,opacity:0,fog:false}));lines.userData.bakedShadowCaster=false;low.add(lines);
  }
  low.visible=false;
  const baseSky=new THREE.Color(sun.skyColor),baseFog=new THREE.Color(sun.fogColor),dark=new THREE.Color(0x07121b);
  let previous=-1;
  return {
    attachBuildings(){
      const clones=new Map();
      scene.traverse(mesh=>{
        if(!mesh.isMesh || !mesh.userData.digitalBuilding)return;
        detailed.push(mesh);
        const clone=m=>{if(!clones.has(m)){const n=m.clone();patch(n,mix,false);clones.set(m,n);}return clones.get(m);};
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
      });
    },
    update(x,z){
      const amount=virtualAmount(layout,x,z), radius=Math.hypot((x-cx)/220,(z-cz)/240), outer=smooth(radius,.92,1.25);
      scene.userData.virtuality=amount;scene.userData.virtualLayer=outer;
      // The two domes are anchored to the courtyard, never to the camera.
      outside.position.set(Math.round(x/240)*240,-.05,Math.round(z/240)*240);outside.updateMatrix();
      const key=Math.round(amount*1000)+Math.round(outer*1000)*1001;if(key===previous)return;previous=key;
      mix.value=lowMix.value=smooth(amount,.35,.85);
      detailed.forEach(m=>m.visible=mix.value<1);low.visible=lowMix.value>0;
      low.children.forEach(m=>{if(m.isLineSegments)m.material.opacity=lowMix.value*.85;else m.material.color.set(0x345e65).lerp(new THREE.Color(0x433958),outer);});
      grid.material.opacity=Math.min(.9,amount*1.8);domes[0].material.opacity=Math.min(.72,amount*1.5);domes[1].material.opacity=outer*.65;
      scene.background.copy(baseSky).lerp(dark,amount);scene.fog.color.copy(baseFog).lerp(dark,amount);
      // Pull fog away as detail fades; proxy silhouettes and both shells ignore it.
      scene.fog.near=THREE.MathUtils.lerp(90,500,amount);scene.fog.far=THREE.MathUtils.lerp(260,2500,amount);
      const shade=THREE.MathUtils.lerp(1,.18,amount);groundMaterials.forEach(m=>m.color.setRGB(shade,shade,shade));
    }
  };
}
