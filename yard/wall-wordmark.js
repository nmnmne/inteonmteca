import * as THREE from './vendor/three.module.js';
import { createWallInscriptions } from './wall-inscriptions.js';
import { createWallLogoPaint, wallLogoFrame } from './wall-logo-effects.js';

// Keep a transparent masonry margin around the original printed wordmark.
const width = 854, height = 172;
const muralWidth = 1024, muralHeight = 256;
const insetX = (muralWidth - width) / 2, insetY = (muralHeight - height) / 2;
const fallbackStops = [[0,'#ded8b8'], [.23,'#bac48b'], [.42,'#d7b18a'], [.67,'#ba8158'], [.85,'#bec893'], [1,'#e0d4b2']];

function canvas(w = width, h = height) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return el;
}

// Broken survey lines trace the neighbouring blocks. Most of the wall, including
// the gaps between the stencils, stays transparent so its masonry shows through.
function stencil() {
  const layer = canvas(muralWidth, muralHeight);
  const ink = layer.getContext('2d');
  const strokes = [
    'M14 161l25-43 44-25 29-47 65-15 97 1 34-18 M43 123l36 8 31-12 18-19',
    'M34 194l31-48 53-6 30 17 M60 212l25-31 33-3 M91 219l27-13 38 1 16-10',
    'M130 65l22-22 58-6 33 9 58-4 M198 19l35-8 32 1 M336 25l43 6 49-13 34 4',
    'M459 223l34 6 63-12 27 5 M625 221l39 10 56-4 24 14 M765 218l56 3 33-14',
    'M777 39l43-13 51 6 24-15 M842 59l52-13 45 16 38 41 26 6 M923 87l21 17 27 1',
    'M905 169l30-9 23 8 20-14 21 6 M874 208l41-22 31 1 21-13 M915 219l31-12 20 3'
  ];
  ink.lineJoin = 'bevel';
  strokes.forEach((shape, i) => {
    const path = new Path2D(shape);
    ink.strokeStyle = '#18343f9c';
    ink.lineWidth = 3.4;
    ink.stroke(path);
    ink.strokeStyle = i % 3 ? '#a5d4cfb0' : '#b9acdbb0';
    ink.lineWidth = 1.45;
    ink.stroke(path);
  });
  // The half-tone patches belong to the paint rather than to a rectangular sign.
  for (const [cx, cy, angle] of [[91,93,-.4], [206,41,-.12], [886,47,.24], [922,174,-.32], [699,229,.13]]) {
    ink.save();
    ink.translate(cx, cy);
    ink.rotate(angle);
    for (let y = -2; y <= 2; y++) for (let x = -7; x <= 7; x++) {
      const density = 1 - (x / 8) ** 2 - (y / 3) ** 2;
      if (density <= 0) continue;
      ink.fillStyle = 'rgba(139,192,201,' + (.49 * density) + ')';
      ink.fillRect(x * 4 + (y % 2) * 1.6, y * 3.8, .8 + density, 1.15);
    }
    ink.restore();
  }
  return layer;
}

// Paint chips drift a few centimetres along the contours and back again.
// Positions are in mural pixels, independent of camera and frame rate.
const chips = [
  [34,138,1, .3], [72,105,.76, 1.9], [91,169,.68, 3.1], [126,60,1, 2.4],
  [185,31,.61, 4.2], [289,23,.82, 5.5], [399,24,.62, .7], [552,224,.80, 1.5],
  [676,229,1, 3.8], [810,30,.69, 1.4], [876,36,.95, 3], [928,78,.85, 4.8],
  [978,124,.85, 2.3], [939,165,.65, 5.4], [902,196,1, .9], [118,211,.80, 3.9]
];
function flakes(ctx, time, chip) {
  chips.forEach(([ax, ay, scale, phase], i) => {
    const t = time * (.48 + (i % 3) * .09) + phase;
    ctx.save();
    ctx.translate(ax + 7 * Math.sin(t), ay + 3.4 * Math.cos(t * .77));
    ctx.rotate(Math.sin(phase) * .43 + .17 * Math.sin(t));
    ctx.scale(scale, scale);
    ctx.fillStyle = i % 3 ? '#8cc6c3ac' : '#b2a5d0af';
    ctx.fill(chip);
    ctx.fillStyle = i % 3 ? '#d3f2e8' : '#e6d9ff';
    ctx.fillRect(-2, -.8, 4, .85);
    ctx.restore();
  });
}

export function createWallWordmark({ clock = () => performance.now() } = {}) {
  const wrap = document.getElementById('logo-wrap');
  const liveView = Boolean(wrap || document.getElementById('yard-view'));
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const smallDisplay = matchMedia('(max-width: 800px), (pointer: coarse)');
  const mural = canvas(muralWidth, muralHeight), ctx = mural.getContext('2d');
  const backdrop = stencil(), chip = new Path2D('M-8 2l5-4 11-1-5 4z');
  const map = new THREE.CanvasTexture(mural);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(8.2 * muralWidth / width, 1.65 * muralHeight / height),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  logo.name = 'music-logo';
  logo.userData.bakedShadowCaster = false;
  logo.add(createWallInscriptions(liveView, still));

  const moonInk = new THREE.Color(0x96acb9), sunInk = new THREE.Color(0xffffff);
  const born = clock(), loader = new THREE.ImageLoader();
  let brushes, theme, lastPaint = -Infinity, lastAnimated = false, disposed = false;
  map.addEventListener('dispose', () => { disposed = true; });
  const stillFrame = { name: 'still', elapsed: 0, progress: 0 };

  function paint(now, animate, low, currentTheme) {
    if (!brushes || disposed) return;
    if (theme !== currentTheme) {
      const stops = wrap?.querySelectorAll('#logo-core-gradient stop');
      const colors = stops?.length ? Array.from(stops, stop => [stop.offset.baseVal, getComputedStyle(stop).stopColor]) : fallbackStops;
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-rgb').trim();
      brushes.setPalette(colors, accent ? 'rgb(' + accent + ')' : '#c6d69f');
      theme = currentTheme;
    }
    const seconds = animate ? (now - born) / 1000 : 0;
    const cue = animate ? wallLogoFrame(seconds) : stillFrame;
    ctx.clearRect(0, 0, muralWidth, muralHeight);
    ctx.drawImage(backdrop, 0, 0);
    flakes(ctx, seconds, chip);
    ctx.save();
    ctx.translate(insetX, insetY);
    const bands = animate ? window.inteonAudioBands?.read() : null;
    const pointerX = parseFloat(wrap?.style.getPropertyValue('--logo-x')) || 0;
    const pointerY = parseFloat(wrap?.style.getPropertyValue('--logo-y')) || 0;
    brushes.paint(ctx, cue, seconds, {low, bass: bands?.bass || 0, mid: bands?.mid || 0,
      gazeX: .38 * Math.sin(seconds * .52) + pointerX / 18, gazeY: .35 * Math.cos(seconds * .34) + pointerY / 12});
    ctx.restore();
    map.needsUpdate = true;
    logo.userData.wallEffect = cue;
    lastAnimated = animate;
    lastPaint = now;
  }

  loader.load(new URL('../assets/logo-wordmark.svg', import.meta.url).href, image => {
    if (disposed) return;
    brushes = createWallLogoPaint(image, width, height);
    paint(clock(), false, true, document.documentElement.dataset.theme || '');
    logo.userData.inkReady = true;
    loader.load(new URL('../assets/logo-handwriting.svg', import.meta.url).href, handwriting => {
      if (disposed) return;
      brushes.setHandwriting(handwriting);
      logo.userData.handwritingReady = true;
    });
  });
  // Three calls this only for a visible frustum. A distant wall samples the
  // same score less often, without scheduling another animation loop.
  logo.onBeforeRender = (_renderer, scene, camera) => {
    logo.material.opacity = 1 - (scene.userData.virtuality || 0);
    logo.material.color.lerpColors(moonInk, sunInk, scene.userData.solarLighting?.daylight ?? 1);
    if (!logo.material.opacity || document.hidden || !brushes) return;
    const now = clock(), animate = !still.matches;
    const currentTheme = document.documentElement.dataset.theme || '';
    const far = camera.position.distanceToSquared(logo.position) > 65 ** 2;
    const low = smallDisplay.matches || far || Number(document.documentElement.dataset.graphicsLevel || 6) <= 3;
    const interval = far ? 450 : low ? 125 : 85;
    if (theme === currentTheme && lastAnimated === animate && (!animate || (now >= lastPaint && now - lastPaint < interval))) return;
    paint(now, animate, low, currentTheme);
  };
  return logo;
}
