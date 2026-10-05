import * as THREE from '../yard/vendor/three.module.js';
import { isWalkable } from '../yard/navigation.js';
export function audit(yard) {
 const {scene,layout,lighting}=yard; scene.updateMatrixWorld(true);
 const baked=scene.userData.bakedLighting;
 const size=baked.texture.image.width;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(baked.texture.image,0,0);
 const pixels=ctx.getImageData(0,0,size,size).data;
 const matrix=new THREE.Matrix4().fromArray(baked.entry.matrix);
 const direction=new THREE.Vector3(...lighting.sunVectorXYZ);
 const ray=new THREE.Raycaster();
 const casters=[];scene.traverse(o=>{if(o.userData.bakedShadowReceiver && o.userData.bakedShadowCaster!==false) casters.push(o)});
 const rows=[], views=[];
 scene.traverse(o=>{
  if(!o.userData.bakedShadowReceiver || o.geometry.type!=='PlaneGeometry' || o.isInstancedMesh) return;
  const normal=new THREE.Vector3(0,0,1).transformDirection(o.matrixWorld);
  if(Math.abs(normal.y)>.1) return;
  if(normal.dot(direction)<0) normal.negate();
  if(normal.dot(direction)<.15) return;
  const width=o.geometry.parameters.width,height=o.geometry.parameters.height;
  if(width<5||height<5) return;
  let shadowed=0,lit=0;
  for(let ix=1;ix<=8;ix++) for(let iy=1;iy<=8;iy++) {
    const point=new THREE.Vector3((ix/9-.5)*width,(iy/9-.5)*height,0).applyMatrix4(o.matrixWorld);
    const q=point.clone().applyMatrix4(matrix);
    if(q.x<0||q.x>1||q.y<0||q.y>1) continue;
    const px=Math.floor(q.x*size),py=(size-1)-Math.floor(q.y*size),offset=(py*size+px)*4;
    const depth=(pixels[offset]*65536+pixels[offset+1]*256+pixels[offset+2])/16777215;
    // Surface plane evaluated at texel center, avoiding sloped-surface self acne.
    const tx=new THREE.Vector3(1,0,0).transformDirection(o.matrixWorld);
    const ty=new THREE.Vector3(0,1,0).transformDirection(o.matrixWorld);
    const dx=point.clone().add(tx).applyMatrix4(matrix).sub(q),dy=point.clone().add(ty).applyMatrix4(matrix).sub(q);
    const det=dx.x*dy.y-dx.y*dy.x;
    const gx=(dy.y*dx.z-dx.y*dy.z)/det,gy=(dx.x*dy.z-dy.x*dx.z)/det;
    const z=q.z+gx*((px+.5)/size-q.x)+gy*(((size-1)-py+.5)/size-q.y);
    const bakedShadow=z-.018/baked.entry.depthRange>depth;
    ray.set(point.clone().addScaledVector(direction,.035),direction);
    const realShadow=ray.intersectObjects(casters,false).length>0;
    rows.push({bakedShadow,realShadow,point:point.toArray()});
    if(realShadow) shadowed++; else lit++;
  }
  if(shadowed && lit) {
    const pos=o.getWorldPosition(new THREE.Vector3());
    const at=pos.clone().addScaledVector(normal,18);at.y=layout.movement.eyeM;
    if(isWalkable(layout,at.x,at.z,layout.movement.radiusM)) {
      const delta=pos.clone().sub(at);
      views.push({x:at.x,z:at.z,yaw:Math.atan2(delta.x,-delta.z),pitch:Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),shadowed,lit});
    }
  }
 });
 return {samples:rows.length,matches:rows.filter(r=>r.bakedShadow===r.realShadow).length,shadowed:rows.filter(r=>r.realShadow).length,views};
}
