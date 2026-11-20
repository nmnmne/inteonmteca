import * as THREE from './vendor/three.module.js';
import {weatherFieldShader, weatherTexture, surfaceWeatherShader} from './weather-field.js';

// Roof UVs are in metres along the material strips. The basin field follows
// those strips, while the precipitation field stays in courtyard coordinates.
const roofSurface = `
  varying vec4 roofWorld;
  varying vec2 roofMetres;
  uniform float roofSeconds, roofCanPool;
  uniform vec3 roofSkyColor;
  ${weatherFieldShader}
  ${surfaceWeatherShader}

  float roofHash(vec2 cell) {
    vec3 h = fract(vec3(cell.xyx) * vec3(.1031,.1030,.0973));
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
  }
  float roofNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f*f*(3.-2.*f);
    return mix(mix(roofHash(cell),roofHash(cell+vec2(1,0)),f.x),
               mix(roofHash(cell+vec2(0,1)),roofHash(cell+vec2(1)),f.x),f.y);
  }
  vec2 roofRipple(vec2 p, float seconds) {
    vec2 cell = floor(p);
    vec2 center = .32+.36*vec2(roofHash(cell),roofHash(cell+17.));
    vec2 delta = fract(p)-center;
    float d = length(delta), age = fract(seconds*1.19+roofHash(cell+9.));
    float width = max(.028, fwidth(d));
    float deltaRadius = (d-age*.30)/width;
    float ring = deltaRadius * exp(-deltaRadius*deltaRadius) * (1.-age);
    return delta / max(d,.001) * ring * (1.-smoothstep(.04,.16,width));
  }`;

export function addRoofWetness(scene, palette, motion = matchMedia('(prefers-reduced-motion: reduce)')) {
  const weatherMap = {value:weatherTexture(THREE)};
  const seconds = {get value() { return motion.matches ? 0 : scene.userData.grassWind?.value || 0; }};
  const sky = {value:scene.background};
  for (const [kind, material] of Object.entries(palette)) {
    const previous = material.onBeforeCompile;
    const originalKey = material.customProgramCacheKey();
    material.onBeforeCompile = function(shader, renderer) {
      previous.call(this,shader,renderer);
      Object.assign(shader.uniforms, {weatherMap, roofSeconds:seconds, roofSkyColor:sky,
        roofCanPool:{value:kind === 'parapet' ? 0 : 1}});
      shader.vertexShader = 'varying vec4 roofWorld; varying vec2 roofMetres;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', `#include <begin_vertex>
        roofWorld = vec4((modelMatrix*vec4(transformed,1.)).xyz, normalize(mat3(modelMatrix)*normal).y);
        roofMetres = uv;`);
      shader.fragmentShader = roofSurface + '\n' + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float roofFilm=0., roofPool=0., roofSnow=0.;
          vec2 roofRipples=vec2(0.);
          if (roofWorld.w>.05 && gl_FrontFacing) {
            vec4 climate=weatherAt(roofWorld.xz,roofSeconds);
            vec2 stored=surfaceWeatherAt(roofWorld.xz,roofSeconds,climate);
            float exposure=clamp(roofWorld.w,0.,1.);
            vec2 p=roofMetres*vec2(.31,.53)+roofWorld.xz*.09;
            float relief=.73*roofNoise(p)+.27*roofNoise(p*2.37+13.);
            roofSnow=stored.y*exposure*smoothstep(.08,.66,stored.y+(.5-relief)*.38);
            roofFilm=clamp(.65*stored.x+.43*climate.r,0.,1.)*exposure*(1.-roofSnow);
            // Ponding is limited to the horizontal deck. Slopes drain and a
            // parapet cap has too little width to hold a pool of this scale.
            float fill=stored.x*.53-relief;
            roofPool=roofCanPool*step(.99999,roofWorld.w)*smoothstep(.09,.38,stored.x)
                     *smoothstep(-.028,.032,fill)*(1.-roofSnow);
            if (roofPool*climate.r>.015)
              roofRipples=roofRipple(roofWorld.xz*2.2,roofSeconds)*(roofPool*climate.r);
            diffuseColor.rgb*=mix(vec3(1.),vec3(.47,.54,.60),max(roofFilm,roofPool));
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.67,.73,.78)*(.92+.08*relief),roofSnow*.88);
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor, .27, roofFilm);
          roughnessFactor=mix(roughnessFactor, .075, roofPool);
          roughnessFactor=mix(roughnessFactor, .89, roofSnow);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 rippleNormal=(viewMatrix*vec4(roofRipples.x,0.,roofRipples.y,0.)).xyz;
          normal=normalize(mix(normal,nonPerturbedNormal,roofPool*.92)+.105*rippleNormal);`)
        .replace('#include <opaque_fragment>', `
          if (roofPool>0.) {
            vec3 eye=normalize(cameraPosition-roofWorld.xyz);
            vec3 waveNormal=normalize(vec3(.18*roofRipples.x,1.,.18*roofRipples.y));
            float incidence=clamp(dot(eye,waveNormal),0.,1.);
            float reflectance=.03+.88*pow(1.-incidence,5.);
            outgoingLight=mix(outgoingLight,roofSkyColor,roofPool*reflectance);
            // Ring crests catch diffuse skylight even away from the sun's glint.
            outgoingLight+=roofSkyColor*roofPool*(.20*length(roofRipples));
          }
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => originalKey + ':roof-weather';
    material.needsUpdate = true;
  }
}
