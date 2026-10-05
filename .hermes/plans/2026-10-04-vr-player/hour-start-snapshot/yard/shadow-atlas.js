import * as THREE from "./vendor/three.module.js";

// Precomputed light-space depth, NOT per-object UV lightmaps. No render target,
// scene rasterization or shadow-map generation occurs in this runtime module.
export function isBakedReceiver(mesh) {
  return mesh.isMesh && mesh.name !== "music-logo" &&
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => !m.wireframe && (!m.transparent || m.opacity === 1));
}

export async function loadBakedShadows(scene, preset) {
  const mobile = globalThis.matchMedia?.('(max-width: 800px), (pointer: coarse)').matches;
  const base = new URL(mobile ? './data/shadows/mobile/' : './data/shadows/', import.meta.url);
  const response = await fetch(new URL('manifest.json', base), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Baked shadow manifest ${response.status}`);
  const manifest = await response.json();
  const entry = manifest.presets[preset.presetIndex ?? 0];
  if (!entry || entry.sunVectorXYZ.some((n, i) => Math.abs(n - preset.sunVectorXYZ[i]) > 1e-6)) {
    throw new Error('Baked shadow sun mismatch: rebuild offline assets');
  }
  const imageResponse = await fetch(new URL(entry.file, base), { signal: AbortSignal.timeout(15000) });
  if (!imageResponse.ok) throw new Error(`Baked shadow texture ${imageResponse.status}`);
  const imageUrl = URL.createObjectURL(await imageResponse.blob());
  let texture;
  try { texture = await new THREE.TextureLoader().loadAsync(imageUrl); }
  finally { URL.revokeObjectURL(imageUrl); }
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  // PNG rows were explicitly flipped from WebGL readback by the offline baker.
  texture.flipY = true;
  const uniforms = {
    bakedDepth: { value: texture },
    bakedMatrix: { value: new THREE.Matrix4().fromArray(entry.matrix) },
    bakedTexel: { value: 1 / manifest.resolution },
    bakedBias: { value: 0.018 / entry.depthRange },
  };
  const patched = new Set();
  let receivers = 0;
  scene.traverse(mesh => {
    if (!isBakedReceiver(mesh)) return;
    receivers++;
    mesh.userData.bakedShadowReceiver = true;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (patched.has(material)) continue;
      patched.add(material);
      const original = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        original.call(material, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'uniform mat4 bakedMatrix; varying vec4 vBakedCoord;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
          vec4 bakedWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            bakedWorld = instanceMatrix * bakedWorld;
          #endif
          vBakedCoord = bakedMatrix * modelMatrix * bakedWorld;`);
        shader.fragmentShader = `uniform sampler2D bakedDepth;
          uniform float bakedTexel; uniform float bakedBias; varying vec4 vBakedCoord;
          float bakedVisibility() {
            vec3 q = vBakedCoord.xyz / vBakedCoord.w;
            // Derivatives must run before divergent frustum tests and outside light loops.
            // A fixed determinant cutoff depends on screen distance/DPR: it switches
            // correction off near the camera, producing a camera-following acne patch.
            vec3 dx = dFdx(q), dy = dFdy(q);
            dx /= max(length(dx.xy), 1e-20);
            dy /= max(length(dy.xy), 1e-20);
            float det = dx.x * dy.y - dx.y * dy.x;
            vec2 gradient = abs(det) > 1e-7 ? vec2(dy.y*dx.z-dx.y*dy.z, dx.x*dy.z-dy.x*dx.z)/det : vec2(0.0);
            if (any(lessThan(q, vec3(0.0))) || any(greaterThan(q, vec3(1.0)))) return 1.0;
            float lit = 0.0;
            for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
              vec2 uv = q.xy + vec2(float(x),float(y))*bakedTexel;
              vec2 center = (floor(uv / bakedTexel)+0.5)*bakedTexel;
              float receiverDepth = q.z + dot(gradient, center-q.xy);
              float depth = dot(textureLod(bakedDepth, uv, 0.0).rgb, vec3(65536.0,256.0,1.0)) * (255.0/16777215.0);
              lit += step(receiverDepth-bakedBias, depth);
            }
            return lit / 9.0;
          }\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\nfloat bakedLightVisibility = bakedVisibility();');
        if (material.isMeshBasicMaterial) {
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= mix(0.65, 1.0, bakedLightVisibility);\n#include <opaque_fragment>');
        } else {
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= bakedLightVisibility;'));
        }
      };
      material.customProgramCacheKey = () => 'offline-depth-v1';
      material.needsUpdate = true;
    }
  });
  const state = { kind: 'precomputed-projected-depth', presetIndex: entry.presetIndex,
    texture, receivers, materialCount: patched.size, entry,
    gpuBytes: manifest.resolution ** 2 * 4, residentSets: 1,
    dispose() { texture.dispose(); } };
  scene.userData.bakedLighting = state;
  return state;
}
