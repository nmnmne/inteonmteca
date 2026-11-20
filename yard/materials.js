import * as THREE from "./vendor/three.module.js";
import { createBalconyMaterial, createFacadeMaterial, createSurfaceLibrary, createWindowMaterial } from "./material-textures.js";

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
  const windowMaterial = createWindowMaterial(environment);
  const balconyMaterial = createBalconyMaterial();

  return {
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
      if (!photoWindows.has(key)) photoWindows.set(key, createWindowMaterial(environment, kind, tint));
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
    asphalt(width, height) {
      return surface('asphalt', width / 4.04, height / 4.04);
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
      return surface('bark', 1, 2);
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
