import * as THREE from './vendor/three.module.js';
import { resolveFacadeAnchor } from './site-details.js';

// All entrances share a diffuser and a soft pool of light. Two instanced
// draws keep the fixture count independent of the number of dynamic lights.
export function addEntranceLighting(scene, layout) {
  const entries = (layout.entrances || []).map(entry => ({
    entry, anchor:resolveFacadeAnchor(layout,entry),
  })).filter(({entry,anchor}) => anchor && entry.canopy !== false);
  const glass = new THREE.MeshStandardMaterial({
    color:0xb9b8a8,roughness:.55,emissive:0xffd798,emissiveIntensity:0,
  });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,5,0,Math.PI*2,Math.PI/2,Math.PI/2),glass,entries.length);
  const warmth = {value:0};
  const spill = new THREE.ShaderMaterial({
    uniforms:{warmth},transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
    vertexShader:`
      varying vec2 offset;
      void main(){
        offset=uv*2.-1.;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      varying vec2 offset; uniform float warmth;
      void main(){
        float falloff=max(0.,1.-dot(offset,offset));
        gl_FragColor=vec4(.38,.22,.098,warmth*falloff*falloff*falloff);
        #include <colorspace_fragment>
      }`,
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),spill,entries.length);
  const pose = new THREE.Object3D();
  entries.forEach(({entry,anchor},i) => {
    const raised = entry.style === 'nine-storey-reference';
    const integrated = entry.style?.endsWith('-integrated');
    const ceiling = raised ? 2.88 : integrated ? 2.50 : (Number(entry.heightM)||2.1)+.21;
    const inset = raised ? .86 : integrated ? .78 : .66;
    pose.position.set(anchor.x+anchor.nx*inset,ceiling-.01,anchor.z+anchor.nz*inset);
    pose.rotation.set(0,anchor.yaw,0,'YXZ'); pose.scale.set(.21,.085,.15); pose.updateMatrix();
    lamps.setMatrixAt(i,pose.matrix);
    pose.position.set(anchor.x+anchor.nx*2.05,.048,anchor.z+anchor.nz*2.05);
    pose.rotation.set(-Math.PI/2,anchor.yaw,0,'YXZ'); pose.scale.set(4.7,4.2,1); pose.updateMatrix();
    pools.setMatrixAt(i,pose.matrix);
  });
  lamps.name='entrance-diffusers'; pools.name='entrance-light-pools';
  for (const mesh of [lamps,pools]) mesh.userData.bakedShadowCaster = mesh.userData.bakedShadowReceiver = false;
  scene.add(lamps,pools);
  return (night, physical) => {
    lamps.visible=physical>.2;
    glass.emissiveIntensity=night*physical*1.5;
    warmth.value=night*physical*.39;
    pools.visible=warmth.value>.002;
  };
}
