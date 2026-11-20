import * as THREE from './vendor/three.module.js';
import { pointInRing } from './navigation.js';

function randomSource() {
  let seed = 141017;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Scatter debris inside mapped planting beds, including their cut-outs for paths.
function groundDetails(scene, layout, random) {
  const leaves = [], banks = [];
  for (const patch of layout.landscaping?.patches || []) {
    const xs = patch.polygon.map(p => p[0]), zs = patch.polygon.map(p => p[1]);
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    const w = Math.max(...xs) - x0, h = Math.max(...zs) - z0;
    const within = (x,z) => pointInRing(x,z,patch.polygon) && !patch.holes?.some(r => pointInRing(x,z,r));
    for (let i = 0; i < Math.min(170, Math.ceil(w*h*.5)); i++) {
      const x = x0 + w*random(), z = z0 + h*random();
      if (!within(x,z)) continue;
      if (Math.sin(x*.26) + Math.cos(z*.21) > -.1) leaves.push([x,z]);
      if (i % 17 !== 0 || banks.some(b => Math.hypot(x-b.x,z-b.z) < 3)) continue;
      const rx = .45 + random()*1.25, rz = .39 + random()*.78;
      if ([[rx,0],[-rx,0],[0,rz],[0,-rz]].every(([a,b]) => within(x+a,z+b))) {
        banks.push({x,z,rx,rz});
      }
    }
  }
  for (const tree of (layout.circles || []).filter(c => c.id.startsWith('tree-'))) {
    for (let i = 0; i < 115; i++) {
      const a = random()*Math.PI*2, d = .5 + random()*3.8;
      leaves.push([tree.x+Math.cos(a)*d,tree.z+Math.sin(a)*d]);
    }
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position',new THREE.Float32BufferAttribute([
    0,.008,-.080, -.034,0,-.022, -.030,.005,.026, 0,.013,.064,
    .033,.003,.025, .030,0,-.026, 0,.018,-.008,
  ],3));
  blade.setIndex([0,6,1, 1,6,2, 2,6,3, 3,6,4, 4,6,5, 5,6,0]);
  blade.computeVertexNormals();
  const litter = new THREE.InstancedMesh(blade,new THREE.MeshLambertMaterial({side:THREE.DoubleSide}),leaves.length);
  const pose = new THREE.Object3D(), tint = new THREE.Color();
  const ochres = [0x966a39,0xc29847,0x80513c,0xcbb178,0x876c43,0xa45e39];
  leaves.forEach(([x,z],i) => {
    pose.position.set(x,.054+random()*.012,z); pose.rotation.y = random()*6.28;
    pose.scale.setScalar(.76+random()*.8); pose.updateMatrix();
    litter.setMatrixAt(i,pose.matrix); litter.setColorAt(i,tint.setHex(ochres[i%ochres.length]));
  });
  litter.name = 'courtyard-fallen-leaves';
  litter.userData.bakedShadowCaster = false;
  scene.add(litter);

  const positions = [], colors = [], indices = [];
  const rings = [.24,.62,.85,1], segments = 21;
  for (const {x,z,rx,rz} of banks) {
    const start = positions.length/3, shift = random()*6.28, peak = .12 + random()*.13;
    const edges = Array.from({length:segments},(_,j) => {
      const a = j*Math.PI*2/segments;
      return .82 + .13*Math.sin(3*a+shift) + .12*Math.cos(5*a-shift) + .13*random();
    });
    positions.push(x,.049+peak,z); colors.push(.76,.79,.80);
    rings.forEach((r,k) => {
      for (let j=0; j<segments; j++) {
        const a=j*Math.PI*2/segments, d=r*edges[j];
        positions.push(x+rx*d*Math.cos(a),.047+peak*(1-r*r)*(1-r*.62)*(.75+.25*random()),z+rz*d*Math.sin(a));
        const shade = (.75+.25*random()) * [1,.95,.67,.29][k];
        colors.push(.81*shade,.84*shade,.85*shade);
        const v=start+1+k*segments+j, n=start+1+k*segments+(j+1)%segments;
        if (!k) indices.push(start,n,v);
        else indices.push(v-segments,n,v, v-segments,n-segments,n);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const slush = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true, roughness:.77}));
  slush.name = 'courtyard-melting-snow'; slush.userData.bakedShadowCaster = false;
  scene.add(slush);
}

// One instanced draw covers rain, snowfall, windblown leaves and wisps of mist.
// The field is anchored in world metres. The camera only wraps the particle pool.
export function addCourtyardWeather(scene, layout) {
  const random = randomSource();
  groundDetails(scene,layout,random);
  const compact = matchMedia('(pointer: coarse), (max-width: 800px)').matches;
  const count = compact ? 830 : 1500, seeds = new Float32Array(count*4);
  for (let i=0;i<count;i++) {
    const type = random();
    seeds.set([random(),random(),random(), type < .49 ? 0 : type < .87 ? 1 : type < .977 ? 2 : 3],i*4);
  }
  const plane = new THREE.PlaneGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index=plane.index; geometry.attributes=plane.attributes;
  geometry.setAttribute('particle',new THREE.InstancedBufferAttribute(seeds,4));
  geometry.instanceCount=count;
  const uniforms={seconds:{value:0},visibility:{value:1},twilight:{value:0}};
  const material = new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`
      attribute vec4 particle;
      uniform float seconds, visibility, twilight;
      varying vec2 st;
      varying vec4 ink;
      varying float kind;
      const float tau=6.2831853;
      void main() {
        kind=particle.w; st=uv*2.-1.;
        vec2 drift = vec2(.09,.025)*seconds;
        float rate=.64;
        if(kind>.5) { drift += vec2(sin(particle.x*18.+seconds*.61),cos(particle.y*11.+seconds*.49))*.55; rate=.092; }
        if(kind>1.5) { drift += vec2(.44,.11)*seconds; rate=.055; }
        vec2 xz = mod(particle.xy*52.+drift-cameraPosition.xz+26.,52.)-26.+cameraPosition.xz;
        float y=fract(particle.z-seconds*rate)*10.5 + max(0.,cameraPosition.y-5.);
        // The fifth interval leaves a clear gap between mist and rain.
        float front=xz.x*.086+xz.y*.041+.72*sin(xz.y*.075)+.46*sin(xz.x*.053)-seconds*.031;
        float strength=smoothstep(.52,.94,cos(front-kind*1.25664));
        float fade=1.-smoothstep(18.,26.,length(xz-cameraPosition.xz));
        vec2 size=vec2(.018,.31);
        vec3 color=vec3(.61,.75,.83); float opacity=.55;
        if(kind>.5){ size=vec2(.042+particle.z*.048); color=vec3(.92,.96,1.); opacity=.87; }
        if(kind>1.5){ size=vec2(.103,.056); color=mix(vec3(.39,.19,.071),vec3(.73,.46,.15),particle.y); opacity=.94; y*=.55; }
        if(kind>2.5){ size=vec2(3.6,1.1)*(1.+particle.x); color=vec3(.75,.82,.83); opacity=.16; y=.6+particle.z*1.45; }
        vec4 view=viewMatrix*vec4(xz.x,y,xz.y,1.);
        vec2 corner=position.xy*size;
        if(kind<.5) corner.x+=corner.y*.19;
        if(kind>1.5 && kind<2.5) {
          float a=particle.y*tau+seconds*(1.+particle.z);
          corner=mat2(cos(a),sin(a),-sin(a),cos(a))*corner;
        }
        view.xy+=corner; gl_Position=projectionMatrix*view;
        ink=vec4(color*mix(1.,.46,twilight),opacity*strength*fade*visibility);
      }`,
    fragmentShader:`
      varying vec2 st; varying vec4 ink; varying float kind;
      void main() {
        float alpha=ink.a*(1.-smoothstep(.12,1.,dot(st,st)));
        if(kind>2.5) alpha*=.65+.35*cos(st.x*4.+st.y*2.);
        if(alpha<.006) discard;
        gl_FragColor=vec4(ink.rgb,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const weather=new THREE.Mesh(geometry,material);
  weather.name='courtyard-weather-fronts';
  weather.frustumCulled=false;
  weather.userData.bakedShadowReceiver=false;
  weather.userData.bakedShadowCaster=false;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  weather.onBeforeRender=()=>{
    uniforms.seconds.value=motion.matches ? 0 : scene.userData.grassWind?.value || 0;
    uniforms.twilight.value=scene.userData.windowNight?.value || 0;
    uniforms.visibility.value=1-(scene.userData.virtuality || 0);
  };
  scene.add(weather);
}
