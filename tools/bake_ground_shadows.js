// Build-time only: turn real precomputed scene occlusion into an ordinary
// ground illumination texture. Runtime never compares ground depth or derivatives.
import * as THREE from '../yard/vendor/three.module.js';
export async function prepareGround(size = 2048) {
  const manifest = await (await fetch('../yard/data/shadows/manifest.json')).json();
  const renderer = new THREE.WebGLRenderer({antialias:false});
  renderer.setClearColor(0xffffff,1);
  const target = new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false});
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial());
  scene.add(quad);
  const pixels = new Uint8Array(size*size*4);
  const canvas = document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx = canvas.getContext('2d');
  return {resolution:size, async bake(index) {
    const e = manifest.presets[index];
    const texture = await new THREE.TextureLoader().loadAsync('../yard/data/shadows/'+e.file);
    texture.colorSpace=THREE.NoColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;
    const [sx,sy,sz]=e.sunVectorXYZ;
    const [minx,,minz]=manifest.bounds.min, [maxx,maxy,maxz]=manifest.bounds.max;
    const bounds=[Math.min(minx,minx-maxy*sx/sy)-8,Math.min(minz,minz-maxy*sz/sy)-8,Math.max(maxx,maxx-maxy*sx/sy)+8,Math.max(maxz,maxz-maxy*sz/sy)+8];
    const matrix = new THREE.Matrix4().fromArray(e.matrix);
    const normal = new THREE.Vector3(0,1,0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix));
    const material = new THREE.ShaderMaterial({uniforms:{depthMap:{value:texture},worldToLight:{value:matrix},bounds:{value:new THREE.Vector4(...bounds)},slope:{value:new THREE.Vector2(-normal.x/normal.z,-normal.y/normal.z)},texel:{value:1/manifest.resolution},bias:{value:.06/e.depthRange}},
      vertexShader:'varying vec2 vUV; void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`precision highp float; varying vec2 vUV; uniform sampler2D depthMap; uniform mat4 worldToLight; uniform vec4 bounds; uniform vec2 slope; uniform float texel; uniform float bias;
      void main(){
        vec2 world=mix(bounds.xy,bounds.zw,vUV);vec3 q=(worldToLight*vec4(world.x,.035,world.y,1.)).xyz;
        float lit=0.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 uv=q.xy+vec2(float(x),float(y))*texel;
          vec2 center=(floor(uv/texel)+.5)*texel;
          float d=dot(texture2D(depthMap,uv).rgb,vec3(65536.,256.,1.))*(255./16777215.);
          lit+=step(q.z+dot(slope,center-q.xy)-bias,d);
        }
        if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))lit=9.;
        gl_FragColor=vec4(vec3(lit/9.),1.);
      }`});
    quad.material.dispose();quad.material=material;
    renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
    const img=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)img.data.set(pixels.subarray(y*size*4,(y+1)*size*4),(size-1-y)*size*4);
    ctx.putImageData(img,0,0);texture.dispose();
    return {presetIndex:index,sunVectorXYZ:e.sunVectorXYZ,bounds,png:canvas.toDataURL('image/png').split(',')[1]};
  }};
}
