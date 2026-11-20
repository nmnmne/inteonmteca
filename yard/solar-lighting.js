import * as THREE from './vendor/three.module.js';
import { solarLighting, sunForLocation } from './solar-clock.js';
import { isBakedReceiver } from './shadow-atlas.js';

function solarDisk() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 63);
  for (const [t, alpha] of [[0,1],[.115,1],[.14,.78],[.17,.18],[.35,.065],[.7,.015],[1,0]]) {
    glow.addColorStop(t, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(canvas), fog:false, depthWrite:false, transparent:true,
  }));
  sprite.name = 'courtyard-sun';
  sprite.renderOrder = -12;
  sprite.scale.set(30, 30, 1);
  return sprite;
}

function shadowBounds(layout) {
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  const include = ([x,z], height = 0) => box.expandByPoint(p.set(x,height,z));
  for (const point of layout.walkable) include(point);
  for (const building of [...layout.buildings, ...(layout.utilityStructures || [])]) {
    for (const point of building.footprint) include(point, building.heightM || 6);
  }
  box.expandByScalar(8);
  const corners = [];
  for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) {
    for (const z of [box.min.z,box.max.z]) corners.push(new THREE.Vector3(x,y,z));
  }
  return {center:box.getCenter(p), corners};
}

// Each depth pass sees the entire physical block, so changing camera position
// or flying up onto a roof can reuse the same GPU texture.
export function createSolarLighting(renderer, yard, layout, {mapSize = 1024} = {}) {
  const { scene, edgeEffect } = yard;
  const ambient = scene.children.find(o => o.isAmbientLight);
  const hemisphere = scene.children.find(o => o.isHemisphereLight);
  const sun = scene.children.find(o => o.isDirectionalLight);
  const bounds = shadowBounds(layout);
  const viewBounds = new THREE.Box3(), point = new THREE.Vector3();
  const lastDepthDirection = new THREE.Vector3();
  const minDirectionDot = Math.cos(THREE.MathUtils.degToRad(.12));
  const state = scene.userData.solarLighting = {
    direction:new THREE.Vector3(), cloudColor:new THREE.Color(), reflectionTint:new THREE.Color(),
    receivers:0, shadowUpdates:0, mapSize, elevationDeg:0, daylight:0,
  };
  const disk = solarDisk();
  scene.add(disk);
  sun.target.position.copy(bounds.center);
  sun.target.updateMatrixWorld();
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = -.00012;
  sun.shadow.normalBias = .045;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  let geometryChanged = true, lastSecond = NaN;

  function refreshGeometry() {
    let receivers = 0;
    scene.traverse(mesh => {
      if (!isBakedReceiver(mesh)) return;
      mesh.receiveShadow = true;
      mesh.castShadow = mesh.userData.bakedShadowCaster !== false;
      receivers++;
    });
    state.receivers = receivers;
    geometryChanged = true;
  }
  refreshGeometry();

  function update(epochMs, camera) {
    const second = Math.floor(epochMs / 1000);
    if (second !== lastSecond) {
      lastSecond = second;
      const sample = sunForLocation(layout.origin, epochMs);
      const light = solarLighting(sample);
      state.direction.fromArray(sample.direction);
      state.elevationDeg = sample.elevationDeg;
      state.daylight = sample.daylight;
      state.cloudColor.set(light.cloudColor);
      state.reflectionTint.set(light.reflectionTint);
      if (scene.userData.windowNight) scene.userData.windowNight.value = sample.night;
      ambient.color.set(light.ambientColor);
      ambient.intensity = light.ambientIntensity;
      hemisphere.color.set(light.hemisphereSkyColor);
      hemisphere.groundColor.set(light.hemisphereGroundColor);
      hemisphere.intensity = light.hemisphereIntensity;
      sun.color.set(light.sunColor);
      sun.intensity = light.sunIntensity;
      sun.position.copy(bounds.center).addScaledVector(state.direction, 460);
      disk.material.color.copy(sun.color);
      edgeEffect.setSky(light.skyColor, light.fogColor);
    }
    const physical = 1 - (scene.userData.virtuality || 0);
    if (camera) disk.position.copy(camera.position).addScaledVector(state.direction, 410);
    disk.material.opacity = physical * THREE.MathUtils.smoothstep(state.elevationDeg, -.83, .8);
    if (state.daylight === 0 || physical < .65) return;
    if (!geometryChanged && lastDepthDirection.dot(state.direction) >= minDirectionDot) return;
    geometryChanged = false;
    lastDepthDirection.copy(state.direction);
    sun.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const view = sun.shadow.camera;
    viewBounds.makeEmpty();
    for (const corner of bounds.corners) viewBounds.expandByPoint(point.copy(corner).applyMatrix4(view.matrixWorldInverse));
    view.left = viewBounds.min.x; view.right = viewBounds.max.x;
    view.bottom = viewBounds.min.y; view.top = viewBounds.max.y;
    view.near = Math.max(1, -viewBounds.max.z); view.far = -viewBounds.min.z;
    view.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    state.shadowUpdates++;
  }
  return {update, refreshGeometry, dispose() { sun.shadow.dispose(); }};
}
