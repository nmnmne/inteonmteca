import * as THREE from './vendor/three.module.js';
import { facadeNormal } from './facade-frame.js';

// The approved reconstructed photograph: four stair strips, three balcony stacks.
// All small repeated parts share instanced geometry and deterministic materials.
export function addFiveStoreyReference(scene, materials, building) {
  const project = building.facadeProject;
  if (project?.referenceStyle !== 'pink-hourglass') return;
  const batches = new Map(), dummy = new THREE.Object3D();
  const palette = {
    wall0: materials.flat(0xcdb9a5), wall1: materials.flat(0xc5ada1),
    wall2: materials.flat(0xd3c1ad), wall3: materials.flat(0xc9b7a8),
    seam: materials.flat(0x8e8174), red: materials.flat(0xa85748),
    plinth: materials.flat(0x735149), frame: materials.flat(0xd5d1c2),
    slab: materials.flat(0xaaa699), white: materials.flat(0xc3c4bb),
    blue: materials.flat(0x254d9e), dark: materials.flat(0x334048),
    glass: materials.flat(0x405461), glassLight: materials.flat(0x657a80),
    door: materials.flat(0x685138), metal: materials.flat(0x5f6864),
  };
  const floorH = building.heightM / building.floors;
  const entryCount = project.referenceEntranceCount || 4;
  for (let edge = 0; edge < building.footprint.length; edge++) {
    const a = building.footprint[edge], b = building.footprint[(edge+1)%building.footprint.length];
    const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
    const normal = facadeNormal(a,b,building.footprint);
    const yaw = Math.atan2(normal[0],normal[1]);
    const origin = [(a[0]+b[0])/2,(a[1]+b[1])/2];
    const add = (kind,x,y,z,w,h,d, shape = 'box') => {
      const key = `${kind}:${shape}`;
      if (!batches.has(key)) batches.set(key,{kind,shape,matrices:[]});
      dummy.position.set(origin[0]+Math.cos(yaw)*x+normal[0]*z,y,origin[1]-Math.sin(yaw)*x+normal[1]*z);
      dummy.rotation.set(0,yaw,0); dummy.scale.set(w,h,d); dummy.updateMatrix();
      batches.get(key).matrices.push(dummy.matrix.clone());
    };
    // Slightly uneven panel colours and actual recessed joints, across every face.
    const cols = Math.round(length / 2.8), panelW = length / cols;
    add('seam',0,building.heightM/2,.055,length,building.heightM,.04);
    for (let row=0;row<5;row++) for(let col=0;col<cols;col++) {
      add(`wall${(col*7+row*3+edge)%4}`,-length/2+(col+.5)*panelW,(row+.5)*floorH,.09,panelW-.035,floorH-.035,.07);
    }
    add('plinth',0,.23,.14,length,.46,.12);
    add('slab',0,building.heightM+.03,.18,length+.3,.17,.6);
    add('frame',0,building.heightM-.18,.14,length,.08,.22);
    const window = (x,y,w=1.3,h=1.42,z=.18, panes=2,seed=0) => {
      add('dark',x,y,z,w+.16,h+.16,.08);
      add(seed%3?'glass':'glassLight',x,y,z+.048,w,h,.025);
      for(const side of [-1,1]) {
        add('frame',x+side*(w/2+.015),y,z+.07,.055,h+.1,.055);
        add('frame',x,y+side*(h/2+.015),z+.07,w+.1,.055,.055);
      }
      for(let i=1;i<panes;i++) add('frame',x-w/2+w*i/panes,y,z+.072,.045,h,.055);
      add('slab',x,y-h/2-.085,z+.08,w+.2,.08,.25);
    };
    if(edge === project.referenceFrontEdge) {
      const span = length/entryCount, stairs = Array.from({length:entryCount},(_,i)=>(i-(entryCount-1)/2)*span);
      for(let bay=0;bay<entryCount;bay++) {
        const x=stairs[bay];
        for(let floor=0;floor<5;floor++) {
          const base=floor*floorH;
          // Broad red trapezoid narrowing towards the low stairwell window.
          add('red',x,base+floorH/2,.142,2.9,floorH-.06,1,'hourglass');
          if(floor>0) window(x,base+.6,1.05,.64,.19,2,bay+floor);
        }
        add('slab',x,1.25,.22,1.94,2.5,.18);
        add('door',x,1.15,.33,1.52,2.3,.09);
        add('metal',x+.24,1.15,.395,.035,2.28,.025);
        add('frame',x+.42,1.14,.43,.04,.24,.06);
        add('white',x-.25,1.87,.395,.19,.14,.018);
        add('slab',x,2.57,.63,2.5,.14,1.2);
        add('metal',x,2.65,.65,2.58,.045,1.25);
        add('slab',x,.1,.62,2.16,.2,1.1);
      }
      const columns = [-length/2+1.8,-length/2+4.7,length/2-4.7,length/2-1.8];
      for(let stack=0;stack<entryCount-1;stack++) {
        const x=(stairs[stack]+stairs[stack+1])/2;
        columns.push(x-3.1,x+3.1);
        for(let floor=0;floor<5;floor++) {
          const base=.48+floor*floorH;
          window(x,base+1.22,2.6,1.8,.18,3,stack+floor);
          add('slab',x,base,.65,3.03,.15,1.35);
          const kind=(stack===1&&floor===4)||(stack===0&&floor===1)||(stack===2&&floor===1)?'blue':'white';
          add(kind,x,base+.48,1.26,2.88,.83,.1);
          for(const side of [-1,1]) add(kind,x+side*1.41,base+.48,.72,.09,.83,1.05);
          const enclosed=(stack+floor)%4!==2;
          if(enclosed) {
            window(x,base+1.58,2.78,1.32,1.23,4,stack+floor);
            for(const side of [-1,1]) add('glass',x+side*1.43,base+1.59,.72,.035,1.3,1);
            add('slab',x,base+2.29,.73,3.06,.1,1.34);
          } else {
            add('metal',x,base+.94,1.3,2.96,.045,.045);
            for(let post=0;post<8;post++) add('metal',x-1.38+post*.394,base+.53,1.32,.025,.8,.025);
          }
          for(let rib=0;rib<19;rib++) add(kind,x-1.35+rib*.15,base+.47,1.32,.019,.76,.022);
        }
      }
      columns.forEach((x,col)=>{for(let floor=0;floor<5;floor++) window(x,.48+floor*floorH+1.35,1.27,1.42,.18,2,col+floor);});
      // Small rooftop vents seen above the three balcony stacks.
      for(const x of stairs.slice(1).map((value,i)=>(value+stairs[i])/2)) {
        add('slab',x,building.heightM+.48,-1.5,.85,.85,.75);
        add('metal',x,building.heightM+.94,-1.5,1.1,.1,1);
      }
    } else {
      // Unphotographed faces retain a restrained regular window rhythm.
      const count = length>20 ? entryCount*5-2 : 3;
      for(let col=0;col<count;col++) for(let floor=0;floor<5;floor++) {
        window(-length/2+(col+.5)*length/count,.48+floor*floorH+1.35,1.27,1.42,.18,2,col+floor);
      }
    }
  }
  for(const [key,batch] of batches) {
    let geometry;
    if(batch.shape==='hourglass') {
      const shape=new THREE.Shape();
      shape.moveTo(-.5,.5); shape.lineTo(.5,.5); shape.lineTo(.2,-.22);
      shape.lineTo(.2,-.46); shape.lineTo(-.2,-.46); shape.lineTo(-.2,-.22); shape.closePath();
      geometry=new THREE.ShapeGeometry(shape);
    } else geometry=new THREE.BoxGeometry(1,1,1);
    const mesh=new THREE.InstancedMesh(geometry,palette[batch.kind],batch.matrices.length);
    batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.name=`five-storey-reference-${building.id}-${key}`;
    scene.add(mesh);
  }
}
