import * as THREE from './vendor/three.module.js';

const lengthM = 10;
const rows = 161;

// Retain actual world-space turns and their travelled distances. The first raw
// segment straddles the ten-metre cutoff, so its inner point can be interpolated.
export function createResidentOrbTrail() {
  let history = new Float64Array(4 * 1024), first = 0, count = 0;
  const slot = index => 4 * ((first + index) % (history.length / 4));
  const center = new THREE.Vector3();
  const position = new THREE.BufferAttribute(new Float32Array(6 * rows), 3).setUsage(THREE.DynamicDrawUsage);
  const tangent = new THREE.BufferAttribute(new Float32Array(6 * rows), 3).setUsage(THREE.DynamicDrawUsage);
  const age = new THREE.BufferAttribute(new Float32Array(2 * rows), 1).setUsage(THREE.DynamicDrawUsage);
  const side = new Int8Array(2 * rows), indices = new Uint16Array(6 * (rows-1));
  for (let i=0; i<rows; i++) {
    const v = i*2;
    side[v] = -1; side[v+1] = 1;
    if (i+1<rows) indices.set([v,v+1,v+2, v+2,v+1,v+3],6*i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',position);
  geometry.setAttribute('direction',tangent);
  geometry.setAttribute('ageM',age);
  geometry.setAttribute('bank',new THREE.BufferAttribute(side,1));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.setDrawRange(0,0);
  const material = new THREE.ShaderMaterial({
    side:THREE.DoubleSide, transparent:true, depthWrite:false, fog:false,
    uniforms:{strength:{value:0}},
    vertexShader:`attribute vec3 direction;
      attribute float ageM,bank;
      varying vec3 ribbon;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.);
        vec3 d=mat3(modelViewMatrix)*direction;
        vec2 travel=d.xy-p.xy*d.z/min(-.001,p.z);
        vec2 across=dot(travel,travel)>1e-10 ? normalize(vec2(-travel.y,travel.x)) : vec2(1.,0.);
        float t=clamp(ageM/10.,0.,1.);
        p.xy+=across*bank*mix(.186,.026,smoothstep(0.,1.,t));
        gl_Position=projectionMatrix*p;
        ribbon=vec3(ageM,bank,-p.z);
      }`,
    fragmentShader:`varying vec3 ribbon;
      uniform float strength;
      void main(){
        float t=clamp(ribbon.x/10.,0.,1.), side=ribbon.y;
        float veil=exp(-4.5*side*side);
        float arch=sin(ribbon.x*2.3)*.25;
        float thread=exp(-62.*(side-arch)*(side-arch));
        float echo=exp(-88.*(side+.33)*(side+.33));
        float fade=1.-smoothstep(0.,1.,t);
        float alpha=(.12*veil+.25*thread+.076*echo)*fade*strength*smoothstep(.35,1.2,ribbon.z);
        vec3 dye=mix(vec3(.10,.39,.44),vec3(.53,.43,.31),thread*.77);
        gl_FragColor=vec4(dye,alpha*(1.-smoothstep(.74,1.,abs(side))));
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='resident-orb-trail'; mesh.visible=false; mesh.frustumCulled=false;
  mesh.renderOrder=-1;
  mesh.userData.visibleInBackstage=true;
  mesh.userData.bakedShadowCaster=mesh.userData.bakedShadowReceiver=false;

  function clear() {
    if (!count) return;
    count=first=0; mesh.visible=false;
    geometry.setDrawRange(0,0);
  }
  function append(point,distance) {
    if (count*4===history.length) {
      // Exceptionally slow, curving movement needs more raw history, while the
      // ribbon always uses the same bounded buffers and a single draw.
      const expanded=new Float64Array(history.length*2);
      for(let i=0;i<count;i++) {
        const from=slot(i);
        for(let k=0;k<4;k++) expanded[4*i+k]=history[from+k];
      }
      history=expanded; first=0;
    }
    const at=slot(count++);
    history[at]=point.x; history[at+1]=point.y; history[at+2]=point.z; history[at+3]=distance;
  }
  function update(point,amount,restart=false) {
    material.uniforms.strength.value=.45+.55*THREE.MathUtils.smoothstep(amount,.45,.9);
    if(restart) clear();
    if(!count) {append(point,0); return;}
    const last=slot(count-1);
    const dx=point.x-history[last],dy=point.y-history[last+1],dz=point.z-history[last+2];
    const movement=Math.hypot(dx,dy,dz);
    if(movement>4) {clear(); append(point,0); return;}
    if(movement<.00001) return;
    const end=history[last+3]+movement, start=Math.max(0,end-lengthM);
    let straight=false;
    if(count>=2) {
      const prev=slot(count-2);
      const x=history[last]-history[prev],y=history[last+1]-history[prev+1],z=history[last+2]-history[prev+2];
      const dot=x*dx+y*dy+z*dz;
      straight=dot>0 && dot*dot>=(x*x+y*y+z*z)*(movement*movement)*(1.-1e-14);
    }
    if(straight) {
      history[last]=point.x; history[last+1]=point.y; history[last+2]=point.z; history[last+3]=end;
    } else append(point,end);
    while(count>2 && history[slot(1)+3]<=start) {
      first=(first+1)%(history.length/4); count--;
    }
    const used=Math.min(rows,count);
    let segment=0;
    for(let i=0;i<used;i++) {
      // Small histories retain every corner. Longer paths sample their original
      // arc length, with both endpoints included irrespective of frame rate.
      const distance=i===0 ? start : used===count ? history[slot(i)+3] : start+(end-start)*i/(used-1);
      while(segment<count-2 && history[slot(segment+1)+3]<distance) segment++;
      const a=slot(segment), b=slot(segment+1);
      const u=(distance-history[a+3])/(history[b+3]-history[a+3]);
      center.set(history[a]+(history[b]-history[a])*u,
        history[a+1]+(history[b+1]-history[a+1])*u,history[a+2]+(history[b+2]-history[a+2])*u);
      const v=2*i;
      position.setXYZ(v,center.x,center.y,center.z); position.setXYZ(v+1,center.x,center.y,center.z);
      age.setX(v,end-distance); age.setX(v+1,end-distance);
    }
    const path=position.array;
    for(let i=0;i<used;i++) {
      const a=6*Math.max(0,i-1), b=6*Math.min(i+1,used-1), v=i*2;
      const x=path[b]-path[a],y=path[b+1]-path[a+1],z=path[b+2]-path[a+2];
      tangent.setXYZ(v,x,y,z); tangent.setXYZ(v+1,x,y,z);
    }
    position.needsUpdate=tangent.needsUpdate=age.needsUpdate=true;
    geometry.setDrawRange(0,(used-1)*6); mesh.visible=true;
  }
  return {mesh,update,clear,dispose() {mesh.removeFromParent(); geometry.dispose(); material.dispose();}};
}
