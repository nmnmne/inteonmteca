import * as THREE from './vendor/three.module.js';

// Four bilinearly weighted comparisons soften the contact edge. The full
// filter also uses the surrounding twelve texels to widen distant shadows.
const sunlightFilter = `
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
  uniform vec3 sunShadowScale; // light-space width, height and depth in metres
  uniform bool sunShadowCompact;

  float courtyardShadow(sampler2D depths, vec2 size, float intensity, float bias, float radius, vec4 coord) {
    vec3 q = coord.xyz / coord.w;
    vec3 dx = dFdx(q), dy = dFdy(q);
    dx /= max(length(dx.xy), 1e-20);
    dy /= max(length(dy.xy), 1e-20);
    float det = dx.x*dy.y - dx.y*dy.x;
    vec2 slope = abs(det) > 1e-7
      ? vec2(dy.y*dx.z-dx.y*dy.z, dx.x*dy.z-dy.x*dx.z)/det : vec2(0.);
    if (any(lessThan(q,vec3(0.))) || any(greaterThan(q,vec3(1.)))) return 1.;

    vec2 grid = q.xy*size - .5;
    vec2 f = fract(grid);
    vec2 depthStep = slope/size;
    if (sunShadowCompact) {
      vec2 texel = 1./size;
      vec2 origin = (floor(grid)+.5)*texel;
      vec4 depths4 = vec4(
        unpackRGBAToDepth(texture2D(depths,origin)),
        unpackRGBAToDepth(texture2D(depths,origin+vec2(texel.x,0.))),
        unpackRGBAToDepth(texture2D(depths,origin+vec2(0.,texel.y))),
        unpackRGBAToDepth(texture2D(depths,origin+texel)));
      float plane = q.z + bias - dot(depthStep,f);
      vec4 covered = step(depths4,plane+vec4(0.,depthStep.x,depthStep.y,depthStep.x+depthStep.y));
      return 1. - intensity*mix(mix(covered.x,covered.y,f.x),mix(covered.z,covered.w,f.x),f.y);
    }
    vec2 first = (floor(grid) - .5)/size;
    float z = q.z + bias - dot(depthStep, 1. + f);
    float gap = 0.;
    vec4 covered[4];
    for (int y=0; y<4; ++y) {
      vec4 delta;
      for (int x=0; x<4; ++x) {
        vec2 cell = vec2(float(x),float(y));
        // Compare against the receiver plane at the actual texel centre. A
        // single constant bias makes shallow morning light stripe the asphalt.
        delta[x] = z + dot(depthStep,cell) - unpackRGBAToDepth(texture2D(depths,first+cell/size));
      }
      covered[y] = step(vec4(0.),delta);
      gap = max(gap,max(max(delta.x,delta.y),max(delta.z,delta.w)));
    }
    // The solar disc has an angular radius of ~0.266 degrees. Convert its
    // spread at the blocker into texels on each axis of the fitted projection.
    vec2 width = min(vec2(2.), 1. + .00465*gap*sunShadowScale.z*size/sunShadowScale.xy);
    vec4 offsets = vec4(-1.,0.,1.,2.);
    vec4 wx = max(vec4(0.), 1.-abs(offsets-f.x)/width.x);
    vec4 wy = max(vec4(0.), 1.-abs(offsets-f.y)/width.y);
    wx /= dot(wx,vec4(1.));
    wy /= dot(wy,vec4(1.));
    return 1. - intensity*dot(wy,vec4(dot(wx,covered[0]),dot(wx,covered[1]),
                                      dot(wx,covered[2]),dot(wx,covered[3])));
  }
#endif
`;

const litFragment = THREE.ShaderChunk.lights_fragment_begin.replace(
  // Three keeps a directional light visible even at zero intensity.
  'directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap',
  'directLight.visible && receiveShadow && any(greaterThan(directLight.color,vec3(0.))) ) ? courtyardShadow( directionalShadowMap'
);

export function addSolarPenumbra(material, scale, compactFilter={value:false}) {
  if (!(material.isMeshLambertMaterial || material.isMeshStandardMaterial || material.isMeshPhongMaterial)) return;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  // Digital building materials can inherit an already-patched facade hook.
  if (key.includes(':solar-penumbra')) return;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.sunShadowScale = scale;
    shader.uniforms.sunShadowCompact = compactFilter;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + sunlightFilter)
      .replace('#include <lights_fragment_begin>', litFragment);
  };
  material.customProgramCacheKey = () => key + ':solar-penumbra';
  material.needsUpdate = true;
}
