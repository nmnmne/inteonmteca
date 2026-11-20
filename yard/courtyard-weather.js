import * as THREE from './vendor/three.module.js';
import { pointInRing } from './navigation.js';
import { weatherTexture, weatherFieldShader } from './weather-field.js';

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

// The asphalt already carries surveyed surface wear. Use that relief to leave
// dark aggregate exposed through the frost and keep sunlight under real shadows.
function shadePavement(material, wind, motion) {
  const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.weatherMap = {value:weatherTexture(THREE)};
    shader.uniforms.weatherSeconds = motion.matches ? {value:0} : wind;
    shader.vertexShader = 'varying vec2 weatherWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\nweatherWorld=(modelMatrix*vec4(transformed,1.)).xz;');
    shader.fragmentShader = 'varying vec2 weatherWorld; uniform float weatherSeconds;\n' + weatherFieldShader + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
      vec4 climate = weatherAt(weatherWorld, weatherSeconds);
      diffuseColor.rgb *= mix(vec3(1.),vec3(.52,.65,.79),climate.r);
      float frost = climate.g * smoothstep(.12,.80,wear.r*.53+wear.b*.47);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.36,.46,.56),frost*.68);
      diffuseColor.rgb *= vec3(1.) + climate.b*vec3(.02,.14,.04) + climate.a*vec3(.65,.23,-.08);
      `);
  };
  material.customProgramCacheKey = () => cacheKey + ':local-seasons';
}

// The five climates are sampled at each particle, so rain and snow can fall on
// opposite sides of the same street. The billboard pool remains one draw call.
export function addCourtyardWeather(scene, layout, pavement) {
  const random = randomSource();
  groundDetails(scene,layout,random);
  const compact = matchMedia('(pointer: coarse), (max-width: 800px)').matches;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const count = compact ? 830 : 1500, seeds = new Float32Array(count*4);
  for (let i=0;i<seeds.length;i++) seeds[i]=random();
  const plane = new THREE.PlaneGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index=plane.index; geometry.attributes=plane.attributes;
  geometry.setAttribute('particle',new THREE.InstancedBufferAttribute(seeds,4));
  geometry.instanceCount=count;
  if (pavement) shadePavement(pavement, scene.userData.grassWind || {value:0}, motion);
  const uniforms={seconds:{value:0},visibility:{value:1},twilight:{value:0},weatherMap:{value:weatherTexture(THREE)}};
  const material = new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`
      attribute vec4 particle;
      uniform float seconds, visibility, twilight;
      varying vec2 st;
      varying vec4 ink;
      varying float kind;
      const float tau=6.2831853;
      ${weatherFieldShader}
      void main() {
        st=uv*2.-1.;
        vec2 drift=vec2(.16,.06)*seconds + vec2(sin(particle.x*18.+seconds*.68),cos(particle.y*11.+seconds*.45))*.64;
        vec2 xz=mod(particle.xy*48.+drift-cameraPosition.xz+24.,48.)-24.+cameraPosition.xz;
        vec4 c=weatherAt(xz,seconds);
        float pick=particle.w;
        kind=0.;
        if(pick>=c.r) kind=1.;
        if(pick>=c.r+c.g) kind=2.;
        if(pick>=c.r+c.g+c.b) kind=3.;
        if(pick>=dot(c,vec4(1.))) kind=4.;
        float rate=.81, opacity=.71;
        vec2 size=vec2(.022,.40);
        vec3 color=vec3(.35,.66,.90);
        float twist=0.;
        if(kind==1.) {
          rate=.081; size=vec2(.051+.065*particle.z);
          color=vec3(.82,.93,1.); opacity=.90; twist=seconds*.63;
        } else if(kind==2.) {
          rate=.051; size=vec2(.105,.068);
          color=mix(vec3(.85,.32,.46),vec3(1.,.86,.80),particle.z);
          opacity=.91; twist=seconds*(.65+particle.x);
          if(particle.z>.976){kind=5.;size=vec2(3.6,.75);color=vec3(.72,.85,.78);opacity=.095;}
        } else if(kind==3.) {
          rate=-.024; size=vec2(.048+.035*particle.z);
          color=mix(vec3(1.,.57,.085),vec3(1.,.86,.37),particle.y);
          opacity=.35+.43*pow(.5+.5*sin(seconds*1.7+particle.z*30.),2.);
        } else if(kind==4.) {
          rate=.057; size=vec2(.14,.072); opacity=.92;
          color=mix(vec3(.55,.16,.043),vec3(1.,.52,.105),particle.z);
          twist=seconds*(1.+particle.x);
        }
        float altitude=fract(particle.z-seconds*rate)*10.5;
        if(kind>=2.) altitude*=.61;
        if(kind==5.) altitude=.55+particle.y*1.13;
        float y=altitude+max(0.,cameraPosition.y-4.5);
        vec4 view=viewMatrix*vec4(xz.x,y,xz.y,1.);
        vec2 corner=position.xy*size;
        if(kind==0.) corner.x+=corner.y*.26;
        else if(kind!=5.) {
          float a=particle.x*tau+twist;
          corner=mat2(cos(a),sin(a),-sin(a),cos(a))*corner;
        }
        view.xy+=corner; gl_Position=projectionMatrix*view;
        float fade=1.-smoothstep(17.,24.,length(xz-cameraPosition.xz));
        ink=vec4(color*mix(1.,.48,twilight),opacity*fade*visibility);
      }`,
    fragmentShader:`
      varying vec2 st; varying vec4 ink; varying float kind;
      void main() {
        vec2 q=st;
        if(kind==2. || kind==4.) { q.x+=.17*(1.-q.y*q.y); q.y*=1.+.30*abs(q.x); }
        float alpha=ink.a*(1.-smoothstep(.20,1.,dot(q,q)));
        if(kind==5.) alpha*=.65+.35*cos(st.x*4.+st.y*2.);
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
  weather.onBeforeRender=()=>{
    uniforms.seconds.value=motion.matches ? 0 : scene.userData.grassWind?.value || 0;
    uniforms.twilight.value=scene.userData.windowNight?.value || 0;
    uniforms.visibility.value=1-(scene.userData.virtuality || 0);
  };
  scene.add(weather);
}
