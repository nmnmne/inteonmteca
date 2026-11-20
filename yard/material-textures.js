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
  const tiles = new Map();
  const finishes = new Map();
  const relief = { brick: .012, plaster: .007, concrete: .014, asphalt: .018, soil: .031, bark: .025, paint: .005 };
  return function surface(name, repeatX = 1, repeatY = 1, color = 0xffffff) {
    const tileKey = `${name}/${repeatX}/${repeatY}`;
    if (!tiles.has(tileKey)) {
      const load = suffix => {
        const url = new URL(`./assets/surfaces/${name}-${suffix}.webp`, import.meta.url);
        const map = loader.load(url.href);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(repeatX, repeatY);
        map.anisotropy = 4;
        map.colorSpace = suffix === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return map;
      };
      tiles.set(tileKey, { map: load('color'), detail: load('surface') });
    }
    const key = `${tileKey}/${color}`;
    if (!finishes.has(key)) {
      const {map, detail} = tiles.get(tileKey);
      finishes.set(key, new THREE.MeshStandardMaterial({
        color, map, bumpMap: detail, bumpScale: relief[name], roughnessMap: detail,
        roughness: name === 'paint' ? .77 : 1, metalness: name === 'paint' ? .13 : 0,
      }));
    }
    return finishes.get(key);
  };
}

export function createFacadeMaterial(id, surface) {
  const spec = facadeSpec(id);
  return spec.kind === 'brick' ? surface('brick') : surface('plaster', 1, 1, spec.baseColor);
}

export function createWindowMaterial(environment, kind = 'cross', tint = 0xffffff) {
  // All panes share one courtyard probe. Painted frames and mullions have a
  // black specular mask, keeping their diffuse paint intact as the viewer moves.
  const material = new THREE.MeshPhongMaterial({
    color: tint, envMap: environment, combine: THREE.MixOperation,
    reflectivity: 0.34, specular: 0x252b2d, shininess: 72,
  });
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
