import * as THREE from "./vendor/three.module.js";
import { facadeSpec } from "./models.js";

function texture(width, height, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const output = new THREE.CanvasTexture(canvas);
  output.colorSpace = THREE.SRGBColorSpace;
  output.wrapS = THREE.RepeatWrapping;
  output.wrapT = THREE.RepeatWrapping;
  output.anisotropy = 4;
  return output;
}

// Scanned mineral surfaces use one colour texture and one linear data texture.
export function createSurfaceLibrary() {
  const loader = new THREE.TextureLoader();
  const images = new Map();
  const tiles = new Map();
  const finishes = new Map();
  const relief = {
    brick: .012, plaster: .007, concrete: .014, asphalt: .018, soil: .031, bark: .025, paint: .005,
    'roof-felt': .018, 'roof-zinc': .042, 'roof-coping': .019,
  };
  const metalness = { paint: .13, 'roof-zinc': .28, 'roof-coping': .34 };
  return function surface(name, repeatX = 1, repeatY = 1, color = 0xffffff) {
    const tileKey = `${name}/${repeatX}/${repeatY}`;
    if (!tiles.has(tileKey)) {
      const load = suffix => {
        const file = `${name}-${suffix}.webp`;
        let image = images.get(file);
        if (!image) {
          image = {ready:false, waiting:[]};
          images.set(file,image);
          const url = new URL('./assets/surfaces/' + file, import.meta.url);
          image.source = loader.load(url.href, () => {
            image.ready = true;
            for (const view of image.waiting) view.needsUpdate = true;
            image.waiting.length = 0;
          }).source;
        }
        // Three shares the GPU image of matching samplers. Each material keeps
        // its own repeat transform, including views created before the image loads.
        const map = new THREE.Texture();
        map.source = image.source;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(repeatX, repeatY);
        map.anisotropy = 4;
        map.colorSpace = suffix === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        if (image.ready) map.needsUpdate = true;
        else image.waiting.push(map);
        return map;
      };
      tiles.set(tileKey, { map: load('color'), detail: load('surface') });
    }
    const key = `${tileKey}/${color}`;
    if (!finishes.has(key)) {
      const {map, detail} = tiles.get(tileKey);
      finishes.set(key, new THREE.MeshStandardMaterial({
        color, map, bumpMap: detail, bumpScale: relief[name], roughnessMap: detail,
        roughness: name === 'paint' ? .77 : 1, metalness: metalness[name] || 0,
      }));
    }
    return finishes.get(key);
  };
}

export function createFacadeMaterial(id, surface) {
  const spec = facadeSpec(id);
  return spec.kind === 'brick' ? surface('brick') : surface('plaster', 1, 1, spec.baseColor);
}

// A single linear atlas represents rooms at different depths behind the glass.
// The window frames stay on the facade when the viewing angle changes.
export function createApartmentInteriors() {
  const cell = 64;
  const atlas = texture(cell * 4, cell * 4, ctx => {
    for (let index = 0; index < 16; index++) {
      ctx.save();
      ctx.translate(index % 4 * cell, Math.floor(index / 4) * cell);
      ctx.beginPath(); ctx.rect(0, 0, cell, cell); ctx.clip();
      const daylight = ctx.createLinearGradient(0, 0, cell, cell);
      daylight.addColorStop(0, '#bcbcbc'); daylight.addColorStop(1, '#545454');
      ctx.fillStyle = daylight; ctx.fillRect(0, 0, cell, cell);
      ctx.fillStyle = '#424242';
      ctx.fillRect(15 + index * 7 % 28, 15 + index % 5, 10 + index % 6, 54);
      ctx.fillStyle = '#666'; ctx.fillRect(0, 50 + index % 8, cell, 14);
      if (index % 4 === 0) {
        const drop = 17 + index * 3;
        ctx.fillStyle = '#c1c1c1'; ctx.fillRect(0, 0, cell, drop);
        ctx.fillStyle = '#777'; for (let y = 2; y < drop; y += 4) ctx.fillRect(0, y, cell, 1);
      } else {
        for (const right of [false, true]) {
          const breadth = 8 + (index * (right ? 9 : 5)) % 17;
          for (let s = 0; s < breadth; s++) {
            const value = Math.round(170 + 36 * Math.cos(s * .93 + index));
            ctx.fillStyle = `rgb(${value} ${value} ${value} / .88)`;
            ctx.fillRect(right ? cell - s - 1 : s, 0, 1, cell - 3 - (s % 6 === 0 ? 1 : 0));
          }
        }
      }
      ctx.restore();
    }
  });
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  return atlas;
}

export function createWindowMaterial(environment, interiors, night, kind = 'cross', tint = 0xffffff) {
  // All panes share one courtyard probe. Painted frames and mullions have a
  // black specular mask, keeping their diffuse paint intact as the viewer moves.
  const material = new THREE.MeshPhongMaterial({
    color: tint, envMap: environment, combine: THREE.MixOperation,
    reflectivity: 0.34, specular: 0x252b2d, shininess: 72,
  });
  material.customProgramCacheKey = () => 'apartment-interior-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.roomAtlas = { value: interiors };
    shader.uniforms.roomNight = night;
    shader.vertexShader = 'varying vec2 roomUv; varying float roomSeed;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      mat4 paneWorld = modelMatrix;
      #ifdef USE_INSTANCING
        paneWorld *= instanceMatrix;
      #endif
      vec3 paneCenter = paneWorld[3].xyz;
      vec3 eye = normalize(cameraPosition - paneCenter);
      roomUv = clamp(uv + .13 * vec2(dot(normalize(paneWorld[0].xyz), eye), eye.y), .018, .982);
      vec3 unit = floor(paneCenter / vec3(2.8, 2.6, 2.8));
      roomSeed = fract(sin(dot(unit, vec3(13.31, 7.9, 37.71))) * 4387.27);`);
    shader.fragmentShader = 'varying vec2 roomUv; varying float roomSeed; uniform sampler2D roomAtlas; uniform float roomNight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float tile = floor(roomSeed * 16.);
      float room = texture2D(roomAtlas, (vec2(mod(tile, 4.), floor(tile / 4.)) + roomUv) * .25).r;
      diffuseColor.rgb *= mix(1., .58 + .51 * room, specularStrength);
      vec3 lamp = mix(vec3(.86,.48,.23), vec3(.54,.64,.71), fract(roomSeed * 37.));
      totalEmissiveRadiance += lamp * room * room * specularStrength * roomNight * step(.63, roomSeed) * .78;
      specularStrength *= mix(1., .075, roomNight);`);
  };
  if (kind === 'pane') return material;
  const cross = kind === 'cross';
  const width = cross ? 256 : 192, height = 256;
  function paintFrames(context, color) {
    context.fillStyle = color;
    if (cross) {
      context.strokeStyle = color;
      context.lineWidth = 10;
      context.strokeRect(6, 6, width - 12, height - 12);
      context.fillRect(width / 2 - 3, 11, 6, height - 22);
      context.fillRect(11, height / 2 - 3, width - 22, 6);
    } else {
      if (kind === 'casement') context.fillRect(width * 0.58, 8, 6, height - 16);
      context.fillRect(8, height * (kind === 'stair' ? 0.28 : 0.22), width - 16, 5);
    }
  }
  const inset = cross ? 11 : 8;
  material.map = texture(width, height, context => {
    if (cross) {
      context.fillStyle = "#26373f";
      context.fillRect(0, 0, width, height);
      const light = context.createLinearGradient(0, 0, width, height);
      light.addColorStop(0, "rgba(192, 215, 222, 0.75)");
      light.addColorStop(0.48, "rgba(78, 108, 122, 0.15)");
      light.addColorStop(1, "rgba(15, 29, 36, 0.52)");
      context.fillStyle = light;
      context.fillRect(11, 11, width - 22, height - 22);
    } else {
      context.fillStyle = '#dbd8ce';
      context.fillRect(0, 0, width, height);
      const glass = context.createLinearGradient(0, 0, width, height);
      glass.addColorStop(0, '#89938e');
      glass.addColorStop(0.42, '#586561');
      glass.addColorStop(1, '#273435');
      context.fillStyle = glass;
      context.fillRect(8, 8, width - 16, height - 16);
      context.fillStyle = '#d8d4c238';
      context.fillRect(width * 0.72, 16, width * 0.18, height - 30);
      context.fillStyle = '#fff5';
      context.fillRect(10, 10, 2, height - 20);
    }
    paintFrames(context, cross ? '#ded9d1' : '#d9d8d0');
  });
  material.specularMap = texture(width, height, context => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#fff';
    context.fillRect(inset, inset, width - 2 * inset, height - 2 * inset);
    paintFrames(context, '#000');
  });
  material.specularMap.colorSpace = THREE.NoColorSpace;
  return material;
}

export function createBalconyMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xa8aaa5, roughness: 0.72, metalness: 0.18 });
}
