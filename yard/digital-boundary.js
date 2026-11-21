import * as THREE from './vendor/three.module.js';
import { pointInRing, distanceToSegment } from './navigation.js';
import { createCityHologram } from './city-hologram.js';
import { createCrowWallContact } from './crow-wall-contact.js';
import { entryPulseShader } from './entry-pulse.js';
import { createHouseSections } from './house-sections.js';
import { createHouseBackstage } from './house-backstage.js';

const approachMetres = 6, interiorMetres = 3, roofFadeMetres = 1.25;
const houseEntrySeconds = .2, cityEntrySeconds = 4.8;
const entryPreview = .24;
const smooth = (x,a,b) => THREE.MathUtils.smootherstep(x,a,b);
const signedDistance = (x,z,ring) => {
  let nearest = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    nearest = Math.min(nearest, distanceToSegment(x,z,a[0],a[1],b[0],b[1]));
  }
  return pointInRing(x,z,ring) ? -nearest : nearest;
};
function animateDigitalMaterial(material, clock, entryPulse, pulseStrength, isWire) {
  const original = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    original.call(material, shader, renderer);
    shader.uniforms.entryPulse = entryPulse;
    shader.uniforms.pulseStrength = pulseStrength;
    shader.uniforms.wireSeconds = clock;
    shader.vertexShader = 'varying vec3 wireWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nwireWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    shader.fragmentShader = 'varying vec3 wireWorld; uniform float wireSeconds, pulseStrength;\n' + entryPulseShader + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       ${isWire ? `
       float wavelength = length((wireWorld - vec3(39.0, 0.0, -2.5)) * vec3(0.93, 1.0, 1.07)) / 48.0;
       float phase = fract(wavelength - wireSeconds * 0.22);
       float packet = smoothstep(0.78, 0.95, phase) * (1.0 - smoothstep(0.95, 1.0, phase));
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 1.0, 0.96), packet * 0.92);
       diffuseColor.a *= 0.61 + 0.39 * packet;` : ''}
       float entryEnergy;
       diffuseColor.rgb = mix(diffuseColor.rgb, applyEntryPulse(diffuseColor.rgb, wireWorld, entryEnergy), pulseStrength);`
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
  const pulseStrength = {value:1};
  const city = createCityHologram(scene, layout.walkable, entryPulse);
  let sampled = false, inBackstage = false, pulseStarted = -Infinity, pulseSeconds = houseEntrySeconds;
  const wallContact = passThroughBuildings ? createCrowWallContact(layout) : null;
  let facadeDistance = Infinity, passagePace = 1;
  let drawingHouse = null, holdUntil = -Infinity;
  const profile = {horizontal:0,top:0};
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
  animateDigitalMaterial(grid.material, clock, entryPulse, pulseStrength, true);
  for (const dome of domes) animateDigitalMaterial(dome.material, clock, entryPulse, pulseStrength, true);
  const galleries = new THREE.Group(); galleries.name='house-backstages';
  if (wallContact) scene.add(galleries);
  const updateSections = wallContact && createHouseSections();
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
    animateDigitalMaterial(material, clock, entryPulse, pulseStrength, false);
    const entryDraw = {value:1};
    const gallery = wallContact && createHouseBackstage(b,clock,entryPulse,entryDraw);
    if (gallery) galleries.add(gallery);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`digital-${b.id}`;mesh.userData.digitalProxy=true;mesh.userData.bakedShadowCaster=false;low.add(mesh);
    const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,20),new THREE.LineBasicMaterial({color:0x9ff7df,transparent:true,opacity:0,fog:false}));lines.userData.bakedShadowCaster=false;low.add(lines);
    animateDigitalMaterial(lines.material, clock, entryPulse, pulseStrength, true);
    proxies.push({surfaceMix, crossing:0, inside:false, revealedFromInside:false, entryDraw, gallery, lines});
  }
  low.visible=false;
  const baseSky=new THREE.Color(sun.skyColor),baseFog=new THREE.Color(sun.fogColor),dark=new THREE.Color(0x07121b);
  // Behind the projection only its digital geometry is submitted. Keep each
  // prior visibility state so a return restores the same courtyard and LOD.
  const virtualObjects = new Set([city.root, low, grid, galleries, ...domes]);
  const concealed = new Set();
  let neighbours;
  let behindCity = false, lastChildCount = 0;
  function concealStreet() {
    for (const object of scene.children) {
      if (!object.visible || virtualObjects.has(object) || object.userData.visibleInBackstage || object.isLight || object.isCamera) continue;
      concealed.add(object);
      object.visible = false;
    }
    lastChildCount = scene.children.length;
  }
  let previous=-1, previousMix=-1;
  return {
    wallContact,
    setNeighbours(mesh) { neighbours = mesh; },
    get facadeDistance() { return facadeDistance; },
    get passagePace() { return passagePace; },
    get cameraHoldUntil() { return reducedMotion?.matches ? -Infinity : holdUntil; },
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
      const backstage = smooth(edge,10,18);
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
      if (neighbours) neighbours.visible = edge <= 0;
      let amount=Math.max(borderAmount,backstage);
      let entered = !inBackstage && sparse;
      if (sparse) inBackstage = true;
      else if (edge < 16) inBackstage = false;
      let roomFade = 0, physicalFade = 0;
      if (reducedMotion?.matches) { drawingHouse=null;holdUntil=-Infinity; }
      if (wallContact) {
        facadeDistance = Infinity;
        let sectionHouse=-1, sectionAlpha=0;
        for (let i=0; i<proxies.length; i++) {
          const house = proxies[i];
          const distance = wallContact.distanceToHouse(i,x,y,z,approachMetres,profile);
          if (!house.inside && distance <= 0) {
            house.inside = true;
            house.revealedFromInside = true;
            entered = true;
            if (sampled && !reducedMotion?.matches && !sparse) {
              holdUntil = timeSeconds + houseEntrySeconds;
              drawingHouse = {house, deepest:0, pace:passagePace};
            }
          } else if (distance > .15) house.inside = false;
          if (distance >= approachMetres) house.revealedFromInside = false;
          facadeDistance = Math.min(facadeDistance,distance);
          // Meet halfway at the surveyed wall. The approach starts from farther
          // away, while narrow homes and ground-level flights still reach full detail.
          let crossing = 0;
          if (Number.isFinite(distance)) {
            const fromStreet = Math.max(0,1-profile.horizontal/approachMetres);
            const fromRoom = Math.max(0,1+profile.horizontal/interiorMetres);
            const lateral = smooth(fromStreet/(fromStreet+fromRoom),0,1);
            const vertical = 1-smooth(y-profile.top,-roofFadeMetres,roofFadeMetres);
            crossing = lateral*vertical*smooth(y,-roofFadeMetres,0);
          }
          physicalFade = Math.max(physicalFade,crossing);
          let interior = crossing*smooth(-distance,0,1.1);
          const drawing = drawingHouse?.house === house;
          // Keep the normal distance fade on the return from a revealed room.
          const preview = !house.revealedFromInside && !reducedMotion?.matches;
          house.entryDraw.value = preview ? 0 : 1;
          if (preview) crossing *= entryPreview;
          if (drawing) {
            const progress = THREE.MathUtils.clamp(1-(holdUntil-timeSeconds)/houseEntrySeconds,0,1);
            const depth = Number.isFinite(distance) ? Math.max(0,Math.min(-profile.horizontal,profile.top-y)) : 0;
            drawingHouse.deepest = Math.max(drawingHouse.deepest,depth);
            if (distance>0 || (progress>=1 && crossing>=.999 && interior>=.999)) {
              drawingHouse=null;
              holdUntil=-Infinity;
            } else {
              // Once drawn, keep the interior solid on the inbound leg. A
              // shallow flight that turns back blends into the normal exit.
              const weight = drawingHouse.deepest>0 ? smooth(depth/drawingHouse.deepest,0,1) : 1;
              house.entryDraw.value = progress;
              const fill = smooth(progress,0,1);
              crossing = THREE.MathUtils.lerp(crossing,
                THREE.MathUtils.lerp(crossing*entryPreview,1,fill),weight);
              interior = Math.max(interior,weight);
            }
          }
          house.crossing = crossing;
          house.gallery.material.depthWrite = crossing >= .999 && house.entryDraw.value >= .98;
          house.gallery.material.uniforms.fade.value = house.crossing;
          house.gallery.visible = house.crossing > .001;
          if (interior>sectionAlpha) { sectionAlpha=interior;sectionHouse=i; }
          roomFade = Math.max(roomFade,house.crossing);
          amount = Math.max(amount, house.crossing);
        }
        const section = proxies[sectionHouse];
        updateSections(section?.gallery,layout.buildings[sectionHouse],x,y,z,sectionAlpha,clock.value,section?.entryDraw.value);
      }
      // Ease the camera down on either side of a threshold and release it
      // again deep inside. The wall midpoint has a flat speed curve both ways.
      passagePace = drawingHouse && timeSeconds<=holdUntil ? drawingHouse.pace :
        reducedMotion?.matches ? 1 : 1 - .53*Math.sin(Math.PI*physicalFade)**2;
      if (reducedMotion?.matches) pulseStarted = -Infinity;
      else if (sampled && entered) {
        entryPulse.value.set(x, y, z, 0);
        pulseStrength.value = sparse ? 1 : .20;
        pulseStarted = timeSeconds;
        pulseSeconds = sparse ? cityEntrySeconds : houseEntrySeconds;
      }
      sampled = true;
      entryPulse.value.w = timeSeconds >= pulseStarted && timeSeconds < pulseStarted + pulseSeconds
        ? (timeSeconds - pulseStarted) / pulseSeconds : -1;
      const radius=Math.hypot((x-cx)/220,(z-cz)/240), outer=smooth(radius,.92,1.25);
      animated = entryPulse.value.w >= 0 || amount > .001 || reveal > .001 || outer > .001;
      const outsideOuterDome=radius>=outerDomeScale;
      scene.userData.virtuality=amount;scene.userData.virtualLayer=outer;
      scene.userData.houseInterior=roomFade;
      scene.userData.cityHologram=reveal;scene.userData.cityBackstage=backstage;
      scene.userData.outsideOuterDome=outsideOuterDome;
      // The two domes are anchored to the courtyard, never to the camera.
      outside.position.set(Math.round(x/240)*240,-.05,Math.round(z/240)*240);outside.updateMatrix();
      // Open the facade before the near plane cuts through it. The street's own
      // boundary keeps its original timing independently of the house layers.
      mix.value=Math.max(smooth(Math.max(borderAmount,backstage),.35,.85),smooth(roomFade,.08,.49));
      // Keep the wireframe of the house being crossed, with an open view
      // through its surface. Other digital houses keep their solid silhouettes.
      for (const house of proxies) {
        house.surfaceMix.value = mix.value * (1 - smooth(house.crossing,.03,.49));
        house.lines.material.opacity = mix.value * (.85 - .60*house.crossing);
      }
      const key=Math.round(amount*1000)+Math.round(outer*1000)*1001+Number(outsideOuterDome)*1002001;
      const mixKey=Math.round(mix.value*1000);
      if(key===previous && mixKey===previousMix)return;
      previous=key;previousMix=mixKey;
      detailed.forEach(m=>m.visible=mix.value<1);low.visible=mix.value>0;
      low.children.forEach(m=>{if(m.isMesh)m.material.color.set(0x345e65).lerp(new THREE.Color(0x433958),outer);});
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
