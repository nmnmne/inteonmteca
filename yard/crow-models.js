import * as THREE from './vendor/three.module.js';
import { CROW_WALL_CONTACT_M } from './crow-wall-contact.js';

const count = 12; // The thirteenth bird carries the camera.
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

// The two shapes share their topology. A folded wing lays its coverts down the
// flank, while the long primaries slide together above the tail.
function foldedWing([x,y,z]) {
  const u = clamp((Math.abs(x) - .056) / .62, 0, 1);
  return [Math.sign(x)*(.077+.038*Math.sin(Math.PI*u)-.047*u+(z+.06)*.12),
    .057-.068*u-(z+.065)*.36+y*.28, -.101+.40*u+z*.39];
}

function plumageGeometry() {
  const vertices=[], folded=[], colors=[], parts=[], smoothLofts=[];
  const color = new THREE.Color();
  const shades = new Map();
  function triangle(a,b,c, rgb, part=0) {
    if (!shades.has(rgb)) shades.set(rgb,color.setHex(rgb).toArray());
    for (const p of [a,b,c]) {
      vertices.push(...p);
      folded.push(...(part===2 ? foldedWing(p) : p));
      colors.push(...shades.get(rgb));
      parts.push(part);
    }
  }
  // Anatomical cross sections run from the front to the back of the bird.
  function loft(rings, palette, part=0, sides=8, x=0) {
    const start=parts.length;
    const points=rings.map(([z,cy,rx,ry]) => Array.from({length:sides},(_,j)=>{
      const a=j*2*Math.PI/sides;
      return [x+rx*Math.sin(a),cy+ry*Math.cos(a),z];
    }));
    for(let i=1;i<points.length;i++) for(let j=0;j<sides;j++){
      const k=(j+1)%sides, top=Math.cos((j+.5)*2*Math.PI/sides);
      const ink=palette[top>.52?0:top<-.4?2:1];
      triangle(points[i-1][j],points[i][k],points[i-1][k],ink,part);
      triangle(points[i-1][j],points[i][j],points[i][k],ink,part);
    }
    smoothLofts.push([start,parts.length]);
  }
  loft([[-.155,.045,.008,.020],[-.108,.023,.076,.097],[-.025,.003,.099,.105],
    [.075,.002,.090,.082],[.155,.006,.061,.047],[.207,.009,.015,.018]],
    [0x303942,0x262c32,0x191d22],0,10);
  loft([[-.255,.101,.018,.020],[-.218,.113,.060,.052],[-.158,.119,.076,.073],
    [-.101,.108,.069,.067],[-.061,.077,.049,.049],[-.047,.048,.023,.023]],
    [0x343d46,0x242a31,0x181c21],1,12);
  loft([[-.374,.081,.001,.002],[-.322,.096,.014,.009],[-.269,.106,.027,.019],
    [-.223,.104,.035,.023]],[0x394249,0x22282c,0x14181c],1,8);
  for (const side of [-1,1]) {
    const eyeX=side*.066;
    loft([[-.211,.127,.001,.003],[-.201,.129,.008,.008],[-.194,.128,.002,.004]],
      [0x40392f,0x131518,0x101114],1,6,eyeX);
    triangle([eyeX+side*.007,.131,-.205],[eyeX+side*.008,.134,-.201],
      [eyeX+side*.008,.131,-.198],0x91a1a7,1);
  }

  // A vane has an offset shaft and two differently angled webs. Neighbouring
  // tips remain separate in silhouette even at phone resolution.
  function feather(root,tip,width,tone,part,ridge=.006) {
    const dx=tip[0]-root[0], dz=tip[2]-root[2];
    const len=Math.hypot(dx,dz), fx=-dz/len*width, fz=dx/len*width;
    const axis=root.map((v,k)=>v+(tip[k]-v)*.58);
    const shaft=[axis[0],axis[1]+ridge,axis[2]];
    const left=[axis[0]+fx,axis[1],axis[2]+fz], right=[axis[0]-fx*.79,axis[1]-.001,axis[2]-fz*.79];
    const endLeft=[tip[0]-dx*.11+fx*.50,tip[1],tip[2]-dz*.11+fz*.50];
    const endRight=[tip[0]-dx*.14-fx*.36,tip[1],tip[2]-dz*.14-fz*.36];
    triangle(root,shaft,left,tone[0],part); triangle(left,shaft,endLeft,tone[0],part);
    triangle(endLeft,shaft,tip,tone[0],part);
    triangle(root,right,shaft,tone[1],part); triangle(shaft,right,endRight,tone[1],part);
    triangle(shaft,endRight,tip,tone[1],part);
  }
  for(let i=-3;i<=3;i++) {
    feather([i*.011,.018,.13],[i*.019,-.024,.388-Math.abs(i)*.014],.019,
      [0x252d37,0x192129],0,.004);
  }
  for(const side of [-1,1]) {
    const wing=(p)=>[p[0]*side,p[1],p[2]];
    const cover=[wing([.05,.046,-.089]),wing([.27,.070,-.073]),wing([.43,.053,-.107]),
      wing([.43,.051,.012]),wing([.25,.050,.100]),wing([.077,.038,.116])];
    const ridge=wing([.22,.088,.006]);
    for(let i=0;i<cover.length;i++)
      triangle(cover[i],ridge,cover[(i+1)%cover.length],[0x394651,0x33414a,0x2d353e,0x313944,0x2c313a,0x343c48][i],2);
    // Rounded secondaries along the inner wing and splayed fingers at the wrist.
    for(let i=0;i<7;i++) {
      const t=i/6;
      feather(wing([.094+.265*t,.061,-.045]),wing([.10+.34*t,.030,.184-.055*t]),
        .038,[i%2?0x303a44:0x353d47,0x242c34],2);
    }
    for(let i=0;i<7;i++) {
      const t=i/6, x=.442+.218*Math.sin(t*2.05);
      feather(wing([.287+.11*t,.064,-.035-.047*t]),wing([x,.030+.025*t,.155-.239*t]),
        .037-.013*t,[i%2?0x27323c:0x303a44,0x1b222b],2);
    }
  }

  function legSegment(a,b,r1,r2,part) {
    const A=new THREE.Vector3(...a), B=new THREE.Vector3(...b);
    const axis=B.clone().sub(A).normalize();
    const normal=new THREE.Vector3(1,0,0).cross(axis).normalize(), side=axis.clone().cross(normal);
    function ring(center,r) {
      return Array.from({length:4},(_,i)=>center.clone()
        .addScaledVector(normal,r*Math.cos(i*Math.PI/2)).addScaledVector(side,r*Math.sin(i*Math.PI/2)).toArray());
    }
    const rA=ring(A,r1), rB=ring(B,r2);
    for(let j=0;j<4;j++) {
      const k=(j+1)%4, ink=j<2?0x42464a:0x272b2e;
      triangle(rA[j],rA[k],rB[k],ink,part); triangle(rA[j],rB[k],rB[j],ink,part);
    }
  }
  for (const side of [-1,1]) {
    const part=side<0?3:4, x=.042*side;
    legSegment([x,-.052,.017],[x,-.113,.051],.011,.008,part);
    legSegment([x,-.113,.051],[x,-.189,.012],.008,.005,part);
    for (const dx of [-.023,0,.023]) legSegment([x,-.189,.012],[x+dx,-.198,-.035+Math.abs(dx)*.4],.005,.001,part);
    legSegment([x,-.189,.012],[x,-.197,.047],.005,.001,part);
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(folded,3));
  geometry.computeVertexNormals();
  geometry.setAttribute('crowFoldNormal',geometry.getAttribute('normal').clone());
  geometry.setAttribute('crowFold',geometry.getAttribute('position'));
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  // Keep the head and breast round, with separate hard planes along feather shafts.
  const normals=geometry.getAttribute('normal');
  for (const [start,end] of smoothLofts) {
    const joins=new Map();
    for(let i=start;i<end;i++){
      const key=vertices.slice(i*3,i*3+3).join(',');
      const indices=joins.get(key);
      if(indices) indices.push(i); else joins.set(key,[i]);
    }
    const normal=new THREE.Vector3(), sample=new THREE.Vector3();
    for(const indices of joins.values()){
      normal.set(0,0,0);
      for(const i of indices) normal.add(sample.fromBufferAttribute(normals,i));
      normal.normalize();
      for(const i of indices) normals.setXYZ(i,normal.x,normal.y,normal.z);
    }
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('crowPart',new THREE.Float32BufferAttribute(parts,1));
  return geometry;
}

const jointShader = `
attribute float crowPart;
attribute vec3 crowFold, crowFoldNormal;
attribute vec3 crowMotion;
attribute vec3 crowStride;
vec2 crowRotate(vec2 v,float angle) {
  float s=sin(angle), c=cos(angle);
  return vec2(c*v.x-s*v.y,s*v.x+c*v.y);
}
void poseCrow(inout vec3 p, inout vec3 n){
  float air=crowMotion.x, flap=crowMotion.y, phase=crowMotion.z;
  if(crowPart>1.5 && crowPart<2.5){
    float signWing=sign(p.x);
    float bend=smoothstep(.26,.65,abs(p.x));
    float angle=signWing*(.04+flap*(.57*sin(phase)+bend*.26*sin(phase-.74)));
    vec2 hub=vec2(signWing*.058,.045);
    p.xy=hub+crowRotate(p.xy-hub,angle);
    n.xy=crowRotate(n.xy,angle);
    p=mix(crowFold,p,air);
    n=mix(crowFoldNormal,n,air);
  }else if(crowPart>.5 && crowPart<1.5){
    float glance=(1.-air)*crowStride.y;
    vec2 neck=vec2(0.,-.098);
    p.xz=neck+crowRotate(p.xz-neck,glance);
    n.xz=crowRotate(n.xz,glance);
    vec2 hinge=vec2(.075,-.098);
    p.yz=hinge+crowRotate(p.yz-hinge,-crowStride.z);
    n.yz=crowRotate(n.yz,-crowStride.z);
    p.y-=.033*air;
    p.z-=.034*air;
  }else if(crowPart>2.5){
    float stride=(crowPart<3.5?1.:-1.)*crowStride.x;
    float swing=-1.45*air+stride*(1.-air)*.40;
    vec2 hip=vec2(-.052,.018);
    p.yz=hip+crowRotate(p.yz-hip,swing);
    p.y+=.018*air;
    n.yz=crowRotate(n.yz,swing);
  }
}
`;

function addWallContactShader(shader, wallContact, clock) {
  shader.uniforms.crowEdges = {value:wallContact.edges};
  shader.uniforms.crowHouses = {value:wallContact.buildings};
  shader.uniforms.crowContactTime = clock;
  const varyings = `flat varying vec2 crowHouseIds;
    varying vec3 crowWorld;
    varying vec2 featherPanel;
  `;
  shader.vertexShader = 'attribute vec2 crowWallIds;\n'+varyings+shader.vertexShader.replace(
    '#include <project_vertex>', `#include <project_vertex>
    crowHouseIds = crowWallIds;
    crowWorld = (modelMatrix * instanceMatrix * vec4(transformed,1.)).xyz;
    featherPanel = position.xz + position.y * vec2(.43,.91);`);

  shader.fragmentShader = varyings+`
    uniform vec4 crowEdges[${wallContact.edges.length / 4}];
    uniform vec4 crowHouses[${wallContact.buildings.length / 4}];
    uniform float crowContactTime;
    // Signed distance to the extruded footprint, including re-entrant corners and roof edges.
    float distanceToHouse(float candidate) {
      if (candidate == -2.) return -2.;
      if (candidate < 0.) return 2.;
      vec4 house = crowHouses[int(candidate)];
      bool inside = false;
      float nearestSq = 1e12;
      for (int i=0; i<${wallContact.maxEdges}; i++) {
        if (i >= int(house.y)) break;
        vec4 edge = crowEdges[int(house.x)+i];
        vec2 ab = edge.zw-edge.xy, ap = crowWorld.xz-edge.xy;
        vec2 offset = ap-ab*clamp(dot(ap,ab)/max(dot(ab,ab),1e-10),0.,1.);
        nearestSq = min(nearestSq, dot(offset,offset));
        if ((edge.y > crowWorld.z) != (edge.w > crowWorld.z)) {
          if ((ap.x*ab.y - ap.y*ab.x)*sign(ab.y) < 0.) inside = !inside;
        }
      }
      vec2 d = vec2((inside ? -1. : 1.)*sqrt(nearestSq), max(house.z-crowWorld.y,crowWorld.y-house.w));
      return length(max(d,0.)) + min(max(d.x,d.y),0.);
    }
    vec3 holographicFeathers(vec3 physical) {
      if (all(equal(crowHouseIds,vec2(-1.)))) return physical;
      float distanceM = min(distanceToHouse(crowHouseIds.x),distanceToHouse(crowHouseIds.y));
      float depth = ${CROW_WALL_CONTACT_M} - distanceM;
      float aa = clamp(fwidth(depth)*.65, .001, .009);
      vec2 uv = featherPanel*vec2(10.,14.);
      vec2 pixel = max(fwidth(uv),vec2(.002));
      vec2 grid = 1.-smoothstep(vec2(.034),.034+pixel*.7,abs(fract(uv+.5)-.5));
      grid *= 1.-smoothstep(vec2(.35),vec2(1.15),pixel);
      vec3 panel = vec3(.016,.091,.14);
      vec3 trace = mix(vec3(.07,.65,.61),vec3(.21,.30,.79),smoothstep(-.18,.26,featherPanel.y));
      float packet = abs(fract(dot(featherPanel,vec2(1.85,1.2)) - crowContactTime*.36) - .5);
      trace = mix(trace,vec3(.48,.96,.87),.42*(1.-smoothstep(.015,.16,packet)));
      vec3 hologram = mix(panel,trace,max(grid.x,grid.y));
      float seam = 1.-smoothstep(.008,.012+aa,depth);
      return mix(physical,mix(hologram,vec3(.66,1.30,1.12),seam),smoothstep(0.,aa,depth));
    }
    `+shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight = holographicFeathers(outgoingLight);\n#include <opaque_fragment>');
}

export function createCrowModels(wallContact = null) {
  const group=new THREE.Group();
  group.name='crow-flock';
  const geometry=plumageGeometry();
  const motions=new THREE.InstancedBufferAttribute(new Float32Array(3*count),3).setUsage(THREE.DynamicDrawUsage);
  const strides=new THREE.InstancedBufferAttribute(new Float32Array(3*count),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('crowMotion',motions);
  geometry.setAttribute('crowStride',strides);
  const wallIds = wallContact?.buildings.length
    ? new THREE.InstancedBufferAttribute(new Float32Array(2*count).fill(-1),2).setUsage(THREE.DynamicDrawUsage)
    : null;
  if (wallIds) geometry.setAttribute('crowWallIds',wallIds);
  const contactClock = {value:0};
  const lowLight={value:new THREE.Vector2()};
  const plumage=new THREE.MeshPhongMaterial({vertexColors:true,side:THREE.DoubleSide,shininess:16,specular:0x29343c});
  plumage.onBeforeCompile=shader=>{
    shader.uniforms.crowLowLight=lowLight;
    shader.vertexShader=jointShader+shader.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec3 crowPosition = position;
        poseCrow(crowPosition,objectNormal);`)
      .replace('#include <begin_vertex>','vec3 transformed = crowPosition;');
    // Give the overlapping feather webs a soft key in the dark and behind the
    // hologram, where the courtyard switches off its physical sunlight.
    shader.fragmentShader='uniform vec2 crowLowLight;\n'+shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float slope = max(0., dot(normal, normalize(vec3(-.44,.79,.42))));
        float sheen = slope*slope;
        vec3 moon = vec3(.62,.80,1.05)*(.31+1.44*sheen)*crowLowLight.x;
        vec3 virtualSky = vec3(.67,1.60,1.82)*(.38+2.70*sheen)*crowLowLight.y;
        totalEmissiveRadiance += vColor.rgb*(vec3(.14)+moon+virtualSky);`);
    if (wallIds) addWallContactShader(shader,wallContact,contactClock);
  };
  plumage.customProgramCacheKey = () => wallIds
    ? 'crow-wall-'+wallContact.edges.length+'-'+wallContact.buildings.length+'-'+wallContact.maxEdges
    : 'crow-plumage';
  const birds=new THREE.InstancedMesh(geometry,plumage,count);
  birds.name='crow-plumage';
  birds.receiveShadow=true;
  const shadowGeometry=new THREE.PlaneGeometry(1,1);
  shadowGeometry.rotateX(-Math.PI/2);
  const shadowsMaterial=new THREE.ShaderMaterial({
    uniforms:{strength:{value:.2}}, transparent:true,depthWrite:false,
    vertexShader:`varying vec2 vUv;
      void main(){ vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform float strength;varying vec2 vUv;
      void main(){float fall=1.-smoothstep(.06,1.,length(vUv*2.-1.));
        gl_FragColor=vec4(.012,.013,.016,fall*fall*strength);
        #include <colorspace_fragment>
      }`
  });
  const shadows=new THREE.InstancedMesh(shadowGeometry,shadowsMaterial,count);
  shadows.name='crow-contact-shadows';
  for(const mesh of [birds,shadows]){
    mesh.userData.bakedShadowReceiver=false;
    mesh.userData.bakedShadowCaster=false;
    mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  }
  const transform=new THREE.Object3D();
  transform.rotation.order='YXZ';
  const spread=new Float32Array(count), amplitude=new Float32Array(count);
  let initialized=false;
  function update(members,dt,digital=0,daylight=1) {
    const response=initialized?1-Math.exp(-Math.max(0,dt)*9):1;
    for(let i=0;i<count;i++) {
      const bird=members[i+1];
      const prank=bird.prankPose;
      const air=clamp(bird.airborne,0,1), flight=bird.mode==='flap'||bird.mode==='glide';
      const opening=flight?1:bird.mode==='takeoff'?Math.max(.38,air):Math.max(air,prank?.wings || 0);
      const beat=bird.mode==='glide'?.075:1;
      spread[i]+=(opening-spread[i])*response;
      amplitude[i]+=(beat-amplitude[i])*response;
      const gait=Math.sin(bird.gaitPhase)*clamp(bird.speed*2,0,1);
      const glance=.28*Math.sin(bird.gaitPhase*.22+bird.wingPhase*.09+i);
      motions.setXYZ(i,spread[i],amplitude[i],bird.wingPhase);
      strides.setXYZ(i,gait,glance+(prank?.glance || 0),prank?.dip || 0);
      const height=bird.y+(prank?.hop || 0);
      transform.position.set(bird.x,height+Math.abs(gait)*.012*(1-air),bird.z);
      if (wallIds) wallContact.resolve(bird.x,transform.position.y,bird.z,wallIds.array,2*i);
      transform.rotation.set(.015*Math.sin(bird.wingPhase)*air,-bird.yaw,bird.bank,'YXZ');
      transform.scale.setScalar(.97+.06*((i*7)%11)/10);
      transform.updateMatrix(); birds.setMatrixAt(i,transform.matrix);
      const contact=clamp(1-(height-.20)/1.45,0,1);
      transform.position.set(bird.x,.052,bird.z+.008);
      transform.rotation.set(0,-bird.yaw,0,'YXZ');
      transform.scale.set(.35*contact,1,.63*contact);
      transform.updateMatrix(); shadows.setMatrixAt(i,transform.matrix);
    }
    initialized=true;
    motions.needsUpdate=strides.needsUpdate=birds.instanceMatrix.needsUpdate=shadows.instanceMatrix.needsUpdate=true;
    if (wallIds) {
      wallIds.needsUpdate=true;
      contactClock.value = (contactClock.value+Math.max(0,dt))%1000;
    }
    const dusk=1-clamp(daylight,0,1), wire=clamp(digital,0,1);
    lowLight.value.set(dusk,wire);
    shadowsMaterial.uniforms.strength.value=(.15+.19*(1-dusk))*(1-wire);
    shadows.visible=wire<.97;
  }
  return {group, update, dispose(){
    group.removeFromParent();
    birds.dispose(); shadows.dispose();
    geometry.dispose(); shadowGeometry.dispose(); plumage.dispose(); shadowsMaterial.dispose();
  }};
}
