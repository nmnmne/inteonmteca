import * as THREE from './vendor/three.module.js';

// A rock pigeon is about 33 cm from bill to tail. Feet are the local origin.
function pigeonGeometry() {
  const positions = [], normals = [], colors = [], joints = [], indices = [];
  const palette = new Map();
  function vertex(p, n, hex, head = 0, neck = 0) {
    if (!palette.has(hex)) palette.set(hex, new THREE.Color(hex).toArray());
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
    colors.push(...palette.get(hex));
    joints.push(head, neck);
    return joints.length / 2 - 1;
  }

  // Rings have independent colours on each side of a seam and share smooth
  // normals across it. This keeps the two black bars crisp on a curved wing.
  function loft(rows, sides, point, shade, head = () => 0, neck = () => 0, capEnd = false) {
    const grid = rows.map(row => Array.from({length:sides}, (_, j) => point(row, j*2*Math.PI/sides)));
    const surfaceNormals = grid.map((ring, i) => ring.map((p, j) => {
      const tangent = ring[(j+1)%sides].clone().sub(ring[(j+sides-1)%sides]);
      const along = grid[Math.min(i+1,rows.length-1)][j].clone().sub(grid[Math.max(i-1,0)][j]);
      return tangent.cross(along).normalize();
    }));
    for (let i=0; i<rows.length-1; i++) {
      const start = joints.length/2;
      for (let j=0; j<sides; j++) {
        const sine=Math.sin(j*2*Math.PI/sides);
        for (const k of [i,i+1]) vertex(grid[k][j],surfaceNormals[k][j],shade(i,j,sine,k),head(k),neck(k));
      }
      for (let j=0; j<sides; j++) {
        const a=start+j*2, b=start+((j+1)%sides)*2;
        indices.push(a,b,b+1,a,b+1,a+1);
      }
    }
    if (capEnd) {
      const end=grid[grid.length-1], n=new THREE.Vector3(0,0,1);
      const start=joints.length/2;
      for (const p of end) vertex(p,n,shade(rows.length-2,0,0));
      for (let j=1; j<sides-1; j++) indices.push(start,start+j,start+j+1);
    }
  }
  function alongBack([z,y,rx,ry,x=0,skew=0], a) {
    return new THREE.Vector3(x+rx*Math.cos(a),y+ry*Math.sin(a),z+skew*Math.sin(a));
  }
  function upNeck([y,z,rx,rz], a) {
    return new THREE.Vector3(rx*Math.cos(a),y,z-rz*Math.sin(a));
  }
  loft([[-.098,.115,.003,.006],[-.081,.104,.041,.054],[-.047,.097,.061,.069],
    [.007,.092,.067,.064],[.067,.087,.054,.043],[.117,.077,.025,.021],[.13,.075,.003,.003]],
    10, alongBack, (i,j,top) => top>.4 ? 0x879399 : top<-.4 ? 0x99a3a8 : 0x909ca5);

  // The neck grows out of the breast. Its low rings stay still as the head
  // turns. Only these plumage rings take the green-to-violet sheen.
  loft([[.108,-.050,.044,.045],[.135,-.057,.048,.047],[.156,-.064,.037,.037],
    [.179,-.074,.029,.029],[.194,-.076,.031,.032],[.211,-.075,.028,.028],
    [.221,-.074,.017,.019],[.224,-.073,.002,.002]], 12, upNeck,
    (i,j,front,k) => [0x909ca5,0x838a95,front>.1 ? 0x5c7770 : 0x735f73,
      0x5b6873,0x667681,0x68747f,0x737e86,0x79838b][k],
    i => [0,.16,.53,.92,1,1,1,1][i], i => i>0 && i<4 ? 1 : 0);

  // Short bill, with the pale cere characteristic of adult rock pigeons.
  loft([[-.135,.186,.0007,.001],[-.126,.190,.005,.004],[-.115,.193,.009,.006],
    [-.104,.195,.011,.009],[-.096,.193,.009,.008]], 7, alongBack,
    (i,j,top) => i>=2 && top>.0 ? 0xc3c2b8 : 0x383e47, () => 1);
  for (const side of [-1,1]) {
    const center = new THREE.Vector3(side*.0284,.201,-.089);
    const normal = new THREE.Vector3(side*.95,.08,-.30).normalize();
    const up = new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
    const tangent = up.clone().cross(normal);
    const pupil = vertex(center.clone().addScaledVector(normal,.0012),normal,0x171c20,1);
    const start = joints.length/2;
    for (let j=0; j<8; j++) {
      const angle=j*Math.PI/4;
      const radial=tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle));
      vertex(center.clone().addScaledVector(radial,.0022).addScaledVector(normal,.001),normal,0x191a1d,1);
      vertex(center.clone().addScaledVector(radial,.0049),normal,0xd49046,1);
    }
    for (let j=0; j<8; j++) {
      const a=start+2*j, b=start+2*((j+1)%8);
      indices.push(pupil,a,b,a,a+1,b+1,a,b+1,b);
    }
  }

  loft([[.074,.082,.028,.010],[.13,.069,.035,.009],[.163,.060,.038,.008],
    [.187,.054,.037,.006],[.198,.052,.031,.0025]], 8, alongBack,
    i => i===2 ? 0x343d49 : i===3 ? 0x58636b : 0x69747c, undefined, undefined, true);
  for (const side of [-1,1]) {
    loft([[-.058,.111,.003,.004,.040],[-.035,.110,.014,.024,.050],
      [-.006,.104,.018,.037,.054],[.017,.099,.019,.035,.055,-.012],
      [.027,.095,.018,.032,.054,-.012],[.052,.090,.014,.028,.051,-.014],
      [.065,.085,.013,.024,.049,-.014],[.100,.080,.011,.016,.041],
      [.144,.075,.008,.008,.030],[.168,.070,.002,.002,.022]], 8,
      ([z,y,rx,ry,cx,skew],a) => alongBack([z,y,rx,ry,cx*side,skew],a),
      (i,j,top) => i===3 || i===5 ? 0x3e4954 : i>6 ? 0x51606b : top<0 ? 0x949fa8 : 0xabafb0);
  }

  function toe(a,b,r1,r2) {
    const axis=b.clone().sub(a).normalize();
    const right=new THREE.Vector3(1,0,0).cross(axis).normalize();
    const up=axis.clone().cross(right);
    loft([[a,r1],[b,r2]],5,([center,r],angle) => center.clone()
      .addScaledVector(right,r*Math.cos(angle)).addScaledVector(up,r*Math.sin(angle)), () => 0xad756e);
  }
  for (const side of [-1,1]) {
    const ankle = new THREE.Vector3(side*.023,.005,.007);
    toe(new THREE.Vector3(side*.025,.047,.003),ankle,.005,.0032);
    for (const spread of [-1,0,1]) {
      toe(ankle,new THREE.Vector3(ankle.x+spread*.014,.0016,-.021+.006*Math.abs(spread)),.0033,.0011);
    }
    toe(ankle,new THREE.Vector3(ankle.x+side*.004,.0016,.022),.003,.0011);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('pigeonJoint',new THREE.Float32BufferAttribute(joints,2));
  geometry.setIndex(indices);
  return geometry;
}

export function createRoofPigeons(perches = []) {
  const group = new THREE.Group();
  group.name = 'roof-pigeons';
  const geometry = pigeonGeometry();
  const pose = new THREE.InstancedBufferAttribute(new Float32Array(perches.length*4),4);
  pose.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('pigeonPose',pose);
  const material = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.86});
  material.onBeforeCompile = shader => {
    const turn = `vec3 pigeonTurn(vec3 v) {
      v.yz = vec2(pigeonPose.z*v.y - pigeonPose.w*v.z, pigeonPose.w*v.y + pigeonPose.z*v.z);
      v.xz = vec2(pigeonPose.x*v.x - pigeonPose.y*v.z, pigeonPose.y*v.x + pigeonPose.x*v.z);
      return v;
    }`;
    shader.vertexShader = 'attribute vec4 pigeonPose; attribute vec2 pigeonJoint; varying float pigeonNeck;\n'+turn+'\n'+shader.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        objectNormal = mix(objectNormal,pigeonTurn(objectNormal),pigeonJoint.x);`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 hinge = vec3(0.,.132,-.057);
        transformed = mix(transformed,hinge+pigeonTurn(transformed-hinge),pigeonJoint.x);
        pigeonNeck = pigeonJoint.y;`);
    shader.fragmentShader = 'varying float pigeonNeck;\n'+shader.fragmentShader.replace('#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       float neckAngle = clamp(dot(normal,normalize(vViewPosition)),0.,1.);
       diffuseColor.rgb *= mix(vec3(1.),mix(vec3(1.32,.86,1.26),vec3(.86,1.21,1.03),neckAngle),pigeonNeck);`);
  };
  material.customProgramCacheKey = () => 'roosting-pigeon';
  const flock = new THREE.InstancedMesh(geometry,material,perches.length);
  flock.name='perched-rock-pigeons';
  flock.userData.bakedShadowCaster=false;
  flock.userData.digitalBuilding=true;
  flock.receiveShadow=true;
  group.add(flock);
  const transform=new THREE.Object3D(), matrices=[], tints=[], visible=[];
  flock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const [i,p] of perches.entries()) {
    transform.position.set(p.x,p.y,p.z);
    transform.rotation.y=p.heading ?? 0;
    transform.scale.setScalar(.94 + (i*13%9)*.016);
    transform.updateMatrix();
    matrices.push(transform.matrix.clone());
    flock.setMatrixAt(i,matrices[i]);
    const tone=.92+(i*7%8)*.018;
    tints.push(new THREE.Color().setRGB(tone,tone,tone));
    flock.setColorAt(i,tints[i]);
    visible.push(i);
  }
  flock.instanceColor?.setUsage(THREE.DynamicDrawUsage);
  flock.computeBoundingSphere();

  let elapsed=0;
  function setHeadPoses() {
    for (let slot=0; slot<flock.count; slot++) {
      const i=visible[slot];
      const t=elapsed*(.73+i%5*.091)+i*4.73;
      // Long looks between short turns; an occasional peck comes in a pair.
      const yaw=.55*Math.tanh(2.8*Math.sin(t*.65))+.06*Math.sin(t*1.39);
      const beat=t%12.7;
      const dip=Math.max(0,1-Math.abs(beat-1.2)/.34)+.76*Math.max(0,1-Math.abs(beat-2.0)/.34);
      const pitch=.043*Math.sin(t*1.58)-.61*dip*dip;
      pose.setXYZW(slot,Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch));
    }
    pose.needsUpdate=true;
  }
  setHeadPoses();
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  const bird = new THREE.Sphere(new THREE.Vector3(),.24), observer = new THREE.Vector3();
  function getCameraView(camera) {
    camera.updateWorldMatrix(true,false);
    observer.setFromMatrixPosition(camera.matrixWorld);
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  }
  function hasVisibleRoost(camera) {
    if (!camera || !group.visible || !flock.visible || !perches.length) return false;
    getCameraView(camera);
    return perches.some(p => {
      bird.center.set(p.x,p.y+.11,p.z);
      return observer.distanceToSquared(bird.center) < 48*48 && frustum.intersectsSphere(bird);
    });
  }
  function update(dt,camera) {
    if (!group.visible || !flock.visible) return;
    let count=0, changed=false;
    if (camera) getCameraView(camera);
    // Compact visible roosts into one draw. Looking down at the courtyard
    // submits zero pigeons; a close view only submits wings actually in shot.
    for (let i=0; i<perches.length; i++) {
      const p=perches[i];
      bird.center.set(p.x,p.y+.11,p.z);
      if (camera && !frustum.intersectsSphere(bird)) continue;
      if (visible[count]!==i) changed=true;
      visible[count++]=i;
    }
    if (count!==flock.count) changed=true;
    flock.count=count;
    if (changed && count) {
      for (let slot=0; slot<count; slot++) {
        flock.setMatrixAt(slot,matrices[visible[slot]]);
        flock.setColorAt(slot,tints[visible[slot]]);
      }
      flock.instanceMatrix.needsUpdate=flock.instanceColor.needsUpdate=true;
    }
    if (dt>0) elapsed+=dt;
    if (count && (changed || dt>0)) setHeadPoses();
  }
  function dispose() {
    group.removeFromParent();
    flock.dispose();
    geometry.dispose();
    if (flock.material !== material) flock.material.dispose();
    material.dispose();
  }
  return {group, update, hasVisibleRoost, dispose};
}
