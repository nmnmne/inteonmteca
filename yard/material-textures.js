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
    roughness: 1,
    metalness: 0,
  });
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
