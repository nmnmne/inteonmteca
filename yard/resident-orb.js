import * as THREE from './vendor/three.module.js';

// The cocoon and its assemblage point are one transparent draw. Two curved
// surfaces of filaments give the sphere depth without a volume texture.
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
      float silk(float phase) {
        float aa = max(fwidth(phase),.012);
        float line = abs(fract(phase+.5)-.5);
        return (1.-smoothstep(.026,.040+aa*.55,line)) / (1.+aa*2.8);
      }
      float filaments(vec3 p, float t) {
        float bend = .16*sin(p.y*2.9+p.z*2.1+t*.19)
                   + .07*sin(3.2*p.z-p.y*1.7-t*.14);
        float first = (p.x+.32*p.z+bend)*13.+p.y*(1.5+p.x);
        float crosswise = (p.x-.50*p.z-.11*sin(p.y*3.9+t*.15))*10.2-p.y*2.2;
        return silk(first)*(.67+.25*sin(first*1.9+p.y*.8))
             + silk(crosswise)*(.27+.10*cos(crosswise*2.1-p.y));
      }
      void main(){
        float radius = length(disk);
        if(radius>=1.40) discard;
        float z = sqrt(max(0.,1.-radius*radius));
        float aa = max(fwidth(radius),.007);
        float inside = 1.-smoothstep(1.-aa,1.+aa,radius);
        vec3 n = vec3(disk,z);
        float rotation = .29*sin(time*.17);
        mat2 turn = mat2(cos(rotation),sin(rotation),-sin(rotation),cos(rotation));
        vec3 back = vec3(disk,-z);
        n.xz = turn*n.xz; back.xz = turn*back.xz;
        float thread = filaments(n,time)+filaments(back,time)*.37;
        vec2 focus = vec2(.46,.31);
        float d = length(disk-focus);
        // A handful of the filaments actually pass through the brighter spot.
        // Curve their approach and let them disperse across the far shell.
        vec2 strand = disk-focus;
        float fan = abs(sin(6.*atan(strand.y,strand.x+.00001)+1.5*d));
        float converging = (1.-smoothstep(.025,.025+clamp(fwidth(fan),.003,.32),fan))
                         * exp(-d*3.)*inside;
        float point = exp(-d*d/.0022);
        float rim = exp(-abs(radius-.97)*19.);
        float halo = exp(-abs(radius-1.)*9.)*(1.-smoothstep(1.14,1.40,radius));
        float light = inside*(.075 + .70*thread + .25*rim + .24*exp(-d*d/.035) + .85*point) + .45*converging;
        vec3 color = mix(vec3(.89,.43,.095),vec3(1.,.86,.50),clamp(thread*.85+rim*.45,0.,1.));
        color = mix(color,vec3(1.,.98,.85),point);
        gl_FragColor = vec4(color,strength*clamp(light+.18*halo,0.,1.));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(shape,skin);
  mesh.name='resident-luminous-sphere';
  mesh.visible=false;
  mesh.userData.visibleInBackstage=true;
  mesh.userData.bakedShadowReceiver=mesh.userData.bakedShadowCaster=false;
  const target=new THREE.Vector3();

  function update(amount, camera, dt) {
    // A little hysteresis keeps a grazing flight from repeatedly transferring
    // the creature between the room and the street.
    const wasVisible=mesh.visible;
    mesh.visible=amount >= (wasVisible ? .45 : .50);
    if (!mesh.visible) return false;
    time.value+=dt;
    strength.value=.45+.55*THREE.MathUtils.smoothstep(amount,.45,.9);
    const span=5.8*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));
    target.set(-span*Math.min(camera.aspect,1.4)*(.37+.045*Math.sin(time.value*.48)),
      span*(.20+.035*Math.sin(time.value*.66)), -5.8);
    target.applyQuaternion(camera.quaternion).add(camera.position);
    // The companion floats in world space. Re-anchor on entry or teleport;
    // when the camera turns or takes off, it catches up over several frames.
    if (!wasVisible || dt===0 || mesh.position.distanceToSquared(target)>16) mesh.position.copy(target);
    else mesh.position.lerp(target,1-Math.exp(-4.5*dt));
    mesh.updateMatrix();
    return true;
  }
  return {mesh,update,dispose() {
    mesh.removeFromParent(); shape.dispose(); skin.dispose();
  }};
}
