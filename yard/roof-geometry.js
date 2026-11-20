import * as THREE from './vendor/three.module.js';
import {facadeNormal, wallCorners} from './facade-frame.js';
import {pointInRing} from './navigation.js';

function wallHeight(building) {
  return building.role === 'electric-kiosk' ? (Number(building.heightM) || 2.7) : building.heightM;
}

export const roofDeckY = building => wallHeight(building) + .05;

export function roofParapet(building) {
  if (!building.roofParapetM) return null;
  const {width,height} = building.roofParapetM;
  const outer = wallCorners(building.footprint);
  const area = outer.reduce((sum, [x,z], i) => {
    const b = outer[(i+1)%outer.length];
    return sum+x*b[1]-z*b[0];
  }, 0);
  const baseY = roofDeckY(building);
  return {outer, inner:wallCorners(outer, Math.sign(area)*width), baseY, topY:baseY+height, width};
}

function length(a,b) { return Math.hypot(b[0]-a[0], b[1]-a[1]); }
function at(a,b,t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; }
function vertex([x,z],y) { return [x,y,z]; }

function longestEdge(ring) {
  return ring.reduce((longest,a,i) =>
    length(a,ring[(i+1)%ring.length]) > length(ring[longest],ring[(longest+1)%ring.length]) ? i : longest, 0);
}

function gableProfile(building) {
  const kiosk = building.role === 'electric-kiosk';
  if ((!kiosk && building.roof !== 'red') || building.footprint.length !== 4) return null;
  const [a,b,c,d] = building.footprint;
  const [left,right] = kiosk && length(a,b)<length(a,d) ? [[a,d],[b,c]] : [[a,b],[d,c]];
  const eaveY = kiosk ? wallHeight(building) : roofDeckY(building);
  return {left,right,ridge:[at(left[0],right[0],.5),at(left[1],right[1],.5)],
    eaveY, ridgeY:eaveY+(kiosk ? .85 : .9)};
}

// Each face owns its normal. Folding a shared vertex across a gable or a
// parapet edge would round off the silhouette under the courtyard sun.
function faces() {
  const positions=[], uvs=[];
  function face(points, coords, outward) {
    const [a,b,c] = points;
    const u = new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    u.cross(new THREE.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]));
    const front = u.x*outward[0]+u.y*outward[1]+u.z*outward[2] > 0;
    for (let i=2; i<points.length; i++) {
      for (const j of (front ? [0,i-1,i] : [0,i,i-1])) {
        positions.push(...points[j]); uvs.push(...coords[j]);
      }
    }
  }
  function geometry() {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    result.computeVertexNormals();
    return result;
  }
  return {face,geometry};
}

function rimFace(shell,a,b,bottom,top,along,outward) {
  const end = along+length(a,b);
  shell.face([vertex(a,bottom),vertex(b,bottom),vertex(b,top),vertex(a,top)],
    [[along,0],[end,0],[end,top-bottom],[along,top-bottom]],[outward[0],0,outward[1]]);
}

function flatDeck(ring,top) {
  const shell = faces();
  const i = longestEdge(ring), a = ring[i], b = ring[(i+1)%ring.length], span = length(a,b);
  const tx = (b[0]-a[0])/span, tz = (b[1]-a[1])/span;
  const roofUV = ([x,z]) => [(x-a[0])*tx+(z-a[1])*tz, (z-a[1])*tx-(x-a[0])*tz];
  const triangles = THREE.ShapeUtils.triangulateShape(ring.map(([x,z]) => new THREE.Vector2(x,z)),[]);
  for (const tri of triangles) {
    const points = tri.map(i => ring[i]);
    shell.face(points.map(p => vertex(p,top)), points.map(roofUV), [0,1,0]);
  }
  let along = 0;
  for (let i=0; i<ring.length; i++) {
    const a=ring[i], b=ring[(i+1)%ring.length];
    rimFace(shell,a,b,top-.14,top,along,facadeNormal(a,b,ring));
    along += length(a,b);
  }
  return shell.geometry();
}

function gableDeck(building,profile) {
  const shell = faces(), {left,right,ridge,eaveY,ridgeY} = profile;
  for (const side of [left,right]) {
    const run = length(...side), slope = Math.hypot(length(side[0],ridge[0]),ridgeY-eaveY);
    shell.face([vertex(side[0],eaveY),vertex(side[1],eaveY),vertex(ridge[1],ridgeY),vertex(ridge[0],ridgeY)],
      [[0,0],[run,0],[run,slope],[0,slope]], [0,1,0]);
  }
  for (let i=0; i<2; i++) {
    const towardEnd = [ridge[i][0]-ridge[1-i][0],0,ridge[i][1]-ridge[1-i][1]];
    const span = length(left[i],right[i]);
    shell.face([vertex(left[i],eaveY),vertex(right[i],eaveY),vertex(ridge[i],ridgeY)],
      [[0,0],[span,0],[span*.5,ridgeY-eaveY]],towardEnd);
  }
  const ring = building.footprint;
  for (let i=0; i<ring.length; i++) {
    const a=ring[i], b=ring[(i+1)%ring.length];
    rimFace(shell,a,b,eaveY-.1,eaveY,0,facadeNormal(a,b,ring));
  }
  return shell.geometry();
}

function parapetGeometry({outer,inner,baseY,topY,width}) {
  const shell = faces();
  let along = 0;
  for (let i=0; i<outer.length; i++) {
    const j=(i+1)%outer.length, a=outer[i], b=outer[j], c=inner[j], d=inner[i];
    const normal=facadeNormal(a,b,outer), end=along+length(a,b);
    rimFace(shell,a,b,baseY,topY,along,normal);
    rimFace(shell,d,c,baseY,topY,along,[-normal[0],-normal[1]]);
    shell.face([a,b,c,d].map(p => vertex(p,topY)),
      [[along,0],[end,0],[end,width],[along,width]], [0,1,0]);
    along=end;
  }
  return shell.geometry();
}

export function addRoof(scene, building, palette) {
  const gable=gableProfile(building), rim=roofParapet(building);
  const metal=building.role==='electric-kiosk' || building.roof==='metal';
  const surface=building.roofMaterialId==='bitumen-felt' ? palette.felt :
    metal ? palette.metal : building.roof==='red' ? palette.red : palette.flat;
  const geometry=gable ? gableDeck(building,gable) : flatDeck(rim?.outer || wallCorners(building.footprint),roofDeckY(building));
  const deck=new THREE.Mesh(geometry,surface);
  deck.name='roof-'+building.id;
  deck.castShadow=deck.receiveShadow=true;
  scene.add(deck);
  if (rim) {
    const lip=new THREE.Mesh(parapetGeometry(rim),palette.parapet);
    lip.name='roof-parapet-'+building.id;
    lip.castShadow=lip.receiveShadow=true;
    scene.add(lip);
  }
}

function roostRandom(id) {
  let seed=2166136261;
  for (const char of id) seed=Math.imul(seed^char.charCodeAt(0),16777619);
  return () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}

// Leave room at the ends and between neighbours even on the short ridge.
function groupPositions(span,count,random) {
  const positions=[0];
  for (let i=1; i<count; i++) positions.push(positions[i-1]+.48+1.15*random());
  const extent=positions[count-1], margin=Math.min(1,span*.15);
  const scale=Math.min(1,(span-2*margin)/(extent || 1));
  const spare=span-2*margin-extent*scale;
  const start=margin+spare*(.22+.56*random());
  return positions.map(distance => (start+distance*scale)/span);
}

export function createRoofPerches(layout) {
  const perches=[];
  const structures=(layout.utilityStructures || []).filter(s => s.role==='electric-kiosk');
  for (const building of [...(layout.buildings || []),...structures]) {
    if (building.footprint.length<3) continue;
    const add=(p,y,heading) => perches.push({x:p[0],z:p[1],y,heading,houseId:building.id});
    const random=roostRandom(building.id);
    const gable=gableProfile(building);
    if (gable) {
      const [a,b]=gable.ridge;
      const alongRidge=Math.atan2(a[0]-b[0],a[1]-b[1]); // Bill points along local -Z.
      for (const t of groupPositions(length(a,b),2+Math.floor(2*random()),random)) {
        const turn=(random()-.5)*.8+(random()<.5 ? Math.PI : 0);
        add(at(a,b,t),gable.ridgeY,alongRidge+turn);
      }
      continue;
    }
    const rim=roofParapet(building), ring=rim?.outer || wallCorners(building.footprint);
    // Face the yard where a facade was identified. The short end of house
    // 14 is directly above its wall logo and visible from the starting point.
    const logoEdge=building.id===layout.musicWall?.buildingId ? ring.findIndex((_,i) => {
      const a=building.footprint[i], b=building.footprint[(i+1)%ring.length];
      return layout.musicWall.segment.every(p => length(a,p)<.2 || length(b,p)<.2);
    }) : -1;
    const edge=logoEdge>=0 ? logoEdge : (building.facadeProject?.referenceFrontEdge ?? longestEdge(ring));
    const a=ring[edge], b=ring[(edge+1)%ring.length], span=length(a,b);
    const normal=facadeNormal(a,b,ring);
    const faceYard=Math.atan2(-normal[0],-normal[1])+(random()-.5)*.6;
    const count=rim ? 4 : 1+Math.floor(random()*5);
    const positions=groupPositions(span,count,random);
    for (const [j,t] of positions.entries()) {
      const p=at(a,b,t), onCap=rim && j<3;
      // Leave the feet clear of coping edges, balcony cornices and vents.
      const inset=onCap ? rim.width*(.40+.20*random()) : rim ? 1.2+random()*.8 : .46+.49*random();
      const foot=[p[0]-normal[0]*inset,p[1]-normal[1]*inset];
      if (pointInRing(...foot,ring)) add(foot,onCap ? rim.topY : roofDeckY(building),faceYard+(random()-.5)*2.4);
    }
  }
  return perches;
}
