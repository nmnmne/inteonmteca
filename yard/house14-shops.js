import * as THREE from './vendor/three.module.js';

// These ground-floor loggias on the west face have street entrances. Their
// business map pins are about 50 m apart; both photographs show blue fascia,
// pale infill, iron grilles and stairs parallel to the front of the building.
function shopFront(pharmacy) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d2d1c4';
  ctx.fillRect(0, 0, 640, 384);
  const doorX = 22, doorW = 115, glassX = 147;
  ctx.fillStyle = '#928e82';
  ctx.fillRect(doorX-5, 109, doorW+10, 275);
  ctx.fillStyle = '#d2d4ca';
  ctx.fillRect(doorX, 114, doorW, 270);
  const glass = ctx.createLinearGradient(0, 104, 0, 280);
  glass.addColorStop(0, '#62726f');
  glass.addColorStop(1, '#2f3b3e');
  ctx.fillStyle = glass;
  ctx.fillRect(doorX+9, 122, doorW-18, 129);
  ctx.fillRect(glassX, 117, 484, 132);
  ctx.strokeStyle = '#abae9f';
  ctx.lineWidth = 4;
  for (let x = glassX; x < 637; x += 81) {
    ctx.beginPath(); ctx.moveTo(x, 116); ctx.lineTo(x, 378); ctx.stroke();
  }
  ctx.strokeStyle = '#353c38';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = glassX; x < 629; x += 16) {
    ctx.moveTo(x, 117); ctx.lineTo(x, 248);
    if (pharmacy && x < 610) {
      ctx.moveTo(x, 155); ctx.quadraticCurveTo(x+15, 174, x+15, 196);
      ctx.quadraticCurveTo(x+15, 215, x, 226);
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#4c5552'; ctx.fillRect(doorX+doorW-16, 259, 7, 22);
  ctx.fillStyle = pharmacy ? '#294c73' : '#275986';
  ctx.fillRect(0, 0, 640, 106);
  ctx.fillStyle = '#142c411f';
  for (let y = 3; y < 105; y += 6) ctx.fillRect(0, y, 640, 1);
  ctx.font = pharmacy ? 'bold 47px Arial' : 'bold 58px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9d59a';
  ctx.fillText(pharmacy ? 'ДӘРІХАНА · АПТЕКА' : 'НОТАРИУС', 320, 55, 575);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: .76, metalness: .12 });
}

export function addHouse14Shop(scene, origin, yaw, pharmacy) {
  const name = pharmacy ? 'pharmacy' : 'notary';
  const mount = new THREE.Object3D();
  mount.position.set(origin[0], 0, origin[1]);
  mount.rotation.y = yaw;
  mount.updateMatrixWorld();
  const iron = new THREE.MeshStandardMaterial({color:0x414947, metalness:.52, roughness:.61});
  function attach(mesh, part) {
    mesh.name = `house14-${name}-${part}`;
    mesh.applyMatrix4(mount.matrixWorld);
    scene.add(mesh);
  }
  function plate(x,y,z,w,h,d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), iron);
    mesh.position.set(x,y,z);
    attach(mesh, 'stair');
  }
  function rail(x1,y1,z1,x2,y2,z2) {
    const a = new THREE.Vector3(x1,y1,z1), b = new THREE.Vector3(x2,y2,z2);
    const axis = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,axis.length(),6),iron);
    mesh.position.copy(a).lerp(b,.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), axis.normalize());
    attach(mesh, 'railing');
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(5.02,3.05), shopFront(pharmacy));
  front.position.set(0,2.27,1.33);
  attach(front, 'front');
  const platform = .77, edge = 2.51;
  plate(-1.95,platform,1.92,1.16,.10,1.16);
  for (const x of [-2.43,-1.47]) plate(x,.37,2.42,.055,.74,.055);
  const direction = pharmacy ? 1 : -1;
  const landingEnd = -1.95 + direction*.56;
  const stairEnd = landingEnd + direction*1.19;
  for (let i=0;i<4;i++) plate(landingEnd+direction*(.20+i*.29),platform-(i+1)*.15,1.92,.29,.055,1.1);
  for (const z of [1.42, edge]) {
    for (const [x,level] of [[landingEnd,platform],[stairEnd,.12]]) rail(x,level,z,x,level+.85,z);
    rail(landingEnd,platform+.85,z,stairEnd,.97,z);
    rail(landingEnd,platform+.43,z,stairEnd,.55,z);
  }
  const landingBack = -1.95 - direction*.56;
  rail(landingBack,platform,edge,landingBack,platform+.85,edge);
  rail(landingBack,platform+.85,edge,landingEnd,platform+.85,edge);
}
