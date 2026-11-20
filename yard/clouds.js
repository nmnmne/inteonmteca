import * as THREE from './vendor/three.module.js';

// Distant banks anchored to the courtyard, including the low bank above the
// pedestrian link. Their height and apparent size persist when the camera turns.
export function addCourtyardClouds(scene) {
  const banks = [
    // azimuth, distance, altitude, breadth, height, mirrored
    [9,   292, 106, 268, 105, false],
    [56,  295, 104, 308, 129, true],
    [86,  322, 108, 156,  64, false],
    [117, 285,  95, 303, 121, false],
    [179, 305,  83, 287, 109, true],
    [217, 285, 112, 318, 152, false],
    [265, 300,  85, 185,  72, true],
    [318, 307, 113, 309, 138, false],
  ];
  const map = new THREE.TextureLoader().load(new URL('../assets/cotton-cloud.webp', import.meta.url).href);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const clouds = new THREE.InstancedMesh(geometry, material, banks.length);
  const puff = new THREE.Object3D();
  banks.forEach(([azimuth, distance, altitude, width, height, mirrored], index) => {
    const angle = THREE.MathUtils.degToRad(azimuth);
    puff.position.set(18 + distance * Math.sin(angle), altitude, 3 + distance * Math.cos(angle));
    puff.rotation.y = angle + (mirrored ? 0 : Math.PI);
    puff.scale.set(width, height, 1);
    puff.updateMatrix();
    clouds.setMatrixAt(index, puff.matrix);
  });
  clouds.name = 'courtyard-cloud-banks';
  clouds.renderOrder = -10;
  clouds.userData.bakedShadowCaster = false;
  clouds.userData.bakedShadowReceiver = false;
  clouds.onBeforeRender = () => {
    const daylight = 1 - (scene.userData.virtuality || 0);
    material.opacity = 0.94 * daylight;
    if (scene.userData.solarLighting) material.color.copy(scene.userData.solarLighting.cloudColor);
    else material.color.setRGB(0.83, 0.84, 0.87);
    material.color.lerp(scene.background, 0.17);
  };
  scene.add(clouds);
}
