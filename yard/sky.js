import * as THREE from './vendor/three.module.js';

// Shade only the uncovered sky pixels, after opaque buildings and before clouds.
export function createCourtyardSky(scene) {
  const uniforms = {
    rayScale: {value:new THREE.Vector2()}, zenith:{value:new THREE.Color()},
    horizon:{value:new THREE.Color()}, sunDirection:{value:new THREE.Vector3()},
    sunset:{value:0}, physical:{value:1}, virtualSky:{value:scene.background},
  };
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0],3));
  const sky = new THREE.Mesh(triangle,new THREE.ShaderMaterial({
    uniforms, depthWrite:false, fog:false,
    vertexShader:`
      uniform vec2 rayScale; varying vec3 sight;
      void main() {
        sight = vec3(position.xy*rayScale,-1.) * mat3(viewMatrix);
        gl_Position = vec4(position.xy,1.,1.);
      }`,
    fragmentShader:`
      uniform vec3 zenith, horizon, sunDirection, virtualSky;
      uniform float sunset, physical; varying vec3 sight;
      void main() {
        vec3 ray = normalize(sight);
        float altitude = max(0.,ray.y);
        vec3 sky = mix(horizon,zenith,1.-exp(-altitude*2.8));
        float alignment = dot(ray,sunDirection);
        float sunsetBand = exp(-altitude*5.5)*sunset;
        sky = mix(sky,vec3(.86,.38,.18),sunsetBand*smoothstep(-.2,.96,alignment)*.58);
        sky = mix(sky,vec3(.46,.34,.53),sunsetBand*(1.-smoothstep(-1.,-.2,alignment))*.32);
        gl_FragColor = vec4(mix(virtualSky,sky,physical),1.);
        #include <colorspace_fragment>
      }`,
  }));
  sky.name='courtyard-sky'; sky.frustumCulled=false; sky.renderOrder=1000;
  sky.userData.bakedShadowCaster=sky.userData.bakedShadowReceiver=false;
  sky.onBeforeRender = (_renderer,_scene,camera) => {
    const projection = camera.projectionMatrix.elements;
    uniforms.rayScale.value.set(1/projection[0],1/projection[5]);
  };
  scene.add(sky);

  const directions=[], strengths=[];
  let seed=769;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for (let i=0;i<185;i++) {
    const y=.045+.955*random(), radius=Math.sqrt(1-y*y), angle=random()*Math.PI*2;
    directions.push(Math.cos(angle)*radius,y,Math.sin(angle)*radius);
    strengths.push(.22+.78*random()**2);
  }
  const starsGeometry=new THREE.BufferGeometry();
  starsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(directions,3));
  starsGeometry.setAttribute('strength',new THREE.Float32BufferAttribute(strengths,1));
  const starAlpha={value:0};
  const stars=new THREE.Points(starsGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{starAlpha},
    vertexShader:`
      attribute float strength; varying float alpha; uniform float starAlpha;
      void main() {
        vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
        gl_Position=vec4(clip.xy,clip.w,clip.w);
        gl_PointSize=1.3+strength*1.15;
        alpha=strength*starAlpha*smoothstep(.04,.45,position.y);
      }`,
    fragmentShader:`
      varying float alpha;
      void main() {
        float radius=length(gl_PointCoord-.5);
        gl_FragColor=vec4(.69,.80,.92,alpha*(1.-smoothstep(.06,.5,radius)));
        #include <colorspace_fragment>
      }`,
  }));
  stars.name='courtyard-stars'; stars.frustumCulled=false; stars.renderOrder=-15;
  stars.userData.bakedShadowCaster=stars.userData.bakedShadowReceiver=false;
  scene.add(stars);
  let darkness=0;
  return {
    setLight(light, sun) {
      uniforms.zenith.value.set(light.skyColor).multiplyScalar(.64);
      uniforms.horizon.value.set(light.fogColor);
      uniforms.sunDirection.value.fromArray(sun.direction);
      uniforms.sunset.value=THREE.MathUtils.smoothstep(sun.elevationDeg,-10,-1)*
        (1-THREE.MathUtils.smoothstep(sun.elevationDeg,0,20));
      darkness=1-THREE.MathUtils.smoothstep(sun.elevationDeg,-15,-6);
    },
    setPhysical(amount) {
      sky.visible=amount>.001;
      uniforms.physical.value=amount;
      starAlpha.value=darkness*amount*.75;
      stars.visible=starAlpha.value>.01;
    },
  };
}
