import * as THREE from './vendor/three.module.js';
import { CROW_WALL_CONTACT_M } from './crow-wall-contact.js';
import { createCrowKeyDoor } from './crow-key-door.js';
import { createCrowBeaconPair } from './crow-beacon-pair.js';
import { crowPersonality } from './crow-personalities.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const marks = ['bib','nape','wing','tail','brow','shoulder'];

// The two shapes share their topology. A folded wing lays its coverts down the
// flank, while the long primaries slide together above the tail.
function foldedWing([x,y,z]) {
  const u = clamp((Math.abs(x) - .048) / .615, 0, 1);
  // The wrist comes back along the flank. The trailing edge wraps down
  // around the breast, bringing the primaries together over the tail.
  const chord = z + .083;
  const shoulder = Math.sin(Math.PI * Math.min(1, u * 1.5));
  const width = .078 + .023 * shoulder - .049 * u * u;
  return [Math.sign(x) * (width + chord*.072 + (y-.052)*.40),
    .071 - .083*u - chord*(.49-.15*u) + (y-.05)*.65,
    -.118 + .421*u + .61*chord];
}

function plumageGeometry() {
  const vertices=[], folded=[], colors=[], parts=[], detail=[], smoothLofts=[];
  const shades = new Map();
  let featherCoordinates=null;
  function triangle(a,b,c, rgb, part=0) {
    if (typeof rgb==='number' && !shades.has(rgb)) shades.set(rgb,new THREE.Color(rgb).toArray());
    for (const p of [a,b,c]) {
      vertices.push(...p);
      folded.push(...(part===2 ? foldedWing(p) : p));
      colors.push(...(typeof rgb==='number' ? shades.get(rgb) : rgb(p)));
      if (featherCoordinates) detail.push(...featherCoordinates(p), 1);
      else if (typeof part==='function') {
        // Feathers follow the neck on the flanks and run lengthwise over the mantle.
        const neck=THREE.MathUtils.smoothstep(-p[2],.066,.175);
        const around=Math.atan2(Math.abs(p[0]),p[1]-(.002+neck*.093));
        detail.push(p[2]*37 - .65*Math.cos(around)*(1.-neck), around*4.6, 2);
      } else if (part===2) {
        const chord=p[2]+.14;
        detail.push(chord*17.,(Math.abs(p[0])-.44*chord)*32.,3);
      } else detail.push(0,0,0);
      const joint=typeof part==='number' ? part : part(p);
      parts.push(joint);
      detail.push(joint);
    }
  }
  // Each ring follows the crown, throat, breast and mantle in section. The
  // head and breast share a skin, including when the bird turns its neck.
  function loft(rings, ink, part, sides) {
    const start=parts.length;
    const points=rings.map(([z,top,bottom,width]) => Array.from({length:sides},(_,j)=>{
      const angle=j*2*Math.PI/sides;
      return [width*Math.sin(angle), (top+bottom+(top-bottom)*Math.cos(angle))*.5, z];
    }));
    for(let i=1;i<points.length;i++) for(let j=0;j<sides;j++){
      const k=(j+1)%sides;
      triangle(points[i-1][j],points[i][k],points[i-1][k],ink,part);
      triangle(points[i-1][j],points[i][j],points[i][k],ink,part);
    }
    smoothLofts.push([start,parts.length]);
  }

  const breast = new THREE.Color(0x25272b), mantle = new THREE.Color(0x393e44);
  const plumageShade = (p) => breast.clone().lerp(mantle,clamp((p[1]+.06)/.21,0,1)).toArray();
  const neckWeight = (p) => THREE.MathUtils.smoothstep(-p[2], .048, .172);
  loft([
    [-.248,.111,.079,.026],[-.231,.136,.059,.046],[-.210,.155,.045,.060],
    [-.185,.166,.032,.068],[-.155,.167,.009,.074],[-.124,.153,-.029,.081],
    [-.093,.133,-.067,.089],[-.058,.114,-.089,.098],[-.011,.102,-.094,.103],
    [.041,.090,-.082,.099],[.093,.078,-.063,.086],[.149,.056,-.042,.064],
    [.205,.032,-.025,.034],[.241,.014,-.013,.009]
  ],plumageShade,neckWeight,16);

  // The nostrils sit in the feathered base of the heavy, slightly arched
  // upper mandible. The lower jaw meets it along a dark, fine gape line.
  const billSections=[
    [-.366,.076,.074,.074,.001],[-.349,.092,.080,.078,.008],
    [-.323,.106,.087,.078,.016],[-.282,.119,.090,.071,.027],
    [-.247,.126,.089,.067,.034],[-.220,.125,.084,.071,.035]
  ];
  const billStart=parts.length;
  const bill=billSections.map(([z,crown,gape,chin,w])=>{
    const half=[
      [0,crown],[w*.58,gape+(crown-gape)*.81],[w*.89,gape+(crown-gape)*.44],
      [w,gape+.001],[w*.994,gape-.001], [w*.91,gape+(chin-gape)*.43],
      [w*.61,gape+(chin-gape)*.83],[0,chin]
    ];
    return [...half,...half.slice(1,-1).reverse().map(([x,y])=>[-x,y])].map(([x,y])=>[x,y,z]);
  });
  for(let i=1;i<bill.length;i++) for(let j=0;j<bill[i].length;j++) {
    const k=(j+1)%bill[i].length, side=Math.min(j,bill[i].length-j-1);
    const ink=side===3 ? 0x181b1e : side<3 ? 0x303336 : 0x25282a;
    triangle(bill[i-1][j],bill[i][k],bill[i-1][k],ink,1);
    triangle(bill[i-1][j],bill[i][j],bill[i][k],ink,1);
  }
  smoothLofts.push([billStart,parts.length]);

  // Low, convex eye caps sit flush with the head. A single small highlight
  // keeps them readable without a white ring or a protruding sphere.
  function sideCap(side,x,y,z,height,length,bulge,palette) {
    const circle=(radius,i,lift) => {
      const a=i*Math.PI/5;
      return [side*(x+lift+radius*.001*Math.cos(a)),y+height*radius*Math.sin(a),
        z+length*radius*Math.cos(a)];
    };
    for(let i=0;i<10;i++) {
      const j=(i+1)%10;
      const a=circle(1,i,0), b=circle(1,j,0);
      const innerA=circle(.65,i,bulge*.8), innerB=circle(.65,j,bulge*.8);
      triangle(a,b,innerA,palette[0],1);
      triangle(innerA,b,innerB,palette[0],1);
      triangle(innerA,innerB,[side*(x+bulge),y,z],palette[1],1);
    }
  }
  for (const side of [-1,1]) {
    sideCap(side,.060,.116,-.200,.0087,.0096,.0048,[0x46423c,0x101316]);
    triangle([side*.0645,.1195,-.2035],[side*.065,.120,-.201],[side*.065,.118,-.200],0x84928f,1);
    sideCap(side,.0235,.106,-.277,.0025,.006,.0015,[0x282a2b,0x161819]);
  }

  function feather(root,tip,width,tone,part,ridge=.0035) {
    const dx=tip[0]-root[0], dz=tip[2]-root[2];
    const len=Math.hypot(dx,dz), fx=-dz/len*width, fz=dx/len*width;
    const at=(s,w,lift)=>[root[0]+dx*s+fx*w,root[1]+(tip[1]-root[1])*s+lift,root[2]+dz*s+fz*w];
    featherCoordinates = p => {
      const x=p[0]-root[0], z=p[2]-root[2];
      return [(x*dx+z*dz)/(len*len),(x*fx+z*fz)/(width*width)];
    };
    const shaft=at(.56,0,ridge), left=at(.56,1,0), right=at(.56,-.83,0);
    const endLeft=at(.89,.66,0), endRight=at(.91,-.49,0);
    triangle(root,shaft,left,tone[0],part); triangle(left,shaft,endLeft,tone[0],part);
    triangle(endLeft,shaft,tip,tone[0],part);
    triangle(root,right,shaft,tone[1],part); triangle(shaft,right,endRight,tone[1],part);
    triangle(shaft,endRight,tip,tone[1],part);
    featherCoordinates=null;
  }

  // Twelve overlapping rectrices give the crow its rounded, fan-shaped tail.
  for(let i=0;i<12;i++) {
    const t=(i-5.5)/5.5;
    feather([t*.039,.013,.124],[t*.076,-.028,.365-.030*t*t],.020,
      [i%2?0x2b3037:0x31353b,0x252a30],5);
  }
  for(const side of [-1,1]) {
    const wing=(x,y,z)=>[x*side,y,z];
    // The leading edge sweeps forward to the wrist, with a cambered cover
    // across it. The remiges overlap all the way to the outermost fingers.
    const stations=[
      [.045,-.105,.115,.060],[.124,-.106,.124,.068],[.225,-.102,.113,.067],
      [.319,-.122,.093,.063],[.399,-.147,.056,.054],[.452,-.137,.027,.047]
    ];
    let previous;
    for (const [x,front,back,y] of stations) {
      const row=[wing(x,y,front),wing(x,y+.018,front*.63+back*.37),wing(x,y-.008,back)];
      if(previous) for(let j=0;j<2;j++) {
        triangle(previous[j],row[j],previous[j+1],j?0x343a40:0x3c4147,2);
        triangle(previous[j+1],row[j],row[j+1],j?0x343a40:0x3c4147,2);
      }
      previous=row;
    }
    for(let i=0;i<8;i++) {
      const t=i/7;
      feather(wing(.079+.275*t,.064,-.066-.019*t),wing(.109+.320*t,.025,.186-.051*t),
        .044,[i%2?0x383e44:0x33393f,0x2b3037],2);
    }
    const fingers=[
      [.462,.120],[.512,.097],[.568,.077],[.609,.047],[.648,.012],
      [.666,-.027],[.657,-.067],[.631,-.099],[.591,-.122],[.539,-.132]
    ];
    for(let i=0;i<fingers.length;i++) {
      const t=i/(fingers.length-1), [x,z]=fingers[i];
      feather(wing(.308+.104*t,.061,-.021-.117*t),wing(x,.022+.017*t,z),
        .048-.022*t,[i%2?0x30363d:0x363c44,0x292e36],2);
    }
    // These shorter vanes overlap the bases of the flight feathers like tiles.
    for(let i=0;i<10;i++) {
      const t=i/9;
      feather(wing(.084+.306*t,.086,-.088-.031*t),wing(.133+.366*t,.064,.102-.128*t*t),
        .033,[i%2?0x393e45:0x353a41,0x30363d],2,.003);
    }
    feather(wing(.321,.079,-.102),wing(.440,.062,-.151),.016,[0x383c42,0x2c3239],2);
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
    const part=side<0?3:4, x=.043*side;
    legSegment([x,-.051,.026],[x,-.112,.046],.013,.0082,part);
    legSegment([x,-.112,.046],[x,-.181,.010],.0082,.0064,part);
    // Three toes ahead and one behind, each ending in a curved narrow claw.
    for (const dx of [-.025,0,.025]) {
      const z=dx ? -.039 : -.052;
      legSegment([x,-.181,.010],[x+dx*.55,-.190,z*.44],.006,.0044,part);
      legSegment([x+dx*.55,-.190,z*.44],[x+dx,-.187,z],.0044,.0032,part);
      legSegment([x+dx,-.187,z],[x+dx*1.11,-.198,z-.008],.0032,.0007,part);
    }
    legSegment([x,-.181,.010],[x-side*.006,-.187,.047],.005,.0037,part);
    legSegment([x-side*.006,-.187,.047],[x-side*.007,-.197,.055],.0037,.0007,part);
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
  const index=parts.map((_,i)=>i);
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
      // The continuous skin shares posed vertices. Keep a separate vertex
      // wherever the bill changes material across the gape.
      const byColor=new Map();
      for(const i of indices) {
        normals.setXYZ(i,normal.x,normal.y,normal.z);
        const ink=colors.slice(i*3,i*3+3).join(',');
        if (byColor.has(ink)) index[i]=byColor.get(ink);
        else byColor.set(ink,i);
      }
    }
  }
  geometry.setIndex(index);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('crowDetail',new THREE.Float32BufferAttribute(detail,4));
  return geometry;
}

const jointShader = `
attribute vec4 crowDetail;
#define crowPart crowDetail.w
varying vec3 plumageDetail;
attribute vec3 crowFold, crowFoldNormal;
attribute vec4 crowMotion;
attribute vec4 crowStride;
// Keep the complete rig within WebGL 2's minimum of sixteen vertex attributes.
attribute vec4 crowWingTip; // salute, marking, marking strength, warm/cool undertone
attribute vec4 crowLook; // wing span, tail length, bill length, grey of the mantle
vec3 individualPlumage(vec3 ink) {
  float x=abs(position.x), y=position.y, z=position.z;
  bool skin=crowDetail.z>1.5 && crowDetail.z<2.5;
  bool wing=crowPart==2., tail=crowPart==5.;
  if(!skin && !wing && !tail) return ink;
  vec3 silver=mix(vec3(.78,.88,1.05),vec3(1.12,.94,.77),.5+.5*crowWingTip.w);
  float gray=crowLook.w;
  float hood=skin ? smoothstep(-.13,-.043,z) : 0.;
  vec3 base=ink*(.79+.54*gray)*mix(vec3(1.),silver,.48);
  base+=silver*(.006+.095*gray*gray)*hood;
  float mark=crowWingTip.y, marking=0.;
  if(mark<.5 && skin) { // feathered breast, with a dark cap above it
    marking=(1.-smoothstep(.010,.094,y))*smoothstep(-.18,-.09,z)*(1.-smoothstep(.026,.092,z));
  } else if(mark<1.5 && mark>.5 && skin) { // pale, swept nape
    marking=smoothstep(-.221,-.172,z)*(1.-smoothstep(-.11,-.059,z))*smoothstep(.045,.113,y);
  } else if(mark<2.5 && mark>1.5 && wing) { // lighter outer coverts on the left wing
    marking=(position.x<0. ? 1. : .18)*smoothstep(.17,.28,x)*(1.-smoothstep(.46,.57,x));
  } else if(mark<3.5 && mark>2.5 && tail) {
    marking=smoothstep(.217,.317,z);
  } else if(mark<4.5 && mark>3.5 && skin) { // a small pale fleck above the eye
    marking=(1.-smoothstep(-.189,-.160,z))*smoothstep(.112,.150,y);
  } else if(mark>4.5 && wing) { // pale shoulder visible even with wings tucked
    marking=(1.-smoothstep(.14,.29,x))*smoothstep(-.112,-.072,z);
  }
  return base+silver*marking*crowWingTip.z*.23;
}
vec2 crowRotate(vec2 v,float angle) {
  float s=sin(angle), c=cos(angle);
  return vec2(c*v.x-s*v.y,s*v.x+c*v.y);
}
void poseCrow(inout vec3 p, inout vec3 n){
  float open=crowMotion.x, power=crowMotion.y, phase=crowMotion.z, air=crowMotion.w;
  if(crowPart>1.5 && crowPart<2.5){
    float side=sign(p.x), span=abs(p.x);
    float salute=max(0.,side*crowWingTip.x);
    float beat=sin(phase);
    // Wrist and primary tips lag the upper arm. The upstroke sweeps aft
    // and narrows the hand, then the whole wing opens for the power stroke.
    float hand=smoothstep(.28,.64,span);
    float returnStroke=.5+.5*cos(phase-.6);
    float sweep=power*hand*(.11+.29*returnStroke);
    vec2 wrist=vec2(side*.30,-.055);
    p.xz=wrist+crowRotate(p.xz-wrist,side*sweep);
    n.xz=crowRotate(n.xz,side*sweep);
    float arm=mix(.095+power*(.17+.72*beat),.72,salute);
    vec2 elbow=vec2(side*.065,.054);
    float bend=mix(power*hand*(.38*sin(phase-.95)-.21*returnStroke),.20*hand,salute);
    p.xy=elbow+crowRotate(p.xy-elbow,side*arm);
    vec2 knuckle=elbow+crowRotate(vec2(side*.25,0.),side*arm);
    p.xy=knuckle+crowRotate(p.xy-knuckle,side*bend);
    n.xy=crowRotate(n.xy,side*(arm+bend));
    float opening=max(open,salute);
    p=mix(crowFold,p,opening);
    p.x*=mix(1.,crowLook.x,opening);
    p.z+=(crowLook.x-1.)*(1.-opening)*max(0.,p.z+.075);
    n=normalize(mix(crowFoldNormal,n,opening));
  }else if(crowPart>0. && crowPart<=1.){
    float weight=crowPart;
    p.z-=max(0.,-.235-p.z)*(crowLook.z-1.);
    vec2 hinge=vec2(.064,-.092);
    float dip=-crowStride.z*weight;
    p.yz=hinge+crowRotate(p.yz-hinge,dip);
    n.yz=crowRotate(n.yz,dip);
    float glance=crowStride.y*weight;
    vec2 neck=vec2(0.,-.096);
    p.xz=neck+crowRotate(p.xz-neck,glance);
    n.xz=crowRotate(n.xz,glance);
    p.y-=weight*.026*air;
    p.z-=weight*(.027*air+crowStride.x*.016*(1.-air));
  }else if(crowPart>4.5){
    float base=.13, reach=smoothstep(base,.36,p.z);
    p.z+=(crowLook.y-1.)*max(0.,p.z-base);
    float fan=(crowStride.w-.26)*reach;
    p.x*=1.+fan*.78;
    p.y+=reach*(.014*crowStride.w+.014*power*air*sin(phase-.7));
    p.z-=abs(p.x)*fan*.23;
  }else if(crowPart>2.5){
    float stride=(crowPart<3.5?1.:-1.)*crowStride.x;
    float swing=-1.39*air+stride*(1.-air)*.49;
    vec2 hip=vec2(-.052,.018);
    p.yz=hip+crowRotate(p.yz-hip,swing);
    p.y+=.017*air + max(0.,stride)*.016*(1.-air);
    // Toes straighten into the slipstream as the feet tuck up.
    p.x=mix(p.x,sign(p.x)*.041,air*.69);
    n.yz=crowRotate(n.yz,swing);
  }
}
`;

function addWallContactShader(shader, wallContact, clock) {
  shader.uniforms.crowEdges = {value:wallContact.edges};
  shader.uniforms.crowHouses = {value:wallContact.buildings};
  shader.uniforms.crowParapets = {value:wallContact.parapets};
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
    uniform vec2 crowParapets[${wallContact.parapets.length / 2}];
    uniform float crowContactTime;
    // Signed distance to the extruded footprint, including re-entrant corners and roof edges.
    float ringDistance(vec2 range) {
      bool inside = false;
      float nearestSq = 1e12;
      for (int i=0; i<${wallContact.maxEdges}; i++) {
        if (i >= int(range.y)) break;
        vec4 edge = crowEdges[int(range.x)+i];
        vec2 ab = edge.zw-edge.xy, ap = crowWorld.xz-edge.xy;
        vec2 offset = ap-ab*clamp(dot(ap,ab)/max(dot(ab,ab),1e-10),0.,1.);
        nearestSq = min(nearestSq, dot(offset,offset));
        if ((edge.y > crowWorld.z) != (edge.w > crowWorld.z)) {
          if ((ap.x*ab.y - ap.y*ab.x)*sign(ab.y) < 0.) inside = !inside;
        }
      }
      return (inside ? -1. : 1.)*sqrt(nearestSq);
    }
    float extrusionDistance(vec2 d) {
      return length(max(d,0.)) + min(max(d.x,d.y),0.);
    }
    float distanceToHouse(float candidate) {
      if (candidate == -2.) return -2.;
      if (candidate < 0.) return 2.;
      vec4 house = crowHouses[int(candidate)];
      vec2 rim = crowParapets[int(candidate)];
      float horizontal = ringDistance(house.xy);
      float fromFloor = house.z-crowWorld.y, fromDeck = crowWorld.y-house.w;
      float d = extrusionDistance(vec2(horizontal,max(fromFloor,fromDeck)));
      if (rim.y>0. && (fromDeck>0. || fromDeck>max(horizontal,fromFloor))) {
        float inner = ringDistance(vec2(rim.x,house.y));
        d = min(d,extrusionDistance(vec2(max(horizontal,-inner),max(fromFloor,crowWorld.y-rim.y))));
      }
      return d;
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

// In first person only the ends of the near-side primaries enter the crow's
// peripheral vision on a deep upstroke. Their projected size follows the
// camera's aspect, keeping the middle of the view clear on a portrait phone.
function createLeaderPrimaries() {
  const {look}=crowPersonality(0);
  const points=[], shades=[];
  const dark=new THREE.Color(0x24292d), light=new THREE.Color(0x657079);
  const vane=dark.clone().lerp(light,.18+.48*look.tint);
  const edge=dark.clone().lerp(light,.34+.45*look.tint);
  const split=look.wingSpan;
  for(const side of [-1,1]) {
    for(let i=0;i<5;i++) {
      const arc=Math.sin((i+1)*Math.PI/7);
      const root=[side*1.14,-.88+i*.015,0];
      const tip=[side*(1.-(.078+.087*arc)*split),-.88+.048*i+.08*arc,0];
      const middle=[side*(.99-.056*arc),tip[1]-.070,0];
      const back=[side*(1.013-.056*arc),tip[1]-.103,0];
      for(const [point,shade] of [[root,vane],[back,vane],[tip,vane],[root,edge],[tip,edge],[middle,edge]]) {
        points.push(...point); shades.push(shade.r,shade.g,shade.b);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(shades,3));
  const material=new THREE.ShaderMaterial({
    vertexColors:true, side:THREE.DoubleSide, depthWrite:false,
    uniforms:{lift:{value:0},light:{value:1}},
    vertexShader:`uniform float lift; varying vec3 feather;
      void main(){
        float aspect=min(1.25,projectionMatrix[0][0]/projectionMatrix[1][1]);
        float side=sign(position.x);
        float reach=(abs(position.x)-1.)*aspect;
        gl_Position=vec4(side*(1.+reach+.34*(1.-lift)),position.y-.10*(1.-lift),-.996,1.);
        feather=color;
      }`,
    fragmentShader:`uniform float light; varying vec3 feather;
      void main(){
        gl_FragColor=vec4(feather*light,1.);
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='crow-leader-wingtips';
  mesh.frustumCulled=false;
  mesh.userData.bakedShadowCaster=mesh.userData.bakedShadowReceiver=false;
  mesh.visible=false;
  return mesh;
}

export function createCrowModels(wallContact = null, count = 12) {
  const group=new THREE.Group();
  group.name='crow-flock';
  const geometry=plumageGeometry();
  const motions=new THREE.InstancedBufferAttribute(new Float32Array(4*count),4).setUsage(THREE.DynamicDrawUsage);
  const strides=new THREE.InstancedBufferAttribute(new Float32Array(4*count),4).setUsage(THREE.DynamicDrawUsage);
  const wingTips=new THREE.InstancedBufferAttribute(new Float32Array(4*count),4).setUsage(THREE.DynamicDrawUsage);
  const looks=new THREE.InstancedBufferAttribute(new Float32Array(4*count),4);
  geometry.setAttribute('crowLook',looks);
  geometry.setAttribute('crowMotion',motions);
  geometry.setAttribute('crowStride',strides);
  geometry.setAttribute('crowWingTip',wingTips);
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
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = individualPlumage(vColor.rgb);')
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        plumageDetail = crowDetail.xyz;
        vec3 crowPosition = position;
        poseCrow(crowPosition,objectNormal);`)
      .replace('#include <begin_vertex>','vec3 transformed = crowPosition;');
    // Give the overlapping feather webs a soft key in the dark and behind the
    // hologram, where the courtyard switches off its physical sunlight.
    shader.fragmentShader=`uniform vec2 crowLowLight;
      varying vec3 plumageDetail;
      float featherRelief() {
        vec2 uv=plumageDetail.xy;
        if(plumageDetail.z>.5 && plumageDetail.z<1.5) {
          // A fine axial shaft and oblique barbs on each flight feather.
          float across=abs(uv.y), shaft=1.-smoothstep(.014,.042+fwidth(uv.y),across);
          float barb=(uv.x-.10*across)*64.;
          float grain=cos(6.28318*barb)*(1.-smoothstep(.20,.70,fwidth(barb)));
          float resolved=1.-smoothstep(.08,.25,fwidth(uv.y));
          return 1.+resolved*(.17*shaft+.047*grain-.13*across);
        }
        if(plumageDetail.z>1.5) {
          // Staggered, shallow feather tips catch the light on the neck and back.
          vec2 pixel=fwidth(uv);
          float cover=step(2.5,plumageDetail.z);
          uv.x+=.12*sin(.83*uv.y)+.06*cos(uv.y*2.1);
          float row=floor(uv.x);
          float side=fract(uv.y+.5*mod(row,2.)+.08*sin(row*1.8))-.5;
          float edge=fract(uv.x)-(.79-1.27*side*side);
          float resolved=1.-smoothstep(.12,.74,max(pixel.x,pixel.y));
          float tip=1.-smoothstep(.015,.17,abs(edge));
          float barb=(uv.x-.37*abs(side))*5.;
          float striae=cos(6.28318*barb)*(1.-smoothstep(.20,.70,fwidth(barb)));
          float vane=.5-abs(side);
          float groove=(1.-smoothstep(.32,.49,abs(side)))*fract(uv.x);
          return 1.+resolved*(-mix(.11,.22,cover)*tip+.049*striae+cover*(.21*vane+.15*groove-.07));
        }
        return 1.;
      }
      `+shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= featherRelief();').replace(
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
  const primaries=createLeaderPrimaries();
  group.add(primaries);
  const transform=new THREE.Object3D();
  transform.rotation.order='YXZ';
  const spread=new Float32Array(count), amplitude=new Float32Array(count);
  const identities=new Array(count);
  let initialized=false;
  let keyDoor=null, beaconPair=null;
  const emitters = [{},{}];
  function update(members,dt,digital=0,daylight=1,story=null,exchange=null,reducedMotion=false) {
    if (story && story.phase!=='idle' && digital<.12 && !keyDoor) {
      keyDoor=createCrowKeyDoor(); group.add(keyDoor.group);
    }
    keyDoor?.update(digital<.12 ? story : null);
    const inStory = story && story.phase!=='idle';
    const pair = digital<.12 && (inStory ? story.beacons : exchange);
    const firstId = pair && (inStory ? story.thief : pair.sender.id);
    const secondId = pair && (inStory ? story.accomplice : pair.recipient.id);
    let first = null, second = null;
    const response=initialized?1-Math.exp(-Math.max(0,dt)*9):1;
    const elapsed=members[0]?.elapsed || 0;
    const leader=members[0];
    const lift=(leader?.mode==='flap' || leader?.mode==='takeoff')
      ? Math.max(0,Math.sin(leader.wingPhase))*clamp(leader.airborne,0,1) : 0;
    primaries.visible=!reducedMotion && digital<.15 && lift>.38;
    if(primaries.visible) {
      primaries.material.uniforms.lift.value=lift;
      primaries.material.uniforms.light.value=.36+.80*clamp(daylight,0,1);
    }
    birds.count=shadows.count=Math.min(count,Math.max(0,members.length-1));
    for(let i=0;i<birds.count;i++) {
      const bird=members[i+1];
      const profile=bird.personality || crowPersonality(bird.id);
      const {look,habits}=profile;
      if (identities[i]!==profile) {
        identities[i]=profile;
        looks.setXYZW(i,look.wingSpan,look.tail,look.beak,look.tint);
        wingTips.setY(i,marks.indexOf(look.mark));
        wingTips.setZ(i,look.markStrength);
        wingTips.setW(i,look.warmth);
        looks.needsUpdate=true;
      }
      const gaze=bird.gazePose;
      const pose=gaze || bird.storyPose || bird.encounterPose || bird.prankPose;
      const air=clamp(bird.airborne,0,1), flight=bird.mode==='flap'||bird.mode==='glide';
      const opening=flight?1:bird.mode==='takeoff'?Math.max(.38,air):Math.max(air,pose?.wings || 0);
      const beat=bird.mode==='glide'?.035:1;
      spread[i]+=(opening-spread[i])*response;
      amplitude[i]+=(beat-amplitude[i])*response;
      const gait=Math.sin(bird.gaitPhase)*clamp(bird.speed*2,0,1);
      // Hold a bearing, make a quick glance and settle. Each perched bird
      // chooses its own cadence, while an encounter holds its attention.
      const watchTime=elapsed*(.43+.56*habits.vigilance)+bird.id*2.4;
      const watchSide=Math.sin(bird.id+Math.floor(watchTime/Math.PI)*2.4);
      const alert=pose?.posture || 0;
      const callAge=elapsed-(bird.musicReplyAt ?? -Infinity);
      const nod=!pose && callAge>=0 && callAge<.40 ? Math.sin(Math.PI*callAge/.40)**2 : 0;
      const quiet=!pose && air<.18 && bird.speed<.65 && !nod;
      const cycle=(watchTime*.21)%1;
      const pulse=cycle<.32 ? Math.sin(Math.PI*cycle/.32)**2 : 0;
      let glance=.36*clamp(Math.sin(watchTime)*4,-1,1)*watchSide;
      let dip=.030*gait*(1-air)*habits.bob;
      if (quiet) {
        if (habits.gesture==='preen') {
          glance+=.96*pulse*watchSide;
          dip+=.52*pulse;
        } else if (habits.gesture==='forage') {
          dip+=.82*pulse*Math.sin(watchTime*4.8)**2;
        } else if (habits.gesture==='watch') {
          glance=.25*watchSide;
          dip-=.14*(1.-pulse);
        } else {
          glance+=.57*pulse*watchSide;
        }
        glance+=bird.neighbourLook || 0;
      }
      if (pose) {
        glance=pose.glance || 0;
        dip=(pose.dip || 0)-alert*.14;
      }
      dip-=nod*.25;
      const landing=bird.mode==='land';
      const fan=clamp(.20+(landing ? .56 : .04)*air+Math.abs(bird.bank)*.5+(pose?.tail || 0),0,1);
      motions.setXYZW(i,spread[i],amplitude[i],bird.wingPhase,air);
      strides.setXYZW(i,gait,gaze ? glance : (1-air)*glance,dip,fan);
      wingTips.setX(i,clamp((gaze?.wingTip || 0)+nod*(i%2 ? -.18 : .18),-1,1)*(1-air));
      const height=bird.y+(pose?.hop || 0)+.195*(look.size-1)*(1-air);
      transform.position.set(bird.x,height+Math.abs(gait)*.008*(1-air),bird.z);
      if (wallIds) wallContact.resolve(bird.x,transform.position.y,bird.z,wallIds.array,2*i);
      const pitch=air*((landing ? .12 : 0)+clamp(bird.vy || 0,-4,5)*.034+.023*amplitude[i]*Math.sin(bird.wingPhase-.7));
      transform.rotation.set(pitch,-bird.yaw,bird.bank,'YXZ');
      transform.scale.setScalar(look.size);
      transform.updateMatrix(); birds.setMatrixAt(i,transform.matrix);
      if (bird.id===firstId || bird.id===secondId) {
        const lamp = bird.id===firstId ? emitters[0] : emitters[1];
        Object.assign(lamp,{x:bird.x,y:bird.y,z:bird.z,yaw:bird.yaw,gait,air,pitch,bank:bird.bank,
          hop:height-bird.y,scale:transform.scale.x});
        if (bird.id===firstId) {first=lamp; first.pulse=(inStory ? pair.thief : pair.sender).pulse;}
        else {second=lamp; second.pulse=(inStory ? pair.accomplice : pair.recipient).pulse;}
      }
      const contact=clamp(1-(height-.20)/1.45,0,1);
      transform.position.set(bird.x,.052,bird.z+.008);
      transform.rotation.set(0,-bird.yaw,0,'YXZ');
      transform.scale.set(.35*contact*look.size,1,.63*contact*look.size);
      transform.updateMatrix(); shadows.setMatrixAt(i,transform.matrix);
    }
    if (!beaconPair && first && second) {
      beaconPair = createCrowBeaconPair();
      group.add(beaconPair.group);
    }
    beaconPair?.update(first,second);
    initialized=true;
    wingTips.needsUpdate=true;
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
    keyDoor?.dispose();
    beaconPair?.dispose();
    primaries.geometry.dispose(); primaries.material.dispose();
    birds.dispose(); shadows.dispose();
    geometry.dispose(); shadowGeometry.dispose(); plumage.dispose(); shadowsMaterial.dispose();
  }};
}
