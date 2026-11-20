import * as THREE from './vendor/three.module.js';

// Shade the glass shell and its enclosed point together on a camera-facing disk.
export function createResidentOrb() {
  const shape = new THREE.PlaneGeometry(1.55,1.55);
  const time = {value:0}, strength = {value:0};
  const skin = new THREE.ShaderMaterial({
    uniforms:{time,strength}, transparent:true, depthWrite:false, fog:false,
    vertexShader:`
      varying vec2 disk;
      void main(){
        disk = (uv-.5)*2.80;
        vec4 center = modelViewMatrix*vec4(0.,0.,0.,1.);
        center.xy += position.xy;
        gl_Position = projectionMatrix*center;
      }`,
    fragmentShader:`
      varying vec2 disk;
      uniform float time, strength;
      void main(){
        float radius = length(disk);
        float aa = max(fwidth(radius), .005);
        if (radius > 1.12) discard;
        float shell = 1. - smoothstep(1. - aa, 1. + aa, radius);
        vec3 normal = vec3(disk, sqrt(max(0., 1. - radius * radius)));
        float edge = pow(1. - normal.z, 2.);
        float drift = .08 * sin(time * .21);
        vec3 lightDir = normalize(vec3(-.48 + drift, .74, .54));
        float softbox = pow(max(dot(normal, lightDir), 0.), 5.);

        // A curved reflection wraps from the shaded face into the lit edge.
        float sweep = dot(normal, normalize(vec3(-.34, .84, .42 + drift))) + .04;
        float ribbon = exp(-sweep * sweep / .018) * (.36 + .64 * normal.z);
        float lip = (1. - smoothstep(.008, .027 + fwidth(sweep), abs(sweep - .08)))
                  * smoothstep(-.45, .85, normal.x);
        vec2 offset = disk - vec2(.38 + drift, .27);
        float point = exp(-dot(offset, offset) / .0038);

        vec3 glass = mix(vec3(.023, .040, .058), vec3(.24, .34, .36), softbox);
        glass = mix(glass, vec3(.23, .26, .32), ribbon * .70);
        glass = mix(glass, vec3(.38, .45, .46), edge * (.56 + .38 * softbox) + .28 * lip);
        glass = mix(glass, vec3(.54, .49, .40), point * .84);
        float opacity = .59 + .19 * softbox + .14 * edge + .12 * point;
        float halo = .05 * (1. - smoothstep(1., 1.12, radius));
        gl_FragColor = vec4(glass, strength * mix(halo, opacity, shell));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(shape,skin);
  mesh.name='resident-luminous-sphere';
  mesh.visible=false;
  mesh.userData.visibleInBackstage=true;
  mesh.userData.bakedShadowReceiver=mesh.userData.bakedShadowCaster=false;
  function update(amount, center, dt) {
    time.value+=dt;
    strength.value=.45+.55*THREE.MathUtils.smoothstep(amount,.45,.9);
    mesh.position.copy(center);
    mesh.updateMatrix();
  }
  return {mesh,update,dispose() {
    mesh.removeFromParent(); shape.dispose(); skin.dispose();
  }};
}
