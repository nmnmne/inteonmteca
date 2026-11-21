import * as THREE from './vendor/three.module.js';
import {facadeSpec, openingsForFacade} from './models.js';
import {facadeNormal} from './facade-frame.js';

// One low-detail copy of the surveyed block is shared by all eight neighbours.
// The central courtyard keeps the interactive furniture and full facade meshes.
export function addNeighbourCourtyards(scene, layout, ground) {
  const xs = layout.walkable.map(p => p[0]), zs = layout.walkable.map(p => p[1]);
  const west = Math.min(...xs), north = Math.min(...zs);
  const east = Math.max(...xs), south = Math.max(...zs);
  const position = [], normal = [], colors = [], lamps = [], indices = [];
  const color = new THREE.Color(), point = new THREE.Vector3(), direction = new THREE.Vector3();
  const normals = new THREE.Matrix3();

  function vertex(x,y,z,nx,ny,nz,lit=0) {
    position.push(x,y,z); normal.push(nx,ny,nz); colors.push(color.r,color.g,color.b); lamps.push(lit);
  }
  function copySurface(mesh, tint) {
    color.set(tint);
    mesh.updateWorldMatrix(true,false);
    normals.getNormalMatrix(mesh.matrixWorld);
    const geometry = mesh.geometry, offset = position.length / 3;
    for (let i=0; i<geometry.attributes.position.count; i++) {
      point.fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
      direction.fromBufferAttribute(geometry.attributes.normal,i).applyNormalMatrix(normals);
      vertex(point.x,point.y,point.z,direction.x,direction.y,direction.z);
    }
    const count = geometry.index?.count ?? geometry.attributes.position.count;
    for (let i=0; i<count; i++) indices.push(offset + (geometry.index ? geometry.index.getX(i) : i));
  }

  copySurface(ground,0x535453);
  for (const mesh of scene.children) {
    if (/^road-/.test(mesh.name)) copySurface(mesh,0x444749);
    else if (/^lawn-\d+$/.test(mesh.name)) copySurface(mesh,0x61704f);
    else if (/^lawn-entrance-path-/.test(mesh.name)) copySurface(mesh,0x898680);
    else if (/^roof-/.test(mesh.name) && mesh.isMesh) copySurface(mesh,mesh.name.startsWith('roof-parapet-') ? 0x99938a : 0x62605c);
  }

  for (const building of [...layout.buildings, ...(layout.utilityStructures || []).filter(s => s.role === 'electric-kiosk')]) {
    const ring = building.footprint, facade = facadeSpec(building.facadeMaterialId);
    ring.forEach((a, i) => {
      const b=ring[(i+1)%ring.length], span=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if (span < .02) return;
      const tx=(b[0]-a[0])/span, tz=(b[1]-a[1])/span;
      const [nx,nz]=facadeNormal(a,b,ring);
      function panel(along,y,w,h,offset,lit=0) {
        const base=position.length/3, x=a[0]+along*tx+nx*offset, z=a[1]+along*tz+nz*offset;
        vertex(x,y,z,nx,0,nz,lit); vertex(x+w*tx,y,z+w*tz,nx,0,nz,lit);
        vertex(x+w*tx,y+h,z+w*tz,nx,0,nz,lit); vertex(x,y+h,z,nx,0,nz,lit);
        if (-tz*nx + tx*nz > 0) indices.push(base,base+1,base+2, base,base+2,base+3);
        else indices.push(base,base+2,base+1, base,base+3,base+2);
      }
      color.set(facade.baseColor);
      panel(0,0,span,building.heightM,0);
      if (!building.floors || span < 3) return;
      const openings=openingsForFacade(building,span,i);
      color.set(0x52616b);
      for (const [j,w] of openings.windows.entries()) {
        const light = (j*23+i*3)%19 < 5 ? .65+(j%5)*.075 : 0;
        panel(w.along-w.width/2,w.y-w.height/2,w.width,w.height,.055,light);
      }
      color.set(facade.accentColor || 0xa79e8e);
      for (const rail of openings.balconies) panel(rail.along-rail.width/2,rail.y,rail.width,rail.railHeight,rail.depth*.8);
    });
  }

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.23,.36,3.5,5));
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1,0));
  for (const tree of (layout.circles || []).filter(c => c.id.startsWith('tree-'))) {
    trunk.position.set(tree.x,1.75,tree.z); copySurface(trunk,0x635446);
    crown.position.set(tree.x,4.45,tree.z); crown.scale.set(2.12,1.8,1.95);
    crown.rotation.y=tree.x; copySurface(crown,0x65704c);
  }
  trunk.geometry.dispose(); trunk.material.dispose(); crown.geometry.dispose(); crown.material.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('windowLamp',new THREE.Float32BufferAttribute(lamps,1));
  geometry.setIndex(indices);
  const material = new THREE.MeshLambertMaterial({vertexColors:true});
  material.onBeforeCompile = shader => {
    shader.uniforms.neighbourNight=scene.userData.windowNight || {value:0};
    shader.uniforms.tileBounds={value:new THREE.Vector4(west,north,east,south)};
    shader.vertexShader='attribute float windowLamp; varying float lamp; varying vec2 tilePoint;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nlamp=windowLamp; tilePoint=position.xz;');
    shader.fragmentShader='uniform float neighbourNight; uniform vec4 tileBounds; varying float lamp; varying vec2 tilePoint;\n'+shader.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
        if (any(lessThan(tilePoint,tileBounds.xy)) || any(greaterThan(tilePoint,tileBounds.zw))) discard;`)
      .replace('#include <opaque_fragment>',`outgoingLight += lamp*neighbourNight*vec3(.81,.53,.27);
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>',`#ifdef USE_FOG
          float haze = smoothstep(fogNear, max(fogFar,390.), vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, haze);
        #endif`);
  };
  material.customProgramCacheKey=()=>'neighbour-courtyards';
  const mesh = new THREE.InstancedMesh(geometry,material,8);
  geometry.computeBoundingBox();
  // The shader clips at the surveyed block boundary, including any roofs
  // extending past the seam. Use that same boundary for each tile's bounds.
  const tileBox = new THREE.Box3(new THREE.Vector3(west,geometry.boundingBox.min.y,north),
    new THREE.Vector3(east,geometry.boundingBox.max.y,south));
  const tiles=[];
  for (let z=-1; z<=1; z++) for (let x=-1; x<=1; x++) {
    if (!x && !z) continue;
    const offset=new THREE.Vector3(x*(east-west),0,z*(south-north));
    const matrix=new THREE.Matrix4().makeTranslation(offset.x,0,offset.z);
    mesh.setMatrixAt(tiles.length,matrix);
    tiles.push({matrix,box:tileBox.clone().translate(offset)});
  }
  mesh.computeBoundingSphere(); // Keep the raycast broad phase valid as the submitted subset changes.
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false; // The eight tighter boxes replace one large sphere.
  const frustum=new THREE.Frustum(), projection=new THREE.Matrix4();
  let lastMask=(1<<tiles.length)-1;
  function visibleTiles(view) {
    projection.multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse).multiply(mesh.matrixWorld);
    frustum.setFromProjectionMatrix(projection);
    let mask=0;
    for (let i=0;i<tiles.length;i++) if (frustum.intersectsBox(tiles[i].box)) mask|=1<<i;
    return mask;
  }
  const previous=Object.hasOwn(scene,'onBeforeRender') ? scene.onBeforeRender : null;
  scene.onBeforeRender=function(renderer,renderScene,camera,target) {
    (previous || THREE.Scene.prototype.onBeforeRender).call(this,renderer,renderScene,camera,target);
    if (!mesh.visible) return;
    let mask=0;
    if (camera.isArrayCamera && camera.cameras.length) {
      for (const eye of camera.cameras) mask |= visibleTiles(eye);
    } else {
      mask = visibleTiles(camera);
    }
    if (mask===lastMask) return;
    lastMask=mask;
    mesh.count=0;
    for (let i=0;i<tiles.length;i++) if (mask&(1<<i)) mesh.setMatrixAt(mesh.count++,tiles[i].matrix);
    mesh.instanceMatrix.needsUpdate=true;
  };
  mesh.name='neighbour-courtyards';
  mesh.userData.bakedShadowCaster=false; mesh.userData.bakedShadowReceiver=false;
  scene.add(mesh);
  return mesh;
}
