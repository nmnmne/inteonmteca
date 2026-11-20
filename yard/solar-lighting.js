import * as THREE from './vendor/three.module.js';
import { solarLighting, sunForLocation } from './solar-clock.js';
import { isBakedReceiver } from './shadow-atlas.js';
import { addSolarPenumbra } from './sun-penumbra.js';
import { createCourtyardSky } from './sky.js';
import { addEntranceLighting } from './entrance-lighting.js';

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
  const points = [];
  const include = ([x,z], height = 0) => {
    const p = new THREE.Vector3(x,height,z);
    points.push(p);
    box.expandByPoint(p);
  };
  for (const point of layout.walkable) include(point);
  for (const building of [...layout.buildings, ...(layout.utilityStructures || [])]) {
    for (const point of building.footprint) {
      include(point);
      include(point, building.heightM || 6);
    }
  }
  return {center:box.getCenter(new THREE.Vector3()), points};
}

// Each depth pass sees the entire physical block, so changing camera position
// or flying up onto a roof can reuse the same GPU texture.
export function createSolarLighting(renderer, yard, layout, {mapSize, sampleSun = sunForLocation} = {}) {
  const { scene, edgeEffect } = yard;
  const ambient = scene.children.find(o => o.isAmbientLight);
  const hemisphere = scene.children.find(o => o.isHemisphereLight);
  const sun = scene.children.find(o => o.isDirectionalLight);
  const bounds = shadowBounds(layout);
  const viewBounds = new THREE.Box3(), point = new THREE.Vector3();
  const lastDepthDirection = new THREE.Vector3();
  const projectionScale = {value:new THREE.Vector3(1,1,1)};
  const patchedMaterials = new WeakSet();
  const state = scene.userData.solarLighting = {
    direction:new THREE.Vector3(), cloudColor:new THREE.Color(), reflectionTint:new THREE.Color(),
    receivers:0, shadowUpdates:0, mapSize:0, elevationDeg:0, daylight:0,
  };
  const disk = solarDisk();
  const sky = createCourtyardSky(scene);
  const entranceLights = addEntranceLighting(scene,layout);
  scene.add(disk);
  sun.target.position.copy(bounds.center);
  sun.target.updateMatrixWorld();
  sun.castShadow = true;
  sun.shadow.normalBias = .022;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  let geometryChanged = true, lastSample = NaN;

  function setQuality(level, compact) {
    const size = Math.min(renderer.capabilities.maxTextureSize, mapSize ||
      (compact || level <= 3 ? 1024 : level >= 7 ? 2048 : 1536));
    if (size === state.mapSize) return;
    state.mapSize = size;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    geometryChanged = true;
  }
  setQuality(Number(document.documentElement.dataset.graphicsLevel) || 5,
    matchMedia('(max-width: 800px), (pointer: coarse)').matches);

  function refreshGeometry() {
    let receivers = 0;
    scene.traverse(mesh => {
      if (!isBakedReceiver(mesh)) return;
      mesh.receiveShadow = true;
      mesh.castShadow = mesh.userData.bakedShadowCaster !== false;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (patchedMaterials.has(material)) continue;
        patchedMaterials.add(material);
        addSolarPenumbra(material, projectionScale);
      }
      receivers++;
    });
    state.receivers = receivers;
    geometryChanged = true;
  }
  refreshGeometry();

  function update(epochMs, camera) {
    const tick = Math.floor(epochMs / 125);
    if (tick !== lastSample) {
      lastSample = tick;
      const sample = sampleSun(layout.origin, epochMs);
      const light = solarLighting(sample);
      sky.setLight(light, sample);
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
    sky.setPhysical(physical);
    entranceLights(scene.userData.windowNight?.value || 0,physical);
    if (camera) disk.position.copy(camera.position).addScaledVector(state.direction, 410);
    disk.material.opacity = physical * THREE.MathUtils.smoothstep(state.elevationDeg, -.83, .8);
    if (state.daylight === 0 || physical < .65) return;
    // A roof shadow crosses the pavement faster with the sun near the horizon.
    // Keep those steps smaller; high sun and lower quality reuse more frames.
    const lowMap = state.mapSize <= 1024;
    const angle = THREE.MathUtils.lerp(lowMap ? .055 : .03, lowMap ? .12 : .08,
      THREE.MathUtils.smoothstep(state.elevationDeg, 4, 25));
    const minDirectionDot = Math.cos(THREE.MathUtils.degToRad(angle));
    if (!geometryChanged && lastDepthDirection.dot(state.direction) >= minDirectionDot) return;
    geometryChanged = false;
    lastDepthDirection.copy(state.direction);
    sun.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const view = sun.shadow.camera;
    viewBounds.makeEmpty();
    for (const vertex of bounds.points) viewBounds.expandByPoint(point.copy(vertex).applyMatrix4(view.matrixWorldInverse));
    // Fit the actual roof heights. Eight metres of margin cover trees and
    // street furniture, including at the walkable perimeter.
    viewBounds.expandByScalar(8);
    const scale = viewBounds.getSize(projectionScale.value);
    // Lock the courtyard origin to a texel centre. This keeps small features
    // near the opening view from swimming as the fitted light frustum rotates.
    point.set(0,0,0).applyMatrix4(view.matrixWorldInverse);
    const texelX = scale.x/state.mapSize, texelY = scale.y/state.mapSize;
    view.left = point.x - (Math.floor((point.x-viewBounds.min.x)/texelX) + .5)*texelX;
    view.bottom = point.y - (Math.floor((point.y-viewBounds.min.y)/texelY) + .5)*texelY;
    view.right = view.left + scale.x; view.top = view.bottom + scale.y;
    view.near = Math.max(1, -viewBounds.max.z); view.far = -viewBounds.min.z;
    scale.z = view.far - view.near;
    sun.shadow.bias = -.012/scale.z;
    view.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    state.shadowUpdates++;
  }
  return {update, setQuality, refreshGeometry, dispose() { sun.shadow.dispose(); }};
}
