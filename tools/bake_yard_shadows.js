// OFFLINE ONLY. Invoked by bake_yard_shadows.py in a build-time browser.
import * as THREE from '../yard/vendor/three.module.js';
import { createYardScene } from '../yard/scene.js';
import { lightingPresetForLayout } from '../yard/baked-lighting.js';
import { isBakedReceiver } from '../yard/shadow-atlas.js';
export async function prepare(size = 4096) {
  const layout = await (await fetch('../yard/data/site-layout.json')).json();
  const {scene} = createYardScene(layout);
  scene.background = null; scene.fog = null;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let meshCount = 0, instances = 0;
  scene.traverse(o => {
    if (!o.isMesh) { if (o.isLineSegments) o.visible = false; return; }
    o.visible = isBakedReceiver(o) && o.userData.bakedShadowCaster !== false;
    if (!o.visible) return;
    bounds.union(new THREE.Box3().setFromObject(o)); meshCount++;
    instances += o.isInstancedMesh ? o.count : 1;
  });
  const renderer = new THREE.WebGLRenderer({antialias:false});
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0xffffff, 1);
  if (![1024, 4096].includes(size)) throw new Error("Unsupported bake resolution");
  const target = new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
  const depth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  depth.onBeforeCompile = shader => {
    shader.fragmentShader = `vec4 packOfflineDepth(float z) {
      float n = floor(clamp(z,0.0,1.0)*16777215.0+0.5);
      return vec4(floor(n/65536.0),mod(floor(n/256.0),256.0),mod(n,256.0),255.0)/255.0;
    }\n` + shader.fragmentShader.replace('packDepthToRGBA( fragCoordZ )', 'packOfflineDepth( fragCoordZ )');
  };
  scene.overrideMaterial = depth;
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length();
  const pixels = new Uint8Array(size*size*4);
  const canvas = document.createElement('canvas'); canvas.width=canvas.height=size;
  const context = canvas.getContext('2d');
  return { meshCount, instances, resolution:size, bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},
    bake(index) {
      const preset = lightingPresetForLayout(layout,index);
      const camera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,radius*3);
      camera.position.copy(center).addScaledVector(new THREE.Vector3(...preset.sunVectorXYZ),radius);
      camera.lookAt(center); camera.updateMatrixWorld(true);
      const lightBounds = new THREE.Box3();
      for (const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z]) lightBounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
      camera.left=lightBounds.min.x-2;camera.right=lightBounds.max.x+2;
      camera.bottom=lightBounds.min.y-2;camera.top=lightBounds.max.y+2;
      camera.near=-lightBounds.max.z-2;camera.far=-lightBounds.min.z+2;
      camera.updateProjectionMatrix();
      const matrix = new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      renderer.setRenderTarget(target); renderer.render(scene,camera);
      renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
      const image=context.createImageData(size,size);
      for(let row=0;row<size;row++) image.data.set(pixels.subarray(row*size*4,(row+1)*size*4),(size-1-row)*size*4);
      context.putImageData(image,0,0);
      return {presetIndex:index,localMoment:preset.localMoment,sunVectorXYZ:preset.sunVectorXYZ,
        matrix:matrix.toArray(),depthRange:camera.far-camera.near,
        metersPerTexel:[(camera.right-camera.left)/size,(camera.top-camera.bottom)/size],
        png:canvas.toDataURL('image/png').split(',')[1]};
    }
  };
}
