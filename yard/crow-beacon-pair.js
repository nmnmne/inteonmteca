import * as THREE from './vendor/three.module.js';

// Both the key scene and the flock's signalling routine use these same two leg bands.
export function createCrowBeaconPair() {
  const group = new THREE.Group();
  group.name = 'crow-leg-beacons';
  group.visible = false;

  const profile = [
    [.011,-.012],[.020,-.012],[.022,-.008],[.022,.008],
    [.020,.012],[.011,.012],[.011,-.012]
  ].map(([r,y]) => new THREE.Vector2(r,y));
  const cuff = new THREE.LatheGeometry(profile,12);
  const ray = new THREE.ConeGeometry(.011,1,6);
  const xAxis = new THREE.Vector3(1,0,0);
  const up = new THREE.Vector3(0,1,0);
  const toward = new THREE.Vector3();
  const body = new THREE.Euler(0,0,0,'YXZ');
  const bodyRotation = new THREE.Quaternion();

  function make(name,colour) {
    const ring = new THREE.Mesh(cuff,new THREE.MeshStandardMaterial({
      color:0x635e52,roughness:.53,metalness:.27,emissive:colour,emissiveIntensity:0
    }));
    const beam = new THREE.Mesh(ray,new THREE.MeshBasicMaterial({
      color:colour,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending
    }));
    ring.name = 'crow-beacon-'+name;
    beam.name = ring.name+'-signal';
    for (const mesh of [ring,beam]) {
      mesh.userData.bakedShadowCaster = mesh.userData.bakedShadowReceiver = false;
      group.add(mesh);
    }
    return {ring,beam};
  }

  const firstLamp = make('thief',0xe2a463);
  const secondLamp = make('accomplice',0x78c6c3);

  function place({ring},bird,side) {
    ring.visible = Boolean(bird);
    if (!bird) return;
    // Interpolate the shin from the crow rig's knee (-.112,.046) to the
    // toes (-.181,.010). Rotate about the hip just as the stride shader does.
    const gait = THREE.MathUtils.clamp(bird.gait || 0,-1,1);
    const air = THREE.MathUtils.clamp(bird.air || 0,0,1);
    const stride = -side*gait;
    const swing = -1.39*air + stride*(1-air)*.49;
    const c = Math.cos(swing), s = Math.sin(swing);
    const scale = bird.scale ?? 1;
    body.set(bird.pitch || 0,-bird.yaw,bird.bank || 0,'YXZ');
    bodyRotation.setFromEuler(body);
    ring.position.set(side*(.043-.002*air*.69),
      -.052 - .093*c - .011*s + .017*air + Math.max(0,stride)*.016*(1-air),
      .018 - .093*s + .011*c);
    ring.position.multiplyScalar(scale).applyQuaternion(bodyRotation);
    ring.position.x += bird.x;
    ring.position.y += bird.y + (bird.hop || 0) + Math.abs(gait)*.008*(1-air);
    ring.position.z += bird.z;
    ring.quaternion.setFromAxisAngle(xAxis,Math.atan2(.036,.069)+swing).premultiply(bodyRotation);
    ring.scale.setScalar(scale);
    ring.material.emissiveIntensity = THREE.MathUtils.clamp(bird.pulse || 0,0,1)*.95;
    ring.updateMatrix();
  }

  function signal({ring,beam},target,bird) {
    const pulse = THREE.MathUtils.clamp(bird?.pulse || 0,0,1);
    beam.visible = ring.visible && target.visible && pulse>.01;
    if (!beam.visible) return;
    toward.subVectors(target.position,ring.position);
    const distance = toward.length();
    if (distance < .05) { beam.visible = false; return; }
    toward.multiplyScalar(1/distance);
    const length = Math.min(distance*.45,.12+.32*pulse);
    beam.position.copy(ring.position).addScaledVector(toward,length*.5);
    beam.quaternion.setFromUnitVectors(up,toward);
    beam.scale.set(1,length,1);
    beam.material.opacity = .37*pulse;
    beam.updateMatrix();
  }

  return {
    group,
    update(first,second) {
      group.visible = Boolean(first || second);
      place(firstLamp,first,1);
      place(secondLamp,second,-1);
      signal(firstLamp,secondLamp.ring,first);
      signal(secondLamp,firstLamp.ring,second);
    },
    dispose() {
      group.removeFromParent();
      cuff.dispose(); ray.dispose();
      for (const {ring,beam} of [firstLamp,secondLamp]) {
        ring.material.dispose(); beam.material.dispose();
      }
    }
  };
}
