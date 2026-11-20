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
  group.add(door,key,echo,spill); group.visible=false;
  function update(story) {
    group.visible=Boolean(story && story.phase!=='idle');
    if (!group.visible) return;
    const {yaw,door:open}=story, k=story.key;
    key.position.set(k.x,k.y,k.z);
    // On the ground the bow lies flat. It lifts until the profile faces the viewer.
    key.rotation.set(k.tilt-Math.PI/2,-yaw,k.turn,'YXZ');
    key.scale.setScalar(k.scale);
    // Progressive courtyard batching freezes automatic matrices on every mesh.
    key.updateMatrix();
    door.visible=open>.01;
    spill.visible=door.visible;
    if (!door.visible) {echo.visible=false;return;}
    const x=story.x+Math.sin(yaw)*.19, z=story.z-Math.cos(yaw)*.19;
    door.position.set(x,.583,z);
    const doorYaw=-yaw+.20;
    door.rotation.y=doorYaw;
    door.scale.x=open;
    door.updateMatrix();
    door.material.uniforms.age.value=story.elapsed;
    echo.visible=open>.53;
    echo.position.set(x+.014*Math.sin(doorYaw),.68,z+.014*Math.cos(doorYaw));
    echo.rotation.set(0,doorYaw,.21,'YXZ');
    echo.scale.setScalar(.64*open);
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
  }};
}
