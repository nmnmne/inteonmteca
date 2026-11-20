import * as THREE from './vendor/three.module.js';
import { pointInRing, distanceToSegment } from './navigation.js';
import { createCityHologram } from './city-hologram.js';
import { createCrowWallContact, CROW_WALL_CONTACT_M } from './crow-wall-contact.js';
import { entryPulseShader } from './entry-pulse.js';

const smooth = (x,a,b) => THREE.MathUtils.smootherstep(x,a,b);
const signedDistance = (x,z,ring) => {
  let nearest = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    nearest = Math.min(nearest, distanceToSegment(x,z,a[0],a[1],b[0],b[1]));
  }
  return pointInRing(x,z,ring) ? -nearest : nearest;
};
function animateDigitalMaterial(material, clock, entryPulse, isWire) {
  const original = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    original.call(material, shader, renderer);
    shader.uniforms.entryPulse = entryPulse;
    shader.uniforms.wireSeconds = clock;
    shader.vertexShader = 'varying vec3 wireWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nwireWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    shader.fragmentShader = 'varying vec3 wireWorld; uniform float wireSeconds;\n' + entryPulseShader + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       ${isWire ? `
       float wavelength = length((wireWorld - vec3(39.0, 0.0, -2.5)) * vec3(0.93, 1.0, 1.07)) / 48.0;
       float phase = fract(wavelength - wireSeconds * 0.22);
       float packet = smoothstep(0.78, 0.95, phase) * (1.0 - smoothstep(0.95, 1.0, phase));
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 1.0, 0.96), packet * 0.92);
       diffuseColor.a *= 0.61 + 0.39 * packet;` : ''}
       float entryEnergy;
       diffuseColor.rgb = applyEntryPulse(diffuseColor.rgb, wireWorld, entryEnergy);`
    );
  };
  material.customProgramCacheKey = () => `${baseKey}:entry-pulse-${isWire}`;
}
export function virtualAmount(layout,x,z,edge=signedDistance(x,z,layout.walkable)) {
  const config=layout.virtualBoundary, ring=config?.noticeableRing || layout.walkable;
  const d=ring===layout.walkable ? edge : signedDistance(x,z,ring);
  if(d<0)return .4*smooth(d,-(config?.insideFadeM || 18),0);
  const remaining=Math.max(0,(config?.fullOutsideM || 52)-edge);
  return .4+.6*smooth(d/Math.max(.001,d+remaining),0,1);
}
export function createDigitalBoundary(scene,layout,sun,outside,groundMaterials,{ passThroughBuildings = false } = {}) {
  const cx=39,cz=-2.5, span=700, outerDomeScale=1.65;
  const entryPulse = { value: new THREE.Vector4(0, 0, 0, -1) };
  const city = createCityHologram(scene, layout.walkable, entryPulse);
  let sampled = false, inBackstage = false, pulseStarted = -Infinity;
  const wallContact = passThroughBuildings ? createCrowWallContact(layout) : null;
  let facadeDistance = Infinity;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const clock = {value:0};
  let animated = false;
  const grid=new THREE.GridHelper(span,100,0x80e8d3,0x408d82);grid.name='digital-ground';
  grid.position.set(cx,.055,cz);grid.material.transparent=true;grid.material.depthWrite=false;grid.material.fog=false;grid.material.opacity=0;scene.add(grid);
  const domes=[1,outerDomeScale].map((scale,i)=>{
    const material=new THREE.MeshBasicMaterial({color:i?0x9989ec:0x66cdb8,wireframe:true,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,fog:false});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,i?16:28,i?7:12,0,Math.PI*2,0,Math.PI/2),material);
    mesh.name=`digital-dome-${i+1}`;mesh.position.set(cx,0,cz);mesh.scale.set(220*scale,125*scale,240*scale);mesh.userData.bakedShadowCaster=false;scene.add(mesh);return mesh;
  });
  const low=new THREE.Group();low.name='digital-buildings';scene.add(low);
  animateDigitalMaterial(grid.material, clock, entryPulse, true);
  for (const dome of domes) animateDigitalMaterial(dome.material, clock, entryPulse, true);
  const mix={value:0}, proxies=[];let detailed=[];
  const attached=new WeakSet(), clones=new Map();
  const patch=(material,uniform,inverse)=>{
    const original=material.onBeforeCompile;
    const baseKey=material.customProgramCacheKey?.() || '';
    material.onBeforeCompile=(shader,renderer)=>{
      original.call(material,shader,renderer);shader.uniforms.digitalMix=uniform;
      shader.fragmentShader='uniform float digitalMix;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
        float cell=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
        if (${inverse?'cell >= digitalMix':'cell < digitalMix'}) discard;`);
    };
    material.customProgramCacheKey=()=>`${baseKey}:digital-${inverse}`;material.needsUpdate=true;
  };
  for(const b of layout.buildings){
    const shape=new THREE.Shape(b.footprint.map(p=>new THREE.Vector2(p[0],-p[1])));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:b.heightM,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);
    const material=new THREE.MeshBasicMaterial({color:0x345e65,fog:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const surfaceMix={value:0};
    patch(material,surfaceMix,true);
    animateDigitalMaterial(material, clock, entryPulse, false);
    proxies.push({surfaceMix, crossing:0, inside:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`digital-${b.id}`;mesh.userData.digitalProxy=true;mesh.userData.bakedShadowCaster=false;low.add(mesh);
    const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,20),new THREE.LineBasicMaterial({color:0x9ff7df,transparent:true,opacity:0,fog:false}));lines.userData.bakedShadowCaster=false;low.add(lines);
    animateDigitalMaterial(lines.material, clock, entryPulse, true);
  }
  low.visible=false;
  const baseSky=new THREE.Color(sun.skyColor),baseFog=new THREE.Color(sun.fogColor),dark=new THREE.Color(0x07121b);
  // Behind the projection only its digital geometry is submitted. Keep each
  // prior visibility state so a return restores the same courtyard and LOD.
  const virtualObjects = new Set([city.root, low, grid, ...domes]);
  const concealed = new Set();
  let behindCity = false, lastChildCount = 0;
  function concealStreet() {
    for (const object of scene.children) {
      if (!object.visible || virtualObjects.has(object) || object.userData.visibleInBackstage || object.isLight || object.isCamera) continue;
      concealed.add(object);
      object.visible = false;
    }
    lastChildCount = scene.children.length;
  }
  let previous=-1;
  return {
    wallContact,
    get facadeDistance() { return facadeDistance; },
    setSky(skyColor, fogColor) {
      baseSky.set(skyColor);
      baseFog.set(fogColor);
      if (scene.userData.outsideOuterDome) return;
      const amount = scene.userData.virtuality || 0;
      scene.background.copy(baseSky).lerp(dark, amount);
      scene.fog.color.copy(baseFog).lerp(dark, amount);
    },
    get needsAnimation() { return animated && !reducedMotion?.matches; },
    attachBuildings(){
      detailed=detailed.filter(mesh=>mesh.parent);
      scene.traverse(mesh=>{
        if(!mesh.isMesh || !mesh.userData.digitalBuilding || attached.has(mesh))return;
        attached.add(mesh); detailed.push(mesh);
        const clone=m=>{
          if(!clones.has(m)){
            const n=m.clone();
            n.onBeforeCompile=m.onBeforeCompile;
            n.customProgramCacheKey=m.customProgramCacheKey;
            patch(n,mix,false);clones.set(m,n);clones.set(n,n);
          }
          return clones.get(m);
        };
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
        mesh.visible=mix.value<1;
      });
      if (behindCity) concealStreet();
    },
    update(x,z,y=layout.movement.eyeM,timeSeconds=performance.now()/1000){
      const edge = signedDistance(x,z,layout.walkable);
      const borderAmount = virtualAmount(layout,x,z,edge);
      const reveal = Math.max(smooth(edge,-44,-4), smooth(borderAmount,.12,.4));
      const backstage = smooth(edge,16,18);
      clock.value = reducedMotion?.matches ? 0 : timeSeconds;
      city.update(reveal, backstage, clock.value);
      const sparse = backstage === 1;
      if (sparse && (!behindCity || lastChildCount !== scene.children.length)) concealStreet();
      if (!sparse && behindCity) {
        for (const object of concealed) object.visible = true;
        concealed.clear();
        previous = -1;
      }
      behindCity = sparse;
      let amount=Math.max(borderAmount,backstage);
      let entered = !inBackstage && sparse;
      if (sparse) inBackstage = true;
      else if (edge < 16) inBackstage = false;
      if (wallContact) {
        facadeDistance = Infinity;
        for (let i=0; i<proxies.length; i++) {
          const house = proxies[i];
          const distance = wallContact.distanceToHouse(i,x,y,z,.20);
          if (!house.inside && distance <= 0) {
            house.inside = true;
            entered = true;
          } else if (distance > .15) house.inside = false;
          facadeDistance = Math.min(facadeDistance,distance);
          house.crossing = 1 - smooth(distance,0,CROW_WALL_CONTACT_M);
          amount = Math.max(amount, house.crossing);
        }
      }
      if (reducedMotion?.matches) pulseStarted = -Infinity;
      else if (sampled && entered) {
        entryPulse.value.set(x, y, z, 0);
        pulseStarted = timeSeconds;
      }
      sampled = true;
      const progress = (timeSeconds - pulseStarted) / 2.2;
      entryPulse.value.w = progress >= 0 && progress < 1 ? progress : -1;
      const radius=Math.hypot((x-cx)/220,(z-cz)/240), outer=smooth(radius,.92,1.25);
      animated = entryPulse.value.w >= 0 || amount > .001 || reveal > .001 || outer > .001;
      const outsideOuterDome=radius>=outerDomeScale;
      scene.userData.virtuality=amount;scene.userData.virtualLayer=outer;
      scene.userData.cityHologram=reveal;scene.userData.cityBackstage=backstage;
      scene.userData.outsideOuterDome=outsideOuterDome;
      // The two domes are anchored to the courtyard, never to the camera.
      outside.position.set(Math.round(x/240)*240,-.05,Math.round(z/240)*240);outside.updateMatrix();
      mix.value=smooth(amount,.35,.85);
      // Keep the wireframe of the house being crossed, with an open view
      // through its surface. Other digital houses keep their solid silhouettes.
      for (const house of proxies) house.surfaceMix.value = mix.value * (1 - house.crossing);
      const key=Math.round(amount*1000)+Math.round(outer*1000)*1001+Number(outsideOuterDome)*1002001;if(key===previous)return;previous=key;
      detailed.forEach(m=>m.visible=mix.value<1);low.visible=mix.value>0;
      low.children.forEach(m=>{if(m.isLineSegments)m.material.opacity=mix.value*.85;else m.material.color.set(0x345e65).lerp(new THREE.Color(0x433958),outer);});
      grid.material.opacity=outsideOuterDome?0:Math.min(.9,amount*1.8);domes[0].material.opacity=Math.min(.72,amount*1.5);domes[1].material.opacity=outer*.65;
      grid.visible=grid.material.opacity>0;
      for (const dome of domes) dome.visible=dome.material.opacity>0;
      if(outsideOuterDome){scene.background.set(0x000000);scene.fog.color.set(0x000000);}
      else {scene.background.copy(baseSky).lerp(dark,amount);scene.fog.color.copy(baseFog).lerp(dark,amount);}
      // Pull fog away as detail fades; proxy silhouettes and both shells ignore it.
      scene.fog.near=THREE.MathUtils.lerp(90,500,amount);scene.fog.far=THREE.MathUtils.lerp(260,2500,amount);
      const shade=outsideOuterDome?0:THREE.MathUtils.lerp(1,.18,amount);groundMaterials.forEach(m=>m.color.setRGB(shade,shade,shade));
    }
  };
}
