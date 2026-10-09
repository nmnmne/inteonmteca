import * as THREE from './vendor/three.module.js';
import { lightingPresetForLayout } from './baked-lighting.js';
import { createWalkLightingTimeline } from './walk-lighting.js';
import { createShadowTransition } from './shadow-transition.js';

export function createLightingTransition(scene, layout, initial, clock) {
  const next = lightingPresetForLayout(layout, (initial.presetIndex + 1) % 12);
  const timeline = createWalkLightingTimeline(clock.enteredAt);
  const ambient = scene.children.find(light => light.isAmbientLight);
  const hemisphere = scene.children.find(light => light.isHemisphereLight);
  const sun = scene.children.find(light => light.isDirectionalLight);
  const colors = Object.fromEntries(['skyColor', 'fogColor', 'sunColor', 'ambientColor',
    'hemisphereSkyColor', 'hemisphereGroundColor'].map(key => [key, [new THREE.Color(initial[key]), new THREE.Color(next[key])]]));
  const fromSun = new THREE.Vector3(...initial.sunVectorXYZ);
  const toSun = new THREE.Vector3(...next.sunVectorXYZ);
  const edgeSky = new THREE.Color(0x050908), edgeFog = new THREE.Color(0x07100e);
  let shadows = null;
  let disposed = false;
  let lastMix = 0;
  let lastBoundary = null;
  let lastShadowStatus = 'idle';
  let availableProgress = null;
  const state = { fromIndex: initial.presetIndex, toIndex: next.presetIndex, progress: 0, mix: 0,
    holdUntil: timeline.holdUntil, deadline: clock.deadline, durationMs: 0, status: 'holding' };
  scene.userData.lightingTransition = state;
  const blendColor = (target, key, mix) => target.copy(colors[key][0]).lerp(colors[key][1], mix);
  function apply(mix) {
    blendColor(ambient.color, 'ambientColor', mix);
    blendColor(hemisphere.color, 'hemisphereSkyColor', mix);
    blendColor(hemisphere.groundColor, 'hemisphereGroundColor', mix);
    blendColor(sun.color, 'sunColor', mix);
    for (const [light, key] of [[ambient, 'ambientIntensity'], [hemisphere, 'hemisphereIntensity'], [sun, 'sunIntensity']]) {
      light.intensity = THREE.MathUtils.lerp(initial[key], next[key], mix);
    }
    sun.position.copy(fromSun).lerp(toSun, mix).normalize().multiplyScalar(84);
  }
  return {
    state,
    attach(atlas) {
      if (disposed) {
        atlas.dispose();
        atlas.texture = null;
        atlas.gpuBytes = 0;
        atlas.residentSets = 0;
        return;
      }
      shadows = createShadowTransition(scene, atlas, next);
    },
    update(now = Date.now()) {
      if (disposed) return false;
      const sample = timeline.sample(now, clock.deadline);
      Object.assign(state, sample);
      // Fetch only the next map, shortly before the hold ends. Short visits keep one.
      if (shadows && sample.durationMs > 0 && now >= timeline.holdUntil - 3000) shadows.prepare();
      const ready = shadows && ['ready', 'complete'].includes(shadows.metrics.status);
      const shadowStatus = shadows?.metrics.status || 'idle';
      const shadowChanged = shadowStatus !== lastShadowStatus;
      lastShadowStatus = shadowStatus;
      if (ready && availableProgress === null) availableProgress = sample.progress;
      // A slow connection must not cause a visible jump when the map arrives.
      // Use the remaining real clock interval, still reaching its same deadline.
      const visibleProgress = availableProgress === null ? 0 : sample.progress === 1 ? 1
        : Math.max(0, (sample.progress - availableProgress) / (1 - availableProgress));
      // Smoothstep has zero endpoint velocity; timing still comes solely from armReturn.
      const mix = ready ? visibleProgress ** 2 * (3 - 2 * visibleProgress) : lastMix;
      const changed = mix !== lastMix;
      if (changed) {
        shadows.setMix(mix);
        apply(mix);
        lastMix = mix;
      }
      // Use the explicit digital transition; fog range now expands to retain silhouettes.
      const boundary = THREE.MathUtils.clamp(scene.userData.virtuality ?? (90 - scene.fog.near) / 64, 0, 1) * 0.98;
      const boundaryChanged = boundary !== lastBoundary;
      if (changed || boundaryChanged) {
        blendColor(scene.background, 'skyColor', mix).lerp(edgeSky, boundary);
        blendColor(scene.fog.color, 'fogColor', mix).lerp(edgeFog, boundary);
        lastBoundary = boundary;
      }
      state.mix = mix;
      state.status = mix === 1 ? 'complete' : now <= timeline.holdUntil ? 'holding' : shadows?.metrics.status === 'unavailable' ? 'unavailable' : ready ? 'blending' : 'waiting';
      return changed || boundaryChanged || shadowChanged;
    },
    dispose() {
      disposed = true;
      shadows?.dispose();
      state.status = 'disposed';
    },
  };
}
