import * as THREE from './vendor/three.module.js';

// The old key and its smaller reflection really are the same cut of brass.
function makeKey() {
  const outline=new THREE.Shape();
  outline.moveTo(-.095,.018); outline.lineTo(.17,.018); outline.lineTo(.17,-.061);
  outline.lineTo(.14,-.061); outline.lineTo(.14,-.028); outline.lineTo(.116,-.028);
  outline.lineTo(.116,-.051); outline.lineTo(.089,-.051); outline.lineTo(.089,-.012);
  outline.lineTo(-.095,-.012);
  outline.absarc(-.145,.003,.052,-.30,Math.PI*2+.30,true);
  outline.closePath();
  const eye=new THREE.Path();
  eye.absellipse(-.145,.003,.031,.032,0,Math.PI*2,false);
  outline.holes.push(eye);
  return new THREE.ExtrudeGeometry(outline,{depth:.012,bevelEnabled:true,bevelSegments:1,
    bevelSize:.0025,bevelThickness:.0025,curveSegments:12});
}

// Each of the thirteen lights is one joint of a raven in flight, viewed from the doorway.
function createKeyConstellation() {
  const silhouette = [
    [-.82,.26],[-.65,.20],[-.47,.29],[-.33,.26],[-.17,.12],
    [-.08,.055],[0,-.10],[.03,.13],[.13,.16],
    [.27,.27],[.47,.33],[.64,.26],[.82,.31]
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    silhouette.flatMap(([x,y]) => [x,y,0]), 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(silhouette.map((_,i) => i / 12), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { age: { value: 0 } }, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float age;
      attribute float seed;
      varying float glow, tint;
      void main() {
        float rise = smoothstep(5.55 + .32 * seed, 7.12, age);
        float fall = smoothstep(7.7 + .26 * seed, 9.55, age);
        float angle = 7.0 * seed + age * 2.7;
        vec3 bird = position;
        bird.y += .56 + .16 * abs(bird.x) * sin((age - 7.1) * 4.0);
        vec3 p = bird * rise;
        p.xy += .14 * sin(3.14159 * rise) * vec2(cos(angle), sin(angle));
        p = mix(p, vec3(-.46, -.61, .16), fall);
        p.xz += .19 * sin(3.14159 * fall) * vec2(cos(angle),sin(angle));
        glow = smoothstep(5.55 + .32 * seed,6.14 + .32 * seed,age) * (1.0 - fall);
        tint = mix(seed, .8, fall);
        vec4 view = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = clamp(30.0 / max(.4,-view.z),2.0,15.0);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      varying float glow, tint;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.0;
        float core = 1.0 - smoothstep(.06,.41,r);
        float halo = 1.0 - smoothstep(.15,1.0,r);
        vec3 ink = mix(vec3(.30,.84,1.0),vec3(.86,.43,1.0),tint);
        gl_FragColor = vec4(mix(ink,vec3(1.0,.91,.69),core), glow*(core + .42*halo));
        #include <colorspace_fragment>
      }`
  });
  const lights = new THREE.Points(geometry,material);
  lights.name = 'crow-key-constellation';
  lights.frustumCulled = false;
  lights.userData.bakedShadowCaster = lights.userData.bakedShadowReceiver = false;
  return lights;
}

// A shallow inlay stands above the asphalt; even the shut grate shows the dark
// recess through its slots. The lid's geometry starts at its hinge.
function createThiefCache() {
  const cache=new THREE.Group();
  cache.name='crow-key-cache';
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(.56,.42),new THREE.MeshBasicMaterial({color:0x0d141b}));
  floor.name='crow-cache-recess';
  floor.rotation.x=-Math.PI/2;
  const plate=new THREE.Shape();
  plate.moveTo(-.28,0); plate.lineTo(.28,0); plate.lineTo(.28,.42); plate.lineTo(-.28,.42); plate.closePath();
  for(let i=0;i<6;i++) {
    const l=-.251+i*.085, r=l+.057;
    const slot=new THREE.Path();
    slot.moveTo(l,.047);slot.lineTo(l,.373);slot.lineTo(r,.373);slot.lineTo(r,.047);slot.closePath();
    plate.holes.push(slot);
  }
  const grate=new THREE.Mesh(new THREE.ExtrudeGeometry(plate,{depth:.014,bevelEnabled:false}),
    new THREE.MeshStandardMaterial({color:0x788383,emissive:0x202523,roughness:.67,metalness:.42}));
  grate.name='crow-cache-grate'; grate.position.set(0,.011,.21);
  cache.add(floor,grate);
  // Two jagged wax halves with the broken brass wire lying between them.
  const seal=new THREE.Mesh(new THREE.PlaneGeometry(.32,.23), new THREE.ShaderMaterial({
    uniforms:{amount:{value:0}}, transparent:true,depthWrite:false,
    vertexShader:`varying vec2 mark;void main(){mark=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 mark;uniform float amount;
      void main(){
        vec2 p=mark-.5;
        float seam=.017*sin(27.*p.y)+.024*sin(49.*p.y);
        vec2 q=vec2(p.x-sign(p.x)*.066,p.y);
        float wax=1.-smoothstep(.234,.25,length(q*vec2(1.28,1.)));
        wax*=smoothstep(.053,.068,abs(p.x-seam));
        float wireY=.074*sin(11.*p.x)+.14*p.x;
        float wire=(1.-smoothstep(.012,.025,abs(p.y-wireY)))*smoothstep(.075,.095,abs(p.x));
        float impression=1.-smoothstep(.006,.023,abs(length(q*vec2(1.28,1.))-.168));
        float alpha=max(wax,wire)*amount;
        if(alpha<.008)discard;
        vec3 ink=mix(vec3(.69,.39,.12),vec3(.39,.033,.019)+impression*vec3(.26,.09,.034),wax);
        gl_FragColor=vec4(ink,alpha);
        #include <colorspace_fragment>
      }`
  }));
  seal.name='crow-torn-seal';
  for(const obj of [floor,grate,seal]) obj.userData.bakedShadowCaster=obj.userData.bakedShadowReceiver=false;
  return {cache,seal,update(story){
    cache.visible=Boolean(story.cache);
    if(cache.visible) {
      cache.position.set(story.cache.x,.072,story.cache.z);
      cache.rotation.y=-story.yaw;
      cache.updateMatrix();
      grate.rotation.x=-Math.PI/2+THREE.MathUtils.clamp(story.cache.open || 0,0,1)*1.25;
      grate.updateMatrix();
    }
    const amount=THREE.MathUtils.clamp(story.evidence || 0,0,1);
    seal.visible=amount>.002;
    if(seal.visible) {
      seal.position.set(story.x,.077,story.z);
      seal.rotation.set(-Math.PI/2,-story.yaw,0,'YXZ');
      seal.material.uniforms.amount.value=amount;
      seal.updateMatrix();
    }
  }, dispose(){
    for(const obj of [floor,grate,seal]) {obj.geometry.dispose();obj.material.dispose();}
  }};
}

export function createCrowKeyDoor() {
  const group=new THREE.Group();
  group.name='crows-thirteenth-door';
  const door=new THREE.Mesh(new THREE.PlaneGeometry(.72,1.08),new THREE.ShaderMaterial({
    side:THREE.DoubleSide,uniforms:{age:{value:0}},
    vertexShader:`varying vec2 pane; void main(){pane=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 pane; uniform float age;
      float frame(vec2 p,vec2 extent,float width) {
        vec2 edge=abs(p)-extent;
        float d=abs(max(edge.x,edge.y));
        return 1.-smoothstep(width,width+max(fwidth(d),.001),d);
      }
      void main() {
        vec2 p=pane-.5;
        float depth=clamp(1.-length(p-vec2(.08,.05))*1.7,0.,1.);
        vec3 colour=mix(vec3(.009,.009,.013),vec3(.025,.049,.054),depth);
        float threshold=frame(p,vec2(.481,.486),.010);
        float grain=fract(49.29*fract(dot(floor(pane*vec2(76.,122.)),vec2(.37,.71))));
        float light=mix(.38,1.,smoothstep(-.5,.5,p.y-p.x*.4));
        colour+=threshold*(.78+.22*grain)*light*vec3(.83,.53,.23);
        for(int i=1;i<=5;i++){
          float f=float(i), s=pow(.70,f);
          vec2 centre=vec2(.14,.085)*(1.-s);
          float rim=frame(p-centre,vec2(.46,.48)*s,.0035);
          float glint=.58+.28*sin(age*2.2-f*.9);
          colour+=rim*mix(vec3(.06,.41,.40),vec3(.83,.37,.12),f/5.)*glint;
        }
        gl_FragColor=vec4(colour,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const spill=new THREE.Mesh(new THREE.PlaneGeometry(.94,1.18),new THREE.ShaderMaterial({
    uniforms:{amount:{value:0}},transparent:true,depthWrite:false,
    vertexShader:`varying vec2 ground; void main(){ground=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 ground; uniform float amount;
      void main(){
        float soft=1.-smoothstep(.24,.51,abs(ground.x-.5));
        float reach=ground.y*ground.y*(1.-smoothstep(.91,1.,ground.y));
        gl_FragColor=vec4(.77,.40,.12,soft*reach*amount*.29);
        #include <colorspace_fragment>
      }`
  }));
  const geometry=makeKey(), brass=new THREE.MeshStandardMaterial({
    color:0xe6ae51,roughness:.37,metalness:.38,emissive:0x906325,emissiveIntensity:.55});
  const key=new THREE.Mesh(geometry,brass), echo=new THREE.Mesh(geometry,brass);
  door.name='crow-key-doorway'; key.name='crow-brass-key'; echo.name='crow-key-double';
  door.userData.bakedShadowReceiver=key.userData.bakedShadowReceiver=echo.userData.bakedShadowReceiver=false;
  spill.userData.bakedShadowCaster=spill.userData.bakedShadowReceiver=false;
  const constellation=createKeyConstellation(), props=createThiefCache();
  group.add(door,key,echo,spill,constellation,props.cache,props.seal); group.visible=false;
  function update(story) {
    group.visible=Boolean(story && story.phase!=='idle');
    if (!group.visible) return;
    props.update(story);
    const {yaw,door:open}=story, k=story.key;
    key.position.set(k.x,k.y,k.z);
    // On the ground the bow lies flat. It lifts until the profile faces the viewer.
    key.rotation.set(k.tilt-Math.PI/2,-yaw,k.turn,'YXZ');
    key.scale.setScalar(k.scale);
    // Progressive courtyard batching freezes automatic matrices on every mesh.
    key.updateMatrix();
    door.visible=open>.01;
    spill.visible=door.visible;
    const x=story.x+Math.sin(yaw)*.19, z=story.z-Math.cos(yaw)*.19;
    const doorYaw=-yaw+.20;
    constellation.visible=story.elapsed>5.55 && story.elapsed<9.55;
    if (constellation.visible) {
      constellation.position.set(x,.68,z);
      constellation.rotation.y=doorYaw;
      constellation.updateMatrix();
      constellation.material.uniforms.age.value=story.elapsed;
    }
    if (!door.visible) {echo.visible=false;return;}
    door.position.set(x,.583,z);
    door.rotation.y=doorYaw;
    door.scale.x=open;
    door.updateMatrix();
    door.material.uniforms.age.value=story.elapsed;
    // The thief takes the brass key. Its reflection unravels into a different bird.
    const brassLeft=1-THREE.MathUtils.smoothstep(story.elapsed,5.55,6.36);
    echo.visible=open>.53 && brassLeft>0;
    echo.position.set(x+.014*Math.sin(doorYaw),.68,z+.014*Math.cos(doorYaw));
    echo.rotation.set(0,doorYaw,.21,'YXZ');
    echo.scale.setScalar(.64*open*brassLeft);
    echo.updateMatrix();
    spill.rotation.set(-Math.PI/2,doorYaw,0,'YXZ');
    spill.position.set(x+.54*Math.sin(doorYaw),.069,z+.54*Math.cos(doorYaw));
    spill.scale.x=open;
    spill.updateMatrix();
    spill.material.uniforms.amount.value=open;
  }
  return {group,update,dispose(){
    group.removeFromParent(); geometry.dispose(); brass.dispose(); door.geometry.dispose(); door.material.dispose();
    spill.geometry.dispose(); spill.material.dispose();
    constellation.geometry.dispose(); constellation.material.dispose();
    props.dispose();
  }};
}
