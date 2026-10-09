import * as THREE from "./vendor/three.module.js";
import { createBalconyMaterial, createFacadeMaterial, createWindowMaterial, createPhotoWindowMaterial } from "./material-textures.js";

const BRICK_W = 1.04;
const BRICK_H = 0.6;

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
  const brick = canvasTexture(512, 296, (context, width, height) => {
    context.fillStyle = "#8c847a";
    context.fillRect(0, 0, width, height);
    const cols = 8;
    const rows = 8;
    const gapX = 5;
    const gapY = 5;
    const brickW = (width - gapX) / cols;
    const brickH = (height - gapY) / rows;
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 ? brickW / 2 : 0;
      for (let col = -1; col < cols + 1; col += 1) {
        const tone = 196 + ((row * 3 + col * 5) % 7) * 4;
        context.fillStyle = `rgb(${tone}, ${tone - 8}, ${tone - 18})`;
        context.fillRect(offset + col * brickW + gapX / 2, row * brickH + gapY / 2, brickW - gapX, brickH - gapY);
      }
    }
  }, { repeat: true });

  const soil = canvasTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#6f6959";
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 1800; index += 1) {
      const x = (index * 137) % width;
      const y = (index * 71) % height;
      context.fillStyle = index % 5 ? "#626553" : "#82765f";
      context.fillRect(x, y, 1 + (index % 3), 1 + (index % 2));
    }
    context.strokeStyle = "rgba(86, 96, 67, .42)";
    context.lineWidth = 1;
    for (let index = 0; index < 140; index += 1) {
      const x = (index * 47) % width;
      const y = (index * 109) % height;
      context.beginPath();
      context.moveTo(x, y + 3);
      context.lineTo(x + ((index % 5) - 2), y - 4);
      context.stroke();
    }
  }, { repeat: true });

  const concrete = canvasTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#b7aa98";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#9c9182";
    context.lineWidth = 3;
    for (let index = 0; index < 6; index += 1) {
      context.beginPath();
      context.moveTo(0, 40 + index * 80);
      context.lineTo(width, 55 + index * 80);
      context.stroke();
    }
  }, { repeat: true });

  const asphalt = canvasTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#514f4b";
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 400; index += 1) {
      context.fillStyle = index % 2 ? "#464745" : "#615c54";
      context.fillRect((index * 47) % width, (index * 29) % height, 3, 2);
    }
  }, { repeat: true });

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
  const windowMaterial = createWindowMaterial();
  const balconyMaterial = createBalconyMaterial();

  return {
    brickWall(width, height) {
      return tiled(brick, width, height, BRICK_W, BRICK_H);
    },
    facade(id) {
      if (!facades.has(id)) facades.set(id, createFacadeMaterial(id));
      return facades.get(id);
    },
    window() {
      return windowMaterial;
    },
    photoWindow(kind='casement') {
      if(!photoWindows.has(kind))photoWindows.set(kind,createPhotoWindowMaterial(kind));
      return photoWindows.get(kind);
    },
    balcony() {
      return balconyMaterial;
    },
    soil(width, height) {
      return tiled(soil, width, height, 10, 10);
    },
    concrete(width, height) {
      return tiled(concrete, width, height, 3.2, 3.2);
    },
    asphalt(width, height) {
      return tiled(asphalt, width, height, 6, 6);
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
    flat(color) {
      if (!flatMaterials.has(color)) flatMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
      return flatMaterials.get(color);
    },
  };
}
