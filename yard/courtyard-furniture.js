import * as THREE from './vendor/three.module.js';

function weatheredWood() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(canvas.width,canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const knot = Math.hypot((x-73)*.058, (y-25)*.41);
      const grain = y + 1.4*Math.sin(x*.024 + y*.06) + 3*Math.exp(-knot*.22)*Math.sin(knot);
      const pale = .5 + .5*Math.cos(grain*2.68 + Math.sin(grain*.50));
      const value = 198 + 20*pale - 25*pale**12 - 16*Math.exp(-knot*.55);
      const index = (y*canvas.width+x)*4;
      data.data.set([value+12, value+3, value-8, 255], index);
    }
  }
  ctx.putImageData(data,0,0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({map, bumpMap:map, bumpScale:.004, roughness:.87});
}

// Footprints are also used by navigation to keep the crow's landings clear.
// The first edge points along the seat or railing, local +Z faces the path.
export function addCourtyardFurniture(scene, materials, obstacles) {
  const unitBox = new THREE.BoxGeometry(1,1,1);
  const steel = materials.paintedMetal(0xffffff);
  const batches = {
    wood: {geometry:unitBox, material:weatheredWood()},
    metal: {geometry:unitBox, material:steel},
    pad: {geometry:unitBox, material:materials.concrete(1,1)},
    liner: {geometry:new THREE.CylinderGeometry(.18,.14,.37,14,1,true), material:steel},
    ring: {geometry:new THREE.TorusGeometry(.192,.014,5,16).rotateX(Math.PI/2), material:steel},
  };
  for (const batch of Object.values(batches)) batch.parts = [];
  const frame = new THREE.Object3D(), piece = new THREE.Object3D();
  function part(batch, x, y, z, w, h, d, color, tilt = 0, yaw = 0, roll = 0) {
    piece.position.set(x,y,z);
    piece.rotation.set(tilt,yaw,roll);
    piece.scale.set(w,h,d);
    piece.updateMatrix();
    batches[batch].parts.push({matrix:new THREE.Matrix4().multiplyMatrices(frame.matrix,piece.matrix), color});
  }
  let seats = 0, gardens = 0;
  const timber = [0xa78362, 0xad8862, 0x9b795c, 0xa58b70, 0xa08262];
  const railPaint = [0x486663, 0x526b59, 0x567773];
  for (const {kind,footprint} of obstacles || []) {
    if (kind !== 'bench' && kind !== 'garden-fence') continue;
    const [a,b,c] = footprint;
    frame.position.set((a[0]+c[0])*.5, .05, (a[1]+c[1])*.5);
    frame.rotation.y = Math.atan2(a[1]-b[1], b[0]-a[0]);
    frame.updateMatrix();
    if (kind === 'bench') {
      const seat = -.39, paint = railPaint[seats % railPaint.length];
      // A slightly proud concrete pad keeps the footplates clear of the turf.
      part('pad',0,.023,0,3.19,.056,.97,0xc5c0ae);
      for (const side of [-.75,.75]) {
        const x = seat+side;
        for (const z of [-.18,.18]) {
          part('metal',x,.23,z,.045,.39,.045,paint);
          part('metal',x,.067,z,.11,.017,.105,0x454b47);
        }
        part('metal',x,.425,0,.055,.046,.53,paint);
        part('metal',x,.66,-.246,.046,.50,.042,paint,-.15);
      }
      part('metal',seat,.20,-.16,1.55,.055,.04,paint);
      for (let i=0; i<4; i++) {
        part('wood',seat,.47,-.178+i*.119,2.02,.046,.103,timber[(seats+i)%timber.length]);
      }
      for (let i=0; i<2; i++) {
        part('wood',seat,.705+i*.14,-.234-i*.023,2.02,.115,.04,timber[(seats+i+2)%timber.length],-.15);
      }
      // Steel litter basket with separate rolled rims, spaced slats and a
      // recessed dark inner pail, so the opening stays legible from above.
      const bin = 1.16;
      part('metal',bin,.18,0,.065,.31,.065,paint);
      part('metal',bin,.09,0,.25,.03,.25,paint);
      part('liner',bin,.522,0,1,1,1,0x353d3a);
      part('metal',bin,.34,0,.24,.026,.24,0x313632);
      for (const h of [.34,.72]) part('ring',bin,h,0,1,1,1,paint);
      for (let i=0; i<12; i++) {
        const angle = i*Math.PI/6;
        part('metal',bin+.181*Math.sin(angle),.53,.181*Math.cos(angle),.052,.36,.018,paint,0,angle);
      }
      seats++;
    } else {
      const paint = railPaint[gardens++ % railPaint.length];
      // Three low welded panels. The occasional small gaps between separate
      // runs leave the front gardens open to pedestrians.
      for (const x of [-3.15,-1.05,1.05,3.15]) part('metal',x,.28,0,.049,.56,.049,paint);
      for (const y of [.14,.46]) part('metal',0,y,0,6.32,.031,.032,paint);
      for (const x of [-2.10,0,2.10]) {
        for (const side of [-1,1]) {
          part('metal',x+side*.52,.30,0,.024,1.09,.023,paint,0,0,side*1.28);
        }
      }
    }
  }
  for (const [name, {geometry,material,parts}] of Object.entries(batches)) {
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = 'courtyard-furniture-' + name;
    parts.forEach(({matrix,color},i) => {
      mesh.setMatrixAt(i,matrix);
      mesh.setColorAt(i,new THREE.Color(color));
    });
    scene.add(mesh);
  }
}
