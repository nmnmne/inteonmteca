import * as THREE from './vendor/three.module.js';
import { distanceToSegment } from './navigation.js';

function seeded(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
}

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
  const random = seeded(14026);
  ctx.fillStyle = '#71824e';
  ctx.fillRect(0,0,512,512);
  // The dense short sward stays visible between clumps, even from across the yard.
  for (let i=0;i<220;i++) {
    const x=random()*512, y=random()*512, r=12+random()*48;
    const color = ['103,130,69', '84,112,62', '150,144,95', '129,148,79'][i % 4];
    for (const ox of [-512,0,512]) for (const oy of [-512,0,512]) {
      const g=ctx.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r);
      g.addColorStop(0,`rgba(${color},.3)`); g.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=g; ctx.fillRect(x+ox-r,y+oy-r,r*2,r*2);
    }
  }
  const colors=['#8b9b60','#6a844e','#a4a773','#799659','#627746'];
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

function tuftTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const greens = ['#91ae69', '#7f9f5c', '#91ad67', '#99b270', '#829f62', '#a5b57b'];
  // Different silhouettes on the two intersecting cards; narrow, curved blades.
  for (let i = 0; i < 208; i++) {
    const offset = i % 2 * 128;
    const spread = random() * 2 - 1;
    const root = offset + 64 + spread * 39;
    const tip = root + 14 * spread + (random() - .5) * 18;
    const top = 5 + 31 * Math.abs(spread) + random() * 46;
    const midX = root + (tip - root) * .27;
    const midY = top + (96 - top) * .50;
    const width = 1.35 + random() * 1.28;
    const blade = ctx.createLinearGradient(0, 96, 0, top);
    blade.addColorStop(0, '#526b40');
    blade.addColorStop(0.55, greens[i % greens.length]);
    blade.addColorStop(1, i % 8 ? '#acbf7e' : '#bdba86');
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(root - width / 2, 96);
    ctx.quadraticCurveTo(midX - width * .4, midY, tip, top);
    ctx.quadraticCurveTo(midX + width * .4, midY, root + width / 2, 96);
    ctx.fill();
  }
  // Keep an olive colour underneath transparent texels. Mipmaps then narrow
  // distant blades without introducing a dark outline around each tuft.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] !== 0) continue;
    pixels[i] = 127;
    pixels[i + 1] = 150;
    pixels[i + 2] = 93;
  }
  const map = new THREE.DataTexture(new Uint8Array(pixels.buffer), canvas.width, canvas.height);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = true;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

function addLawnTufts(scene, lawns, patches) {
  const random = seeded(83051);
  const grassWind = scene.userData.grassWind = { value: 0 };
  const material = new THREE.MeshLambertMaterial({
    map: tuftTexture(random), alphaTest: 0.29, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.grassWind = grassWind;
    shader.vertexShader = 'uniform float grassWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec2 root = instanceMatrix[3].xz;
      float breeze = sin(dot(root, vec2(.16, .23)) + grassWind * 1.24);
      transformed.x += uv.y * (.019 * breeze + .006 * sin(root.x * .69 + grassWind * 2.1));`);
    // Lighting follows the upward-facing crown on either side of the tuft.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal *= faceDirection;');
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.30,0,0, .30,0,0, .30,.20,0, -.30,.20,0,
    0,0,-.30, 0,0,.30, 0,.20,.30, 0,.20,-.30,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,.5,0,.5,1,0,1,.5,0,1,0,1,1,.5,1], 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({length: 8}, () => [0,1,0]).flat(), 3));
  geometry.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);

  const density = matchMedia('(pointer: coarse), (max-width: 800px)').matches ? 1.2 : 2.1;
  const transform = new THREE.Object3D();
  const triangle = new THREE.Triangle();
  const tint = new THREE.Color();
  lawns.forEach((lawn, index) => {
    const ground = lawn.geometry;
    const position = ground.getAttribute('position');
    const patch = patches[index];
    const edges = [patch.polygon, ...(patch.holes || [])].flatMap(ring =>
      ring.map((p, i) => [p, ring[(i + 1) % ring.length]]));
    const samples = [];
    for (let i = 0; i < ground.index.count; i += 3) {
      triangle.setFromAttributeAndIndices(position, ground.index.getX(i), ground.index.getX(i+1), ground.index.getX(i+2));
      const count = Math.floor(triangle.getArea() * density + random());
      for (let j = 0; j < count; j++) {
        const u = Math.sqrt(random()), v = random();
        const x = triangle.a.x * (1-u) + u * (triangle.b.x * (1-v) + triangle.c.x * v);
        const z = -(triangle.a.y * (1-u) + u * (triangle.b.y * (1-v) + triangle.c.y * v));
        const meadow = (Math.sin(x * .43 + Math.sin(z * .24)) + Math.cos(z * .37)) * .09;
        const size = .65 + random() * .55 + meadow;
        // The whole tuft, including its bent tip, stays behind the curb.
        const clearance = .34 * size + .10;
        if (edges.some(([[ax, az], [bx, bz]]) => distanceToSegment(x, z, ax, az, bx, bz) < clearance)) continue;
        samples.push([x, z, size]);
      }
    }
    if (!samples.length) return;
    const tufts = new THREE.InstancedMesh(geometry, material, samples.length);
    for (const [i, [x, z, size]] of samples.entries()) {
      transform.position.set(x, lawn.position.y - .045 * size, z);
      transform.rotation.y = random() * Math.PI;
      transform.scale.set(size, size * (.77 + .52 * random()), size);
      transform.updateMatrix();
      tufts.setMatrixAt(i, transform.matrix);
      const shade = .83 + random() * .17;
      tufts.setColorAt(i, tint.setRGB(shade, shade * (.94 + .06 * random()), shade * .92));
    }
    tufts.name = 'lawn-tufts-' + index;
    tufts.userData.bakedShadowCaster = false;
    scene.add(tufts);
  });
}

export function addLandscaping(scene, materials, data) {
  if (!data?.patches?.length) return;
  const lawn=lawnMaterial();
  const lawns = data.patches.map((patch,i) => {
    const mesh=surface(patch,lawn,.045);
    mesh.name=`lawn-${i}`;
    scene.add(mesh);
    return mesh;
  });
  addLawnTufts(scene, lawns, data.patches);
  const pathMaterial=materials.asphalt(1,1);
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
