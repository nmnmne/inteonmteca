import * as THREE from './vendor/three.module.js';

function surface(data, material, height) {
  const points = ring => ring.map(([x,z]) => new THREE.Vector2(x,-z));
  const shape = new THREE.Shape(points(data.polygon));
  for (const hole of data.holes || []) shape.holes.push(new THREE.Path(points(hole)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI/2;
  mesh.position.y = height;
  mesh.userData.bakedShadowCaster = false;
  return mesh;
}

function lawnMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 14026;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = '#80805a';
  ctx.fillRect(0,0,512,512);
  // Dry summer grass and bare earth, with small irregular greener patches.
  for (let i=0;i<220;i++) {
    const x=random()*512, y=random()*512, r=12+random()*48;
    const color=i%3 ? '137,120,79' : '77,103,57';
    for (const ox of [-512,0,512]) for (const oy of [-512,0,512]) {
      const g=ctx.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r);
      g.addColorStop(0,`rgba(${color},.3)`); g.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=g; ctx.fillRect(x+ox-r,y+oy-r,r*2,r*2);
    }
  }
  const colors=['#92916a','#6b774c','#aaa079','#77714f','#626c45'];
  for(let i=0;i<26000;i++) {
    ctx.strokeStyle=colors[i%colors.length];
    const x=random()*512,y=random()*512;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*3-1.5,y-1-random()*3);ctx.stroke();
  }
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.repeat.set(1/7,1/7);
  map.anisotropy=4;
  return new THREE.MeshLambertMaterial({map});
}

export function addLandscaping(scene, materials, data) {
  if (!data?.patches?.length) return;
  const lawn=lawnMaterial();
  data.patches.forEach((patch,i) => {
    const mesh=surface(patch,lawn,.045);
    mesh.name=`lawn-${i}`;
    scene.add(mesh);
  });
  const pathMaterial=materials.concrete(1,1);
  data.paths.forEach((path,i) => {
    const mesh=surface(path,pathMaterial,.027);
    mesh.name=`lawn-entrance-path-${i}`;
    scene.add(mesh);
  });
  const segments=[];
  for(const [a,b] of data.curbs) {
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const count=Math.max(1,Math.ceil(length));
    for(let i=0;i<count;i++) segments.push({a,b,length: length/count,t:(i+.5)/count});
  }
  const curb=new THREE.InstancedMesh(new THREE.BoxGeometry(1,data.curbHeightM,data.curbWidthM),
    new THREE.MeshLambertMaterial({color:0xb1ada0}),segments.length);
  const dummy=new THREE.Object3D();
  segments.forEach(({a,b,length,t},i) => {
    dummy.position.set(a[0]+(b[0]-a[0])*t,data.curbHeightM/2,a[1]+(b[1]-a[1])*t);
    dummy.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);
    dummy.scale.set(Math.max(.01,length-.014),1,1); dummy.updateMatrix();
    curb.setMatrixAt(i,dummy.matrix);
    curb.setColorAt(i,new THREE.Color().setScalar(.91+(i*17%11)/110));
  });
  curb.name='lawn-curbs';
  curb.userData.bakedShadowCaster=false;
  scene.add(curb);
}
