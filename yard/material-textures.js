import * as THREE from "./vendor/three.module.js";
import { facadeSpec } from "./models.js";

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hash(text) {
  return [...String(text)].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function rgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function shade(hex, amount) {
  const [red, green, blue] = rgb(hex);
  const channel = (value) => Math.max(0, Math.min(255, Math.round(value + amount)));
  return `rgb(${channel(red)}, ${channel(green)}, ${channel(blue)})`;
}

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

function facadeTexture(spec) {
  const random = seeded(hash(spec.id));
  const [tileWidth, tileHeight] = spec.tileM;
  const width = 768;
  const height = Math.max(256, Math.round(width * tileHeight / tileWidth));
  return texture(width, height, (context) => {
    context.fillStyle = spec.baseColor;
    context.fillRect(0, 0, width, height);

    if (spec.kind === "brick") {
      const columns = 8;
      const rows = 8;
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      context.fillStyle = spec.mortar || "#817a70";
      context.fillRect(0, 0, width, height);
      for (let row = 0; row < rows; row += 1) {
        const offset = row % 2 ? cellWidth / 2 : 0;
        for (let column = -1; column <= columns; column += 1) {
          context.fillStyle = shade(spec.baseColor, (random() - 0.5) * 18);
          context.fillRect(offset + column * cellWidth + 2, row * cellHeight + 2, cellWidth - 4, cellHeight - 4);
        }
      }
      context.fillStyle = "rgba(70, 62, 54, 0.08)";
      context.fillRect(0, height * 0.78, width, height * 0.22);
      return;
    }

    if (spec.kind === "masonry-panel") {
      const [red, green, blue] = rgb(spec.baseColor);
      const pixels = context.createImageData(width, height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const grain = Math.round((random() - 0.5) * 7);
        pixels.data[index] = Math.max(0, Math.min(255, red + grain));
        pixels.data[index + 1] = Math.max(0, Math.min(255, green + grain));
        pixels.data[index + 2] = Math.max(0, Math.min(255, blue + grain));
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      context.strokeStyle = "rgba(70, 67, 62, 0.18)";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, height - 3);
      context.lineTo(width, height - 3);
      context.moveTo(width - 3, 0);
      context.lineTo(width - 3, height);
      context.stroke();
      context.fillStyle = "rgba(88, 65, 52, 0.1)";
      context.fillRect(0, height * 0.84, width, height * 0.16);
      return;
    }

    if (spec.kind === "panel") {
      context.fillStyle = shade(spec.baseColor, -12);
      context.fillRect(0, 0, width, height);
      context.fillStyle = spec.baseColor;
      context.fillRect(4, 4, width - 8, height - 8);
      context.strokeStyle = "rgba(57, 58, 57, 0.4)";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, height - 4);
      context.lineTo(width, height - 4);
      context.moveTo(width * 0.5, 0);
      context.lineTo(width * 0.5, height);
      context.stroke();
      return;
    }

    const [red, green, blue] = rgb(spec.baseColor);
    const pixels = context.createImageData(width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const grain = Math.round((random() - 0.5) * 11);
      pixels.data[index] = Math.max(0, Math.min(255, red + grain));
      pixels.data[index + 1] = Math.max(0, Math.min(255, green + grain));
      pixels.data[index + 2] = Math.max(0, Math.min(255, blue + grain));
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    context.fillStyle = `${spec.accentColor || "#8b8277"}30`;
    context.fillRect(0, height * 0.82, width, height * 0.18);
  });
}

export function createFacadeMaterial(id) {
  const spec = facadeSpec(id);
  return new THREE.MeshStandardMaterial({
    map: facadeTexture(spec),
    roughness: spec.kind === "panel" ? 0.76 : 0.9,
    metalness: 0,
  });
}

export function createWindowMaterial() {
  return new THREE.MeshStandardMaterial({
    map: texture(256, 256, (context, width, height) => {
      context.fillStyle = "#26373f";
      context.fillRect(0, 0, width, height);
      const light = context.createLinearGradient(0, 0, width, height);
      light.addColorStop(0, "rgba(192, 215, 222, 0.75)");
      light.addColorStop(0.48, "rgba(78, 108, 122, 0.15)");
      light.addColorStop(1, "rgba(15, 29, 36, 0.52)");
      context.fillStyle = light;
      context.fillRect(11, 11, width - 22, height - 22);
      context.strokeStyle = "#ded9d1";
      context.lineWidth = 10;
      context.strokeRect(6, 6, width - 12, height - 12);
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(width / 2, 11);
      context.lineTo(width / 2, height - 11);
      context.moveTo(11, height / 2);
      context.lineTo(width - 11, height / 2);
      context.stroke();
    }),
    roughness: 0.32,
    metalness: 0.06,
  });
}

export function createPhotoWindowMaterial(kind = 'casement') {
  return new THREE.MeshStandardMaterial({
    map: texture(192,256,(ctx,w,h)=>{
      ctx.fillStyle='#dbd8ce';ctx.fillRect(0,0,w,h);
      const glass=ctx.createLinearGradient(0,0,w,h);glass.addColorStop(0,'#89938e');glass.addColorStop(.42,'#586561');glass.addColorStop(1,'#273435');
      ctx.fillStyle=glass;ctx.fillRect(8,8,w-16,h-16);
      ctx.fillStyle='#d9d8d0';
      if(kind==='casement')ctx.fillRect(w*.58,8,6,h-16);
      ctx.fillRect(8,h*(kind==='stair'?.28:.22),w-16,5);
      ctx.fillStyle='#d8d4c238';ctx.fillRect(w*.72,16,w*.18,h-30);
      ctx.fillStyle='#fff5';ctx.fillRect(10,10,2,h-20);
    }),roughness:.58,metalness:.02,
  });
}

export function createBalconyMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xa8aaa5, roughness: 0.72, metalness: 0.18 });
}
