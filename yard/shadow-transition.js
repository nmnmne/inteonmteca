import * as THREE from './vendor/three.module.js';
import { loadBakedShadows, isBakedReceiver } from './shadow-atlas.js';

// Reuse the restored loader and its exact receiver/PCF algorithm for both maps.
// No depth regeneration, ground masks, material clones or twelve-map cache.
export function createShadowTransition(scene, current, nextPreset, load = loadBakedShadows) {
  let disposed = false;
  let pending = null;
  let next = null;
  let uniforms = null;
  const patches = new Map();
  const owned = new Set([current.texture]);
  const bytesPerMap = current.gpuBytes;
  const metrics = { status: 'idle', nextIndex: nextPreset.presetIndex, mix: 0 };
  current.transition = metrics;
  const release = texture => {
    if (owned.delete(texture)) texture.dispose();
  };
  function patch() {
    uniforms = {
      bakedDepth: { value: current.texture },
      bakedMatrix: { value: new THREE.Matrix4().fromArray(current.entry.matrix) },
      bakedTexel: { value: 1 / current.texture.image.width },
      bakedBias: { value: 0.018 / current.entry.depthRange },
      nextBakedDepth: { value: next.texture },
      nextBakedMatrix: { value: new THREE.Matrix4().fromArray(next.entry.matrix) },
      nextBakedTexel: { value: 1 / next.texture.image.width },
      nextBakedBias: { value: 0.018 / next.entry.depthRange },
      bakedMix: { value: 0 },
    };
    scene.traverse(mesh => {
      if (!isBakedReceiver(mesh)) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (patches.has(material)) continue;
        const compile = material.onBeforeCompile;
        const cacheKey = material.customProgramCacheKey;
        patches.set(material, { compile, cacheKey });
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = 'uniform mat4 nextBakedMatrix; varying vec4 vNextBakedCoord;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            'vBakedCoord = bakedMatrix * modelMatrix * bakedWorld;',
            'vBakedCoord = bakedMatrix * modelMatrix * bakedWorld;\nvNextBakedCoord = nextBakedMatrix * modelMatrix * bakedWorld;');
          shader.fragmentShader = `uniform sampler2D nextBakedDepth;
            uniform float nextBakedTexel; uniform float nextBakedBias;
            uniform float bakedMix; varying vec4 vNextBakedCoord;\n` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('float bakedVisibility() {',
            'float sampleBakedVisibility(sampler2D bakedDepth, vec4 vBakedCoord, float bakedTexel, float bakedBias) {');
          shader.fragmentShader = shader.fragmentShader.replace('float bakedLightVisibility = bakedVisibility();', `
            float bakedLightVisibility = sampleBakedVisibility(bakedDepth, vBakedCoord, bakedTexel, bakedBias);
            // Uniform branch: derivatives remain outside divergent per-pixel tests.
            if (bakedMix > 0.0) {
              float nextVisibility = sampleBakedVisibility(nextBakedDepth, vNextBakedCoord, nextBakedTexel, nextBakedBias);
              bakedLightVisibility = mix(bakedLightVisibility, nextVisibility, bakedMix);
            }`);
        };
        material.customProgramCacheKey = () => `${cacheKey.call(material)}:walk-depth-blend-v1`;
        material.needsUpdate = true;
      }
    });
  }
  const api = {
    metrics,
    prepare() {
      if (disposed || pending) return pending;
      metrics.status = 'loading';
      // The empty scene asks the unchanged loader only to decode the next map.
      pending = load(new THREE.Scene(), nextPreset).then(loaded => {
        if (disposed) { loaded.dispose(); return; }
        next = loaded;
        owned.add(next.texture);
        patch();
        current.gpuBytes = bytesPerMap + next.gpuBytes;
        current.residentSets = 2;
        metrics.status = 'ready';
      }).catch(error => {
        if (disposed) return;
        if (next) release(next.texture);
        next = null;
        metrics.status = 'unavailable';
        metrics.error = String(error);
      });
      return pending;
    },
    setMix(value) {
      if (disposed || metrics.status !== 'ready') return false;
      const amount = THREE.MathUtils.clamp(value, 0, 1);
      const changed = amount !== metrics.mix;
      metrics.mix = amount;
      uniforms.bakedMix.value = amount;
      if (amount === 1) {
        const old = current.texture;
        current.texture = next.texture;
        current.entry = next.entry;
        current.presetIndex = next.presetIndex;
        uniforms.bakedDepth.value = next.texture;
        uniforms.bakedMatrix.value.copy(uniforms.nextBakedMatrix.value);
        uniforms.bakedTexel.value = uniforms.nextBakedTexel.value;
        uniforms.bakedBias.value = uniforms.nextBakedBias.value;
        uniforms.bakedMix.value = 0;
        next = null;
        release(old);
        current.gpuBytes = bytesPerMap;
        current.residentSets = 1;
        metrics.status = 'complete';
      }
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [material, original] of patches) {
        material.onBeforeCompile = original.compile;
        material.customProgramCacheKey = original.cacheKey;
      }
      patches.clear();
      for (const texture of owned) release(texture);
      if (uniforms) {
        uniforms.bakedDepth.value = null;
        uniforms.nextBakedDepth.value = null;
      }
      next = null;
      current.texture = null;
      current.residentSets = 0;
      current.gpuBytes = 0;
      metrics.status = 'disposed';
    },
  };
  current.dispose = api.dispose;
  return api;
}
