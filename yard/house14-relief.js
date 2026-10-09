import * as THREE from './vendor/three.module.js';
import { facadeNormal } from './facade-frame.js';

// Recessed single windows / inset loggia / two windows / inset loggia.
// Repeated geometry is instanced so the ten facade bays stay inexpensive.
export function addHouseRelief(scene, solids, materials, layout, building) {
  const sections = building.facadeProject?.reliefSections;
  if (!sections) return;
  layout.obstacles = (layout.obstacles || []).filter(item => !item.id?.startsWith('house14-relief-'));
  const depth = building.facadeProject.reliefDepthM || 1.25;
  const height = building.heightM, floorHeight = height / building.floors;
  const palette = {brick: materials.facade(building.facadeMaterialId), glass: materials.photoWindow(), glazing:materials.photoWindow('glazing'), stair:materials.photoWindow('stair'), concrete: materials.flat(0xbcb7a9), panel: materials.flat(0xc9c1b4), band:materials.flat(0x9d6050)};
  const batches = new Map(), dummy = new THREE.Object3D();
  for (const section of sections) {
    const a = building.footprint[section.edgeIndex], b = building.footprint[(section.edgeIndex + 1) % building.footprint.length];
    const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
    const normal = facadeNormal(a,b,building.footprint);
    const yaw = Math.atan2(normal[0],normal[1]);
    const tangent = [Math.cos(yaw), -Math.sin(yaw)];
    const point = along => [a[0]+(b[0]-a[0])*along/length,a[1]+(b[1]-a[1])*along/length];
    const add = (origin, kind, x,y,z,w,h,d) => {
      const key = `${kind}:${w}:${h}:${d}`;
      if (!batches.has(key)) batches.set(key,{kind,w,h,d,matrices:[]});
      dummy.position.set(origin[0]+tangent[0]*x+normal[0]*z,y,origin[1]+tangent[1]*x+normal[1]*z);
      dummy.rotation.set(0,yaw,0); dummy.updateMatrix();
      batches.get(key).matrices.push(dummy.matrix.clone());
    };
    add(point(length/2),'band',0,height-.55,.07,length,.42,.08);
    for (const center of section.centersM) {
      const origin = point(center);
      // Central masonry and the two outer cheeks form one projecting volume.
      add(origin,'brick',0,height/2,depth/2,5.6,height,depth);
      for (const side of [-1,1]) {
        add(origin,'brick',side*8.25,height/2,depth/2,.35,height,depth);
        add(origin,'brick',side*2.9,height/2,depth/2,.25,height,depth);
      }
      add(origin,'concrete',0,height+.06,depth/2,16.85,.18,depth+.12);
      add(origin,'band',0,height-.55,depth+.015,16.5,.42,.08);
      for (let floor=0;floor<building.floors;floor++) {
        const base=.45+floor*floorHeight, windowY=base+1.6;
        for (const x of [-1.4,1.4]) {
          if (section.entrances && floor===0 && x===-1.4) continue;
          const stair=section.entrances && x===-1.4;
          add(origin,stair?'stair':'glass',x,stair?windowY-.42:windowY,depth+.055,stair?.78:1.4,1.45,.035);
          add(origin,'concrete',x,windowY-.77,depth+.1,1.55,.09,.24);
        }
        for (const side of [-1,1]) {
          const x=side*5.6;
          add(origin,'concrete',x,base,depth/2,5.2,.15,depth);
          add(origin,'panel',x,base+.48,depth-.18,5.05,.82,.12);
          // Glazing sits behind the brick cheeks, not on an external balcony.
          for (let pane=0;pane<5;pane++) add(origin,'glazing',x+(pane-2)*.99,base+1.63,depth-.3,.94,1.45,.035);
          add(origin,'concrete',x,base+2.43,depth/2,5.2,.12,depth);
        }
      }
      const corners=[[-8.43,0],[8.43,0],[8.43,depth],[-8.43,depth]].map(([x,z])=>[origin[0]+tangent[0]*x+normal[0]*z,origin[1]+tangent[1]*x+normal[1]*z]);
      layout.obstacles.push({id:`house14-relief-${section.edgeIndex}-${center}`,footprint:corners});
    }
    // A single window column at either end, two adjacent recessed columns at bay joins.
    const columns = section.centersM.flatMap(center=>[center-10.2,center+10.2]).filter(c=>c>1&&c<length-1);
    for (const along of columns) for (let floor=0;floor<building.floors;floor++) {
      add(point(along),'glass',0,.45+floor*floorHeight+1.6,.09,1.3,1.45,.035);
    }
  }
  for (const [key,batch] of batches) {
    const geometry=new THREE.BoxGeometry(batch.w,batch.h,batch.d);
    if(batch.kind==='brick') {
      const uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++) {
        const face=Math.floor(i/4), width=face<2?batch.d:batch.w, vertical=(face===2||face===3)?batch.d:batch.h;
        uv.setXY(i,uv.getX(i)*width/2.08,uv.getY(i)*vertical/.6);
      }
    }
    const mesh=new THREE.InstancedMesh(geometry,palette[batch.kind],batch.matrices.length);
    batch.matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));
    mesh.name=`house14-relief-${key}`;scene.add(mesh);
    if(batch.kind==='brick') solids.push(mesh);
  }
}
