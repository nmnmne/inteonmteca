import * as THREE from './vendor/three.module.js';
import { weatherTexture, weatherFieldShader, surfaceWeatherShader } from './weather-field.js';
import { groundBasinGeometry } from './ground-basins.js';

// The grayscale shoreline and probe lookup use the same X/Z bounds as the
// walkable asphalt. Their top scanline is the north edge of the courtyard.
export function addPuddles(scene, layout, onReady = () => {}) {
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    weatherMap: { value: weatherTexture(THREE) }, shores: { value: null }, probes: { value: null }, panorama: { value: null },
    atlasGrid: { value: new THREE.Vector2() }, seconds: { value: 0 }, daylight: { value: 1 },
    reflectionTint: { value: new THREE.Color(0xffffff) },
    nightPanorama: { value:null }, nightMix: { value:0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, lights: true, transparent: true, depthWrite: false, visible: false,
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      varying vec2 mapUV, basin;
      varying vec3 surface;
      attribute vec2 basinProfile;
      void main() {
        basin = basinProfile;
        mapUV = vec2(uv.x, 1.0 - uv.y);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec3 transformedNormal = normalMatrix * normal;
        surface = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
        #include <shadowmap_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform sampler2D shores, probes, panorama, nightPanorama;
      uniform vec2 atlasGrid;
      uniform float seconds, daylight;
      uniform vec3 reflectionTint;
      uniform float nightMix;
      varying vec2 mapUV, basin;
      varying vec3 surface;
      const float pi = 3.14159265;
      ${weatherFieldShader}
      ${surfaceWeatherShader}
      vec3 radiance(float index, vec2 direction) {
        vec2 tile = vec2(mod(index, atlasGrid.x), floor(index / atlasGrid.x));
        // Keep linear filtering inside this probe's 512 by 128 texel tile.
        vec2 uv = clamp(direction, vec2(0.5/512.0, 0.5/128.0), vec2(1.0-0.5/512.0, 1.0-0.5/128.0));
        vec3 color = vec3(0.);
        if (nightMix < .999) color = texture2D(panorama, (tile + uv) / atlasGrid).rgb * reflectionTint;
        if (nightMix > .001) {
          vec2 nightUV=clamp(direction, vec2(.5/128.,.5/32.), vec2(1.-.5/128.,1.-.5/32.));
          color=mix(color,texture2D(nightPanorama,(tile + nightUV)/atlasGrid).rgb,nightMix);
        }
        return color;
      }
      void main() {
        if (daylight < .01) discard;
        float shore = texture2D(shores, mapUV).r;
        bool addedBasin = basin.y > .5;
        bool lawn = basin.y > 1.5;
        float depth = addedBasin ? basin.x : shore;
        if (depth < .04) discard;
        vec2 p = surface.xz;
        vec4 climate = weatherAt(p,seconds);
        vec2 reservoir = surfaceWeatherAt(p,seconds,climate);
        float fullness = reservoir.x;
        float waterline = mix(.88,.20,fullness);
        float wet = smoothstep(waterline,waterline+.15,depth) * smoothstep(.07,.45,fullness);
        // Road patches share the baked reflections. Draw a single sheet of
        // water where the new rut overlaps an existing asphalt pool.
        float baseWet = addedBasin && !lawn ? smoothstep(waterline,waterline+.15,shore) * smoothstep(.07,.45,fullness) : 0.;
        float mud = addedBasin ? smoothstep(.04,.26,depth)*(lawn ? .34 : .82) : 0.;
        mud *= mix(.46,1.,fullness)*(1.-.92*reservoir.y)*(1.-baseWet);
        wet *= (1.-baseWet)*(lawn ? .73 : 1.);
        if (max(wet,mud)<.009) discard;
        vec3 toEye = normalize(cameraPosition - surface);
        // Fine silt remains on the shoulder as the surrounding water recedes.
        float nearDetail = 1.-smoothstep(7.,21.,distance(cameraPosition,surface));
        float grain = sin(dot(p,vec2(17.9,9.3)))*cos(dot(p,vec2(11.7,-13.1)))*nearDetail;
        vec3 sediment = mix(vec3(.115,.070,.042),vec3(.045,.028,.018),fullness) * (1.+.14*grain);
        sediment *= mix(reflectionTint,vec3(.24,.32,.44),nightMix);
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHTS > 0
          sediment *= .65 + .35 * getShadowMask();
        #endif
        vec3 color = sediment;
        float opacity = mud;
        if (wet > .009) {
          // Barely disturb the reflection; shallow puddles reveal aggregate
          // underfoot and pick up the sky most strongly at a grazing angle.
          vec2 slope = vec2(sin(dot(p, vec2(4.1, 1.8)) + seconds * 0.48),
                            sin(dot(p, vec2(-2.4, 3.7)) - seconds * 0.38));
          float rain = climate.r;
          vec2 cell = p*2.8, ripple = fract(cell)-.5;
          float age = fract(seconds*1.22 + fract(sin(dot(floor(cell), vec2(17.13,43.37)))*341.531));
          float ring = length(ripple)-age*.49;
          slope += ripple * (rain*26.) * exp(-210.*ring*ring) * cos(41.*ring) * (1.-age);
          float detail = 1.0 - smoothstep(7.0, 35.0, distance(cameraPosition, surface));
          vec3 normal = normalize(vec3(slope.x * 0.003 * detail, 1.0, slope.y * 0.004 * detail));
          vec3 ray = reflect(-toEye, normal);
          vec2 direction = vec2(atan(ray.z, ray.x) / (2.0 * pi) + 0.5,
                                acos(clamp(ray.y, 0.0, 1.0)) / (pi * 0.5));
          vec3 selection = texture2D(probes, mapUV).rgb;
          vec3 light = mix(radiance(floor(selection.r * 255.0 + 0.5), direction),
                           radiance(floor(selection.g * 255.0 + 0.5), direction), selection.b);
          float grazing = pow(1.0 - max(dot(toEye, normal), 0.0), 3.0);
          float reflection = 0.22 + 0.73 * grazing;
          vec3 bedColor = addedBasin ? sediment : vec3(.040,.041,.033)*reflectionTint;
          vec3 waterColor = mix(bedColor, light, reflection);
          #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHTS > 0
            // The sky stays visible in shaded water. Direct sunlight reaches the
            // submerged asphalt and the ripple crests only through gaps in the yard.
            if (directionalLights[0].color.r > .001) {
              vec3 sun = inverseTransformDirection(directionalLights[0].direction, viewMatrix);
              float bed = max(sun.y, 0.0) * (1.0 - reflection);
              float alignment = max(dot(ray, sun), 0.0);
              float glint = pow(alignment, 320.0) * (.06 + .94 * grazing);
              waterColor += getShadowMask() * directionalLights[0].color
                     * (vec3(.047, .041, .030) * bed + .72 * glint);
            }
          #endif
          float waterAlpha = wet*(.52+.43*grazing);
          opacity = waterAlpha + mud*(1.-waterAlpha);
          color = (waterColor*waterAlpha + sediment*mud*(1.-waterAlpha)) / max(opacity,.001);
        }
        gl_FragColor = vec4(color, opacity*daylight);
        #include <colorspace_fragment>
      }`,
  });

  const geometry = groundBasinGeometry(layout);
  const water = new THREE.Mesh(geometry, material);
  water.name = 'courtyard-puddles';
  water.receiveShadow = true;
  water.userData.bakedShadowCaster = false;
  water.userData.bakedShadowReceiver = false;
  scene.add(water);

  const loader = new THREE.TextureLoader();
  let disposed = false;
  const ready = new Set();
  const textures = new Map();
  function load(name, filename, tileWidth = 0) {
    if (textures.has(name)) return;
    const texture = loader.load(new URL('./assets/' + filename, import.meta.url).href, image => {
      if (disposed) return;
      ready.add(name);
      if (tileWidth) uniforms.atlasGrid.value.set(image.image.width / tileWidth, image.image.height / (tileWidth / 4));
      syncMix();
      if (!material.visible && ready.has('probes') && ready.has('shores') && (ready.has('panorama') || ready.has('nightPanorama'))) {
        material.visible = true;
        onReady();
      }
    });
    texture.flipY = false;
    if (tileWidth) texture.colorSpace = THREE.SRGBColorSpace;
    if (name !== 'shores') {
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = name === 'probes' ? THREE.NearestFilter : THREE.LinearFilter;
    } else texture.anisotropy = 4;
    uniforms[name].value = texture;
    textures.set(name,texture);
  }
  function syncMix() {
    const night = scene.userData.windowNight?.value || 0;
    uniforms.nightMix.value = ready.has('nightPanorama') ? (ready.has('panorama') ? night : 1) : 0;
  }
  function selectLight() {
    const night = scene.userData.windowNight?.value || 0;
    if (night < .98) load('panorama', 'puddle-reflections.jpg', 512);
    if (night > .02) load('nightPanorama', 'puddle-reflections-night.jpg', 128);
    syncMix();
  }
  load('probes','puddle-probes.png');
  load('shores','puddle-shores.png');
  selectLight();
  material.addEventListener('dispose', () => {
    disposed = true;
    textures.forEach(texture => texture.dispose());
  });
  return seconds => {
    uniforms.seconds.value = motion?.matches ? 0 : seconds;
    uniforms.daylight.value = 1 - (scene.userData.virtuality || 0);
    if (scene.userData.solarLighting) uniforms.reflectionTint.value.copy(scene.userData.solarLighting.reflectionTint);
    if (!disposed) selectLight();
  };
}
