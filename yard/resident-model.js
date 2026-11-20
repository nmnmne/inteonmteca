import * as THREE from './vendor/three.module.js';

// The same two eyes and asymmetric, moss-coloured pebble as the room resident.
// Keep the face on its skin so it turns with the creature and can be occluded.
export function createResidentModel() {
  const group = new THREE.Group();
  group.name = 'courtyard-resident';
  group.visible = false;
  const shape = new THREE.SphereGeometry(1, 28, 18);
  const positions = shape.getAttribute('position');
  shape.setAttribute('residentSkin', positions.clone());
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const belly = 1 - .15*y + .045*x*z;
    positions.setXYZ(i, .232*x*belly + .016*y*y, .232*y + .009*x, .177*z*belly);
  }
  shape.computeVertexNormals();
  const skin = new THREE.MeshPhongMaterial({
    color:0x849077, emissive:0x17211d, specular:0x536456, shininess:23,
    transparent:true, depthWrite:false,
  });
  const eyelid = {value:1}, twilight = {value:0};
  const markTexture = new THREE.TextureLoader().load(new URL('../assets/resident-m.svg', import.meta.url).href);
  skin.onBeforeCompile = shader => {
    shader.uniforms.residentLid = eyelid;
    shader.uniforms.residentNight = twilight;
    shader.uniforms.residentMark = {value:markTexture};
    shader.vertexShader = 'attribute vec3 residentSkin; varying vec3 vSkin;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSkin = residentSkin;');
    shader.fragmentShader = 'varying vec3 vSkin; uniform float residentLid, residentNight; uniform sampler2D residentMark;\n'
      + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float front = smoothstep(.38, .70, vSkin.z);
        vec2 eye = vec2((abs(vSkin.x)-.335)/.092, (vSkin.y-.13)/(.156*residentLid));
        float e = length(eye);
        float eyes = (1. - smoothstep(.80, 1.12 + fwidth(e)*.35, e))*front;
        // A faint impression of the existing letter shows below the eyes.
        vec2 uvMark = (vSkin.xy-vec2(0.,-.34))/vec2(.40,.30)+.5;
        float mark = texture2D(residentMark,clamp(uvMark,0.,1.)).a*front*
          step(max(abs(uvMark.x-.5),abs(uvMark.y-.5)),.5);
        diffuseColor.rgb *= mix(vec3(.42,.54,.52),vec3(1.22,1.14,.96),smoothstep(-.9,.9,vSkin.y-.22*vSkin.x));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.68,.71,.41),mark*.48);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.93,.94,.76),eyes);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = pow(1. - abs(dot(normal,normalize(vViewPosition))), 2.);
        totalEmissiveRadiance += vec3(.035,.052,.039)*rim*(1. + residentNight)
          + vec3(.72,.76,.55)*eyes*(.43+.18*residentNight);`);
  };
  const body = new THREE.Mesh(shape, skin);
  body.name = 'resident-body';
  body.receiveShadow = true;

  const shadowShape = new THREE.PlaneGeometry(.54, .38).rotateX(-Math.PI/2);
  const shade = new THREE.ShaderMaterial({
    uniforms:{opacity:{value:0}}, transparent:true, depthWrite:false,
    vertexShader:`varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform float opacity; varying vec2 vUv;
      void main(){float k=max(0.,1.-dot(2.*vUv-1.,2.*vUv-1.));
        gl_FragColor=vec4(.01,.014,.013,k*k*opacity);
        #include <colorspace_fragment>
      }`,
  });
  const shadow = new THREE.Mesh(shadowShape,shade);
  shadow.name = 'resident-contact-shadow';
  shadow.position.y = .052;
  for (const mesh of [body, shadow]) {
    mesh.userData.bakedShadowReceiver = mesh.userData.bakedShadowCaster = false;
    group.add(mesh);
  }
  let age = 0, steps = 0, walk = 0, sit = 0, lastVisitX, lastVisitZ;
  function update(visit, dt, daylight, virtuality = 0) {
    const alpha = (visit?.amount || 0) * (1 - virtuality);
    if (!visit?.kind || alpha < .005) { group.visible = false; lastVisitX = undefined; return; }
    const seated = visit.phase === 'sitting' || visit.kind === 'crows' && visit.phase === 'approach';
    const travel = lastVisitX === undefined ? 0 : Math.hypot(visit.x-lastVisitX, visit.z-lastVisitZ);
    if (lastVisitX === undefined) { age = steps = walk = 0; sit = Number(seated); }
    lastVisitX = visit.x; lastVisitZ = visit.z;
    group.visible = true;
    age += dt;
    const smooth = 1-Math.exp(-7*dt);
    walk += (Math.min(1, travel / Math.max(.012, dt*.65)) - walk) * smooth;
    sit += (Number(seated)-sit)*smooth;
    steps += travel * 22;
    const breath = .009*Math.sin(age*2.3);
    const foot = Math.sin(steps)*walk;
    body.scale.set(1+.17*sit-breath, 1-.24*sit+breath, 1+.12*sit);
    body.position.y = .026+.231*body.scale.y+.023*Math.abs(foot);
    body.rotation.set(.10*walk-.09*sit, 0, .135*foot + .022*sit*Math.sin(age*.9));
    // Progressive decoration batching freezes mesh matrices after loading.
    body.updateMatrix();
    if (dt > 0) {
      const blink = Math.min(1, Math.abs((age+2.3)%4.7-.16)/.15);
      eyelid.value = .12+.88*blink;
    }
    twilight.value = 1-daylight;
    group.position.set(visit.x,visit.y,visit.z);
    group.rotation.y = visit.yaw;
    skin.opacity = alpha*.93;
    shade.uniforms.opacity.value = alpha*(.17+.18*daylight)*(1+.2*sit);
  }
  return {group,body,update,dispose() {
    group.removeFromParent();
    shape.dispose(); skin.dispose(); markTexture.dispose(); shadowShape.dispose(); shade.dispose();
  }};
}
