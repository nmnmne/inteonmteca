import * as THREE from "./vendor/three.module.js";
import { createApartmentInteriors, createBalconyMaterial, createFacadeMaterial, createSurfaceLibrary, createWindowMaterial } from "./material-textures.js";

function canvasTexture(width, height, paint, { srgb = true, repeat = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createYardMaterials() {
  const surface = createSurfaceLibrary();
  const utility = canvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = "#9b9b91";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(71, 72, 68, 0.32)";
    context.lineWidth = 4;
    for (let x = 8; x < width; x += 64) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    const grime = context.createLinearGradient(0, height * 0.65, 0, height);
    grime.addColorStop(0, "rgba(92, 89, 79, 0)");
    grime.addColorStop(1, "rgba(84, 77, 66, 0.32)");
    context.fillStyle = grime;
    context.fillRect(0, height * 0.65, width, height * 0.35);
  }, { repeat: true });

  const bakedShadow = canvasTexture(512, 512, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    const gradient = context.createRadialGradient(width / 2, height / 2, width * 0.06, width / 2, height / 2, width * 0.5);
    gradient.addColorStop(0, "rgba(18, 22, 20, 0.46)");
    gradient.addColorStop(0.44, "rgba(18, 22, 20, 0.23)");
    gradient.addColorStop(1, "rgba(18, 22, 20, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }, { srgb: false });

  const tiled = (texture, width, height, tileW, tileH) => {
    const map = texture.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(width / tileW, height / tileH);
    map.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map });
  };

  const facades = new Map();
  const photoWindows = new Map();
  const flatMaterials = new Map();
  const environment = new THREE.TextureLoader().load(new URL('./assets/window-probe.jpg', import.meta.url).href);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  const interiors = createApartmentInteriors();
  const windowNight = { value: 0 };
  const windowMaterial = createWindowMaterial(environment, interiors, windowNight);
  const balconyMaterial = createBalconyMaterial();
  let roofing;
  let asphalt;

  return {
    windowNight,
    brickWall(width, height) {
      return surface('brick', width / 2.08, height / .6);
    },
    facade(id) {
      if (!facades.has(id)) facades.set(id, createFacadeMaterial(id, surface));
      return facades.get(id);
    },
    window() {
      return windowMaterial;
    },
    photoWindow(kind = 'casement', tint = 0xffffff) {
      const key = `${kind}:${tint}`;
      if (!photoWindows.has(key)) photoWindows.set(key, createWindowMaterial(environment, interiors, windowNight, kind, tint));
      return photoWindows.get(key);
    },
    balcony() {
      return balconyMaterial;
    },
    soil(width, height) {
      return surface('soil', width / 1.3, height / 1.3);
    },
    concrete(width, height) {
      return surface('concrete', width / 2, height / 2);
    },
    asphalt() {
      if (!asphalt) {
        // All pavement meshes use (x,-z) metre UVs so cracks cross road
        // junctions and entrance paths without restarting at their edges.
        asphalt = surface('asphalt', 1/4.04, 1/4.04);
        const wear = new THREE.TextureLoader().load(new URL('./assets/surfaces/asphalt-wear.webp',import.meta.url).href);
        wear.wrapS = wear.wrapT = THREE.RepeatWrapping;
        wear.repeat.set(1/16, 1/16);
        wear.anisotropy = 4;
        asphalt.aoMap = wear;
        asphalt.aoMapIntensity = .28;
        asphalt.bumpScale = .035;
        asphalt.onBeforeCompile = shader => {
          // One macro sample supplies cavity depth, tar repairs and abrasion.
          // The existing scanned aggregate keeps its independent 4.04 m scale.
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
            vec3 wear = texture2D(aoMap, vAoMapUv).rgb;
            diffuseColor.rgb *= vec3(.41,.44,.49) * (.70 + .66*wear.b)
                              * mix(.20,1.,wear.r) * (1. - .48*wear.g);
            float pavementHeight = .16*wear.r + .035*wear.g;`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
              roughnessFactor = mix(roughnessFactor,.53,wear.g);`)
            .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
              'dHdxy_fwd()', 'dHdxy_fwd() + vec2(dFdx(pavementHeight),dFdy(pavementHeight))'))
            .replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment.replace(
              'texture2D( aoMap, vAoMapUv ).r','wear.r'));
        };
        asphalt.customProgramCacheKey = () => 'courtyard-cracked-asphalt';
      }
      return asphalt;
    },
    roofs() {
      if (!roofing) {
        // Metre UVs keep the same strip width on the tower and the smaller roofs.
        roofing = {
          felt: surface('roof-felt', 1 / 8, 1 / 3.76, 0xb5b4b3),
          flat: surface('roof-felt', 1 / 8, 1 / 3.76, 0xf4f5f3),
          metal: surface('roof-zinc', 1 / 2.04, 1 / 2.76, 0xd1d5d2),
          red: surface('roof-zinc', 1 / 2.04, 1 / 2.76, 0xe68265),
          parapet: surface('roof-coping', 1 / 3.2, 1 / .8),
        };
        for (const material of Object.values(roofing)) material.side = THREE.DoubleSide;
      }
      return roofing;
    },
    utility(width, height) {
      return tiled(utility, width, height, 2.4, 2.8);
    },
    bakedShadow(opacity = 0.12) {
      return new THREE.MeshBasicMaterial({
        map: bakedShadow,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    },
    mineral(color) {
      return surface('plaster', 1, 1, color);
    },
    bark() {
      const map = canvasTexture(256,256,(ctx,width,height) => {
        let seed = 723;
        const random = () => ((seed = (Math.imul(1664525,seed)+1013904223) >>> 0) / 4294967296);
        ctx.fillStyle = '#cfc9b6';
        ctx.fillRect(0,0,width,height);
        for (let i=0; i<330; i++) {
          const x=random()*width, y=random()*height;
          const length=2+random()**2*38, thick=.5+random()**3*4;
          ctx.fillStyle = i%6 === 0 ? '#59554b' : i%3 === 0 ? '#aaa38f' : '#e5ddca';
          for (const dx of [x-width,x]) {
            ctx.beginPath();
            ctx.moveTo(dx,y); ctx.lineTo(dx+.65*length,y-thick);
            ctx.lineTo(dx+length,y+.4*thick); ctx.lineTo(dx+.3*length,y+.3*thick);
            ctx.fill();
          }
        }
      },{repeat:true});
      return new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.013,roughness:.94});
    },
    paintedMetal(color) {
      return surface('paint', 1, 1, color);
    },
    flat(color) {
      if (!flatMaterials.has(color)) flatMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
      return flatMaterials.get(color);
    },
  };
}
