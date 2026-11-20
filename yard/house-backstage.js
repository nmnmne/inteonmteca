import * as THREE from './vendor/three.module.js';
import {entryPulseShader} from './entry-pulse.js';

// Survey coordinates are shared by the physical footprint, its service galleries
// and the courtyard beyond the open inspection panels.
function galleryGeometry(house) {
  const ring = house.footprint;
  const floors = house.floors || Math.max(1,Math.round(house.heightM / 2.8));
  const storey = house.heightM / floors;
  const positions = [], uvs = [], kinds = [];
  function face(vertices, coords, kind) {
    const order = vertices.length === 3 ? [0,1,2] : [0,1,2,0,2,3];
    for (const i of order) { positions.push(...vertices[i]); uvs.push(...coords[i]); kinds.push(kind); }
  }

  const origin = ring[0];
  // Orient the gantries along the original facade rather than the world axes.
  let ux=1, uz=0, longest=0;
  for (let i=0;i<ring.length;i++) {
    const a=ring[i], b=ring[(i+1)%ring.length], dx=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dx,dz);
    if (length>longest) { longest=length; ux=dx/length; uz=dz/length; }
  }
  const local = ring.map(([x,z]) => [(x-origin[0])*ux+(z-origin[1])*uz, -(x-origin[0])*uz+(z-origin[1])*ux]);
  const world = (u,h,v) => [origin[0]+ux*u-uz*v, h, origin[1]+uz*u+ux*v];
  const contour = ring.map(([x,z])=>new THREE.Vector2(x,z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour,[]);
  for(let f=0;f<=floors;f++) {
    const y=f === 0 ? .085 : f*storey-.045;
    for(const tri of triangles) face(tri.map(i=>[ring[i][0],y,ring[i][1]]),tri.map(i=>local[i]),0);
  }
  for(let i=0;i<ring.length;i++) {
    const a=ring[i], b=ring[(i+1)%ring.length], span=Math.hypot(a[0]-b[0],a[1]-b[1]);
    face([[a[0],0,a[1]],[b[0],0,b[1]],[b[0],house.heightM,b[1]],[a[0],house.heightM,a[1]]],
      [[0,0],[span,0],[span,house.heightM],[0,house.heightM]],1);
  }
  // Intersect each row with the *polygon*. A concave tower can contain several
  // disjoint spans on a row; never bridge the open courtyard between them.
  const along=local.map(([u])=>u), begin=Math.min(...along), end=Math.max(...along);
  function girder(u,v1,v2,y1,y2) {
    const corners=[[u-.09,v1],[u+.09,v1],[u+.09,v2],[u-.09,v2]];
    for(let j=0;j<4;j++) {
      const [a,b]=corners[j], [c,d]=corners[(j+1)%4];
      face([world(a,y1,b),world(c,y1,d),world(c,y2,d),world(a,y2,b)],
        [[b,y1],[d,y1],[d,y2],[b,y2]],2);
    }
    face(corners.map(([a,b])=>world(a,y1,b)),corners,2);
  }
  for(let u=begin+2.73;u<end-.45;u+=5.4) {
    const cuts=[];
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=local[j], b=local[i];
      if ((a[0]>u)!==(b[0]>u)) cuts.push(a[1]+(u-a[0])*(b[1]-a[1])/(b[0]-a[0]));
    }
    cuts.sort((a,b)=>a-b);
    for(let i=0;i+1<cuts.length;i+=2) {
      const span=cuts[i+1]-cuts[i];
      if (span<3) continue;
      const inset=Math.min(1.5,span*.22), left=cuts[i]+inset, right=cuts[i+1]-inset;
      for(let f=0;f<floors;f++) {
        const base=f*storey, top=base+storey-.29;
        girder(u,left,left+.14,base+.07,top);
        girder(u,right-.14,right,base+.07,top);
        girder(u,left,right,top-.1,top+.07);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute('surfaceKind',new THREE.Float32BufferAttribute(kinds,1));
  return geo;
}

export function createHouseBackstage(house, clock, entryPulse) {
  const fade={value:0};
  const material=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,transparent:true,forceSinglePass:true,
    uniforms:{fade,seconds:clock,entryPulse,storey:{value:house.heightM/(house.floors || Math.max(1,Math.round(house.heightM/2.8)))}},
    vertexShader:`
      attribute float surfaceKind;
      varying float surface; varying vec2 metres; varying vec3 world;
      void main() {
        surface=surfaceKind; metres=uv; world=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      varying float surface; varying vec2 metres; varying vec3 world;
      uniform float fade,seconds,storey;
      ${entryPulseShader}
      float stripe(float x,float period,float width) {
        float d=abs(fract(x/period+.5)-.5)*period;
        float footprint=fwidth(x);
        return (1.-smoothstep(0.,width+max(.025,footprint),d))*min(1.,period/max(.001,footprint*4.));
      }
      void main() {
        // Broad reflected light keeps the floor and the joists readable between pulses.
        float bounce=.5+.5*cos(metres.x*.42+metres.y*.27);
        vec3 ink=mix(vec3(.037,.051,.066),vec3(.057,.074,.083),bounce);
        float route=0.;
        if(surface<.5){
          float joints=max(stripe(metres.x,5.4,.055),stripe(metres.y,2.7,.055));
          ink+=vec3(.012,.016,.018)*joints;
          route=stripe(metres.y,5.4,.13);
        }else if(surface<1.5){
          vec2 panel=vec2(fract(metres.x/3.6)-.5,fract(metres.y/storey)-.54);
          vec2 rim=abs(panel)-vec2(.25,.165);
          float opening=length(max(rim,0.))+min(max(rim.x,rim.y),0.)-.04;
          if(opening<0.) discard;
          ink+=vec3(.035,.048,.052)*(1.-smoothstep(0.,.074,opening));
          ink+=vec3(.009,.012,.014)*stripe(metres.y,.38,.036);
          route=stripe(metres.y-.33,storey,.11);
        }else{
          ink=vec3(.073,.092,.105);
          route=.22+.58*max(stripe(world.y-.36,storey,.16),stripe(metres.x,2.7,.15));
        }
        float phase=(world.x*.68+world.z*.44+world.y*.9)/13.-seconds*.10;
        float packet=.5+.5*cos(6.2831853*phase);
        vec3 glow=mix(vec3(.031,.084,.095),vec3(.116,.092,.142),packet);
        ink+=route*glow;
        float behind;
        float wave=entryWave(world,behind);
        vec3 sheen=mix(vec3(.062,.108,.115),vec3(.112,.079,.134),smoothstep(1.,15.,behind));
        ink+=sheen*wave*(.62+.38*route);
        gl_FragColor=vec4(ink,fade);
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(galleryGeometry(house),material);
  mesh.name='backstage-'+house.id;
  mesh.visible=false;
  mesh.userData.bakedShadowCaster=false;
  mesh.userData.bakedShadowReceiver=false;
  mesh.userData.digitalProxy=true;
  return mesh;
}
