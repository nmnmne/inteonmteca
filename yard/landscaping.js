import * as THREE from './vendor/three.module.js';
import { distanceToSegment } from './navigation.js';

function seeded(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
}

// A leafy spray has folded blades with a raised midrib. Its gaps are real
// geometry, so the same silhouette is visible from the path and from the air.
function leafSpray() {
  const points = [], colors = [], indices = [], outline = [];
  const shades = [[.32,.45,.14],[.40,.52,.20],[.28,.40,.12],[.44,.54,.22]];
  for (let i=0;i<14;i++) {
    const t = i / 14, side = i % 2 ? 1 : -1;
    const x = t * .56, y = .12 * Math.sin(t * Math.PI) + (i%3) * .013;
    const size = .115 + .055*Math.sin((i+1)*2.2);
    const shade = shades[i%shades.length];
    const start = points.length / 3;
    points.push(x,y,0, x+.013,y+.025,side*size*.57, x+.045,y+.047,side*size*.51,
      x+.093,y+.017,side*size*.56, x+.11,y-.008,side*size);
    for(let k=0;k<5;k++) colors.push(...shade);
    for(const tri of [[0,1,2],[0,2,3],[1,4,2],[2,4,3]]) {
      const winding = side > 0 ? tri : [tri[0],tri[2],tri[1]];
      indices.push(...winding.map(v=>start+v));
    }
    for (const index of side > 0 ? [0,1,4,0,4,3] : [0,4,1,0,3,4]) outline.push(start+index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The far mesh keeps the complete perimeter and the original vertex normals.
  geometry.setIndex([...indices, ...outline]);
  geometry.setDrawRange(0, indices.length);
  return geometry;
}

export function addCourtyardTrees(scene, materials, circles) {
  if (!circles?.length) return;
  const random = seeded(14046), branches = [], foliage = [], up = new THREE.Vector3(0,1,0);
  const crowns = [], perches = [];
  const dummy = new THREE.Object3D();
  const branch = (a,b,radius) => {
    const direction = b.clone().sub(a);
    dummy.position.copy(a).lerp(b,.5);
    dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());
    dummy.scale.set(radius,direction.length(),radius);
    dummy.updateMatrix();
    branches.push(dummy.matrix.clone());
  };
  for (const tree of circles) {
    const height = 4.6 + random() * 1.4;
    const root = new THREE.Vector3();
    const fork = root.clone().add(new THREE.Vector3(.12, height*.44, -.04));
    const crown = fork.clone().add(new THREE.Vector3(-.19, height*.49, .15));
    branch(root,fork,tree.radius);
    branch(fork,crown,tree.radius*.53);
    const phase = random()*Math.PI*2;
    for (let i=0;i<16;i++) {
      const level=i/16, angle = phase + i * 2.4;
      const radius = (1.1 + .8 * Math.sin(Math.PI*(.18+level*.82))) * (.84 + random()*.24);
      const base = fork.clone().lerp(crown,level);
      const tip = base.clone().add(new THREE.Vector3(Math.cos(angle)*radius,.48+random()*.37,Math.sin(angle)*radius));
      branch(base,tip, .069-.034*level);
      if (i < 7 && i % 2 === 0) {
        const local = base.clone().lerp(tip,.83);
        local.y += .069-.034*level;
        perches.push({treeId:tree.id, local, x:tree.x+local.x, y:local.y, z:tree.z+local.z});
      }
      for (let j=0;j<5;j++) {
        const origin=base.clone().lerp(tip,.30+.15*j);
        const twigAngle=angle+(j%2 ? .95 : -.95);
        const reach=.42+random()*.32;
        const end=origin.clone().add(new THREE.Vector3(Math.cos(twigAngle)*reach,.17+random()*.21,Math.sin(twigAngle)*reach));
        branch(origin,end,.018);
        for (let k=0;k<4;k++) {
          dummy.position.copy(origin).lerp(end,.19+.23*k);
          dummy.rotation.set((random()-.5)*.55,-twigAngle+(k%2?.8:-.8),(random()-.25)*.68);
          dummy.scale.setScalar(.86+random()*.49);
          dummy.updateMatrix();
          foliage.push(dummy.matrix.clone());
        }
      }
    }
  }
  const branchGeometry=new THREE.CylinderGeometry(.7,1,1,7), bark=materials.bark();
  const leafMaterial=new THREE.MeshLambertMaterial({
    vertexColors:true, side:THREE.DoubleSide,
  });
  const tint=new THREE.Color();
  // Give each crown its own frustum bounds. Two distant trees used to form
  // one large sphere which intersected the camera even with both behind it.
  const perTree = foliage.length / circles.length;
  const limbsPerTree = branches.length / circles.length;
  circles.forEach(({id,x,z}, treeIndex) => {
    const pivot = new THREE.Group();
    pivot.name = id;
    pivot.position.set(x,0,z);
    const wood = new THREE.InstancedMesh(branchGeometry, bark, limbsPerTree);
    for (let i=0; i<limbsPerTree; i++) {
      wood.setMatrixAt(i,branches[treeIndex*limbsPerTree+i]);
      wood.setColorAt(i,tint.setHex(i < 2 ? 0xffffff : i % 6 === 2 ? 0xb9aa91 : 0x6a6252));
    }
    wood.name = 'courtyard-tree-branches-' + treeIndex;
    const geometry = leafSpray();
    const leaves = new THREE.InstancedMesh(geometry, leafMaterial, perTree);
    for (let i=0; i<perTree; i++) {
      leaves.setMatrixAt(i, foliage[treeIndex*perTree+i]);
      leaves.setColorAt(i,tint.setRGB(.71+random()*.24,.72+random()*.21,.54+random()*.27));
    }
    leaves.name = 'courtyard-tree-foliage-' + treeIndex;
    pivot.add(wood,leaves);
    scene.add(pivot);
    crowns.push({id,x,z,pivot,geometry, full:geometry.drawRange.count,
      seats:perches.filter(p => p.treeId === id), bend:0, velocity:0, axis:new THREE.Vector3()});
  });
  const point = new THREE.Vector3();
  scene.userData.crowTrees = {
    perches,
    rock(perch, impulse) {
      const crown = crowns.find(c => c.id === perch.treeId);
      crown.axis.set(perch.local.z,0,-perch.local.x).normalize();
      crown.velocity = Math.min(1.35,crown.velocity + impulse);
    },
    update(dt) {
      for (const c of crowns) {
        if (!c.bend && !c.velocity) continue;
        c.velocity += (-42*c.bend - 2.6*c.velocity)*dt;
        c.bend += c.velocity*dt;
        if (Math.abs(c.bend)<.0004 && Math.abs(c.velocity)<.002) c.bend=c.velocity=0;
        c.pivot.quaternion.setFromAxisAngle(c.axis,c.bend);
        for (const perch of c.seats) {
          point.copy(perch.local).applyQuaternion(c.pivot.quaternion);
          perch.x = c.x + point.x; perch.y = point.y; perch.z = c.z + point.z;
        }
      }
    },
  };
  scene.userData.updateTreeDetail = (position, level) => {
    for (const {x,z,geometry,full} of crowns) {
      const distance = Math.hypot(position.x-x, position.y-4, position.z-z);
      const threshold = 9+level*1.8 + (geometry.drawRange.start === 0 ? 2 : 0);
      if (distance > threshold) geometry.setDrawRange(full, geometry.index.count-full);
      else geometry.setDrawRange(0, full);
    }
  };
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
  const cellSize = 16, cells = new Map();
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
    for (const [x,z,size] of samples) {
      const col = Math.floor(x/cellSize), row = Math.floor(z/cellSize);
      const key = col + ',' + row;
      if (!cells.has(key)) cells.set(key,{x:(col+.5)*cellSize, z:(row+.5)*cellSize, samples:[]});
      const rotation = random() * Math.PI, height = size * (.77 + .52 * random());
      const shade = .83 + random() * .17;
      const y = lawn.position.y - .045 * size, green = shade * (.94 + .06 * random());
      cells.get(key).samples.push([x,y,z,size,rotation,height,shade,green]);
    }
  });

  const group = new THREE.Group();
  group.name = 'lawn-tufts';
  const patchesByDistance = [], shuffle = seeded(51839);
  for (const [key, cell] of cells) {
    const samples = cell.samples;
    const tufts = new THREE.InstancedMesh(geometry, material, samples.length);
    // Distribute every prefix across the cell, regardless of triangulation order.
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i+1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }
    samples.forEach(([x,y,z,size,rotation,height,shade,green], i) => {
      transform.position.set(x,y,z);
      transform.rotation.y = rotation;
      transform.scale.set(size,height,size);
      transform.updateMatrix();
      tufts.setMatrixAt(i, transform.matrix);
      tufts.setColorAt(i, tint.setRGB(shade,green,shade*.92));
    });
    tufts.name = 'lawn-tufts-' + key;
    tufts.userData.bakedShadowCaster = false;
    tufts.computeBoundingSphere(); // Always enclose the full-density cell.
    group.add(tufts);
    patchesByDistance.push({x:cell.x,z:cell.z,tufts});
  }
  cells.clear();
  scene.add(group);
  // The digital boundary owns group visibility. Distance changes only its children.
  const last = new THREE.Vector3(Infinity, Infinity, Infinity);
  let lastLevel;
  scene.userData.updateLandscapingDetail = (position, level = 5) => {
    if (lastLevel === level && last.distanceToSquared(position) < .25) return;
    last.copy(position);
    lastLevel = level;
    const near = 13 + level, far = 31 + level*3;
    for (const {x,z,tufts} of patchesByDistance) {
      const d = Math.hypot(x-position.x, position.y, z-position.z);
      const density = 1 - THREE.MathUtils.smoothstep(d, near, far);
      tufts.count = Math.round(tufts.instanceMatrix.count * density * density);
      tufts.visible = tufts.count > 0;
    }
    scene.userData.updateTreeDetail?.(position,level);
  };
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
  const pathMaterial=materials.asphalt();
  data.paths.forEach((path,i) => {
    const mesh=surface(path,path.material==='concrete' ? materials.concrete(1,1) : pathMaterial,.027);
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
