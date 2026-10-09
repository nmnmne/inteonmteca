import * as THREE from './vendor/three.module.js';
import { facadeNormal } from './facade-frame.js';

/* Exterior proportions from the supplied street photograph, not an interior plan.
   One instanced draw per material, including slab ends and inset glazing. */
export function addTowerReference(scene, materials, building) {
  const palette={stone:materials.flat(0xc9c4b6),recess:materials.flat(0x95574b),
    glass:materials.photoWindow(),glazing:materials.photoWindow('glazing'),frame:materials.flat(0xddd9ca),dark:materials.flat(0x424c4c)};
  const batches=new Map(),dummy=new THREE.Object3D(),ring=building.footprint;
  const stacks=new Set(building.facadeProject.balconyEdges),fh=building.heightM/building.floors;
  ring.forEach((a,edge)=>{
    const b=ring[(edge+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),normal=facadeNormal(a,b,ring);
    const yaw=Math.atan2(normal[0],normal[1]);
    const add=(kind,along,y,depth,w,h,d)=>{
      dummy.position.set(a[0]+(b[0]-a[0])*along/length+normal[0]*depth,y,a[1]+(b[1]-a[1])*along/length+normal[1]*depth);
      dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();
      if(!batches.has(kind))batches.set(kind,[]);batches.get(kind).push(dummy.matrix.clone());
    };
    add('stone',length/2,building.heightM+.25,.1,length+.12,.45,.55);
    if(length<2)return;
    const balcony=stacks.has(edge),width=Math.min(length-1.1,length>10?length*.64:length*.7),center=length*.5;
    if(balcony){
      add('recess',center,building.heightM/2,.045,width,building.heightM-.6,.05);
      for(const side of [-1,1])add('stone',center+side*(width/2+.12),building.heightM/2,.52,.24,building.heightM,1.12);
    }
    for(let floor=0;floor<building.floors;floor++){
      const base=.24+floor*fh,y=base+1.65;
      if(balcony){
        add('stone',center,base,.65,width+.4,.17,1.42);
        add('stone',center,base+.65,1.26,width+.3,.83,.16);
        add('dark',center,base+1.1,1.26,width+.28,.065,.12);
        const enclosed=(floor*7+edge)%5<2;
        const panes=Math.max(3,Math.round(width/.82));
        for(let pane=0;pane<panes;pane++){
          const x=center-width/2+(pane+.5)*width/panes;
          if(enclosed)add('glazing',x,base+1.89,1.17,width/panes-.035,1.46,.035);
          else if(pane===1 || pane===panes-2)add('glass',x,y,.10,Math.min(1.15,width/panes),1.45,.035);
        }
        // Slim window piers beside the broad balcony band, as in the photograph.
        const margin=(length-width)/2;
        if(margin>1.15)for(const x of [margin/2,length-margin/2])add('glass',x,y,.075,.72,1.36,.045);
      }else{
        const count=Math.max(1,Math.floor(length/3.1));
        for(let col=0;col<count;col++){
          const x=length*(col+.5)/count;
          add('glass',x,y,.075,Math.min(1.16,length*.4),1.48,.04);
          add('stone',x,y-.79,.17,Math.min(1.28,length*.45),.085,.32);
        }
      }
    }
  });
  for(const [kind,matrices] of batches){
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),palette[kind],matrices.length);
    matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));mesh.name=`tower34-photo-${kind}`;scene.add(mesh);
  }
}
