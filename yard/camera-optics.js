import * as THREE from './vendor/three.module.js';

// The previous camera projection gives a shutter direction at the actual
// depth of each pixel. No image history is accumulated on camera cuts.
export function createCameraOptics(renderer) {
  const previous = new THREE.Matrix4(), current = new THREE.Matrix4();
  const lastEye=new THREE.Vector3(), lastRotation=new THREE.Quaternion();
  const size=new THREE.Vector2(), bufferSize=new THREE.Vector2();
  let target, primed=false;
  const uniforms={
    colorMap:{value:null}, depthMap:{value:null}, invViewProjection:{value:new THREE.Matrix4()},
    previousViewProjection:{value:previous}, resolution:{value:size}, eye:{value:new THREE.Vector3()},
    shutter:{value:0}, maxTrail:{value:0}, facetStrength:{value:0}, extraTap:{value:0},
  };
  const pass=new THREE.Scene(), screenCamera=new THREE.Camera();
  const shape=new THREE.BufferGeometry();
  shape.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const material=new THREE.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:`varying vec2 screenUV;
      void main(){screenUV=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`
      varying vec2 screenUV;
      uniform sampler2D colorMap,depthMap;
      uniform mat4 invViewProjection,previousViewProjection;
      uniform vec2 resolution;
      uniform vec3 eye;
      uniform float shutter,maxTrail,facetStrength,extraTap;
      float hash(vec2 p) {
        vec3 a=fract(p.xyx*vec3(.1031,.1030,.0973)); a+=dot(a,a.yzx+33.33); return fract((a.x+a.y)*a.z);
      }
      // Adjacent cells share the very same jittered vertices. Every corner
      // stays within one tenth of its original triangle's pitch.
      vec2 corner(vec2 p){return p+(vec2(hash(p),hash(p+17.6))-.5)*.20;}
      float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
      void main(){
        vec2 uv=screenUV;
        vec3 original=texture2D(colorMap,uv).rgb, color=original;
        float depth=texture2D(depthMap,uv).x;
        vec4 point=invViewProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
        vec3 world=point.xyz/point.w;
        vec3 dx=dFdx(world),dy=dFdy(world);
        float distanceM=distance(eye,world);
        float nearFace=(1.-smoothstep(.65,4.4,distanceM))*facetStrength;
        if(nearFace>.003 && depth<.99995) {
          vec3 normal=abs(cross(dx,dy));
          vec2 plane=normal.y>max(normal.x,normal.z) ? world.xz : (normal.z>normal.x ? world.xy : world.zy);
          vec2 ddx=normal.y>max(normal.x,normal.z) ? dx.xz : (normal.z>normal.x ? dx.xy : dx.zy);
          vec2 ddy=normal.y>max(normal.x,normal.z) ? dy.xz : (normal.z>normal.x ? dy.xy : dy.zy);
          // Slant the lattice on the local plane so cube faces acquire facets
          // as well as round objects. Its scale is measured in courtyard metres.
          mat2 lattice=mat2(5.5,1.2,-1.6,5.9);
          vec2 p=lattice*plane;
          vec2 cell=floor(p), a=corner(cell), b=corner(cell+vec2(1.,1.));
          bool upper=cross2(b-a,p-a)>0.;
          vec2 c=corner(cell+(upper ? vec2(0.,1.) : vec2(1.,0.)));
          vec2 delta=((a+b+c)/3.-p)*.10*nearFace;
          vec2 ds=lattice*ddx, dt=lattice*ddy;
          float area=cross2(ds,dt);
          vec2 offset=abs(area)>.000001 ? vec2(cross2(delta,dt),cross2(ds,delta))/area : vec2(0.);
          offset/=max(1.,length(offset)/4.);
          vec2 sampleUV=clamp(uv+offset/resolution,vec2(0.),vec2(1.));
          if(abs(texture2D(depthMap,sampleUV).x-depth)<.002) color=texture2D(colorMap,sampleUV).rgb;
          float grain=hash(cell+(upper ? vec2(53.,17.) : vec2(0.)))-.5;
          color*=1.+grain*.19*nearFace;
        }
        vec4 old=previousViewProjection*vec4(world,1.);
        vec2 trail=old.w>.0001 ? (old.xy/old.w*.5+.5-uv)*shutter*resolution : vec2(0.);
        float pixels=length(trail);
        if(pixels>.54) {
          trail*=min(1.,maxTrail/max(.01,pixels));
          vec3 total=color*2.; float weight=2.;
          for(int i=1;i<=4;i++){
            if(i>2 && extraTap<.5) break;
            vec2 shift=trail*(float(i)/(extraTap>.5 ? 4. : 2.))/resolution;
            vec2 tap=clamp(uv+shift,vec2(0.),vec2(1.));
            float difference=abs(texture2D(depthMap,tap).x-depth);
            float w=(1.-smoothstep(.0009,.008,difference))*(1.-float(i)*.11);
            total+=texture2D(colorMap,tap).rgb*w; weight+=w;
          }
          color=mix(color,total/weight,smoothstep(.54,1.6,pixels));
        }
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const plane=new THREE.Mesh(shape,material); plane.frustumCulled=false; pass.add(plane);
  function render(scene,camera,dt,level,still) {
    camera.updateMatrixWorld();
    current.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    renderer.getDrawingBufferSize(bufferSize);
    const travel=camera.position.distanceTo(lastEye), angle=camera.quaternion.angleTo(lastRotation);
    const continuous=primed && dt>0 && dt<.12 && travel<2.5 && angle<.38;
    const moving=continuous && (travel>.001 || angle>.00015);
    // At rest the physical scene can render directly into the canvas. A tiny
    // mobile framebuffer further bounds the cost under sustained frame pressure.
    if (still || !moving) renderer.render(scene,camera);
    else {
      if (!target) {
        target=new THREE.WebGLRenderTarget(bufferSize.x,bufferSize.y,{colorSpace:THREE.SRGBColorSpace,depthBuffer:true});
        target.depthTexture=new THREE.DepthTexture(bufferSize.x,bufferSize.y,THREE.UnsignedIntType);
        uniforms.colorMap.value=target.texture; uniforms.depthMap.value=target.depthTexture;
      }
      if (!size.equals(bufferSize)) { size.copy(bufferSize); target.setSize(size.x,size.y); }
      uniforms.invViewProjection.value.copy(current).invert();
      uniforms.eye.value.copy(camera.position);
      uniforms.shutter.value=Math.min(.65, .014/Math.max(.01,dt));
      uniforms.maxTrail.value=level<4 ? 4 : 9;
      uniforms.facetStrength.value=1-.80*(scene.userData.houseInterior || 0);
      uniforms.extraTap.value=level>=5 ? 1 : 0;
      renderer.setRenderTarget(target); renderer.render(scene,camera);
      renderer.setRenderTarget(null); renderer.render(pass,screenCamera);
    }
    previous.copy(current); lastEye.copy(camera.position); lastRotation.copy(camera.quaternion); primed=true;
  }
  return {render,reset(){primed=false;},dispose(){target?.dispose(); material.dispose(); shape.dispose();}};
}
