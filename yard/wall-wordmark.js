import * as THREE from './vendor/three.module.js';

// The wall is filmed in perspective. Paint the original alpha mask on a
// transparent decal, then composite the live title's own effect layers into it.
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

// CSS positions a percentage background within the space left after sizing it.
// These two conversions also handle the pixel coordinates of fullscreen shards.
function cssSize(value, span) {
  return value.endsWith('%') ? parseFloat(value) * span / 100 : parseFloat(value);
}

function cropStart(position, tile, background) {
  return -cssSize(position, tile - background);
}

export function createWallWordmark() {
  const wrap = document.getElementById('logo-wrap');
  const liveView = Boolean(wrap || document.getElementById('yard-view'));
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const stamp = canvas(), face = canvas(), white = canvas();
  const backdrop = stencil(), mural = canvas(muralWidth, muralHeight);
  const paintMural = mural.getContext('2d');
  const chip = new Path2D('M-8 2l5-4 11-1-5 4z');
  const ink = stamp.getContext('2d'), ctx = face.getContext('2d');
  const map = new THREE.CanvasTexture(mural);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(8.2 * muralWidth / width, 1.65 * muralHeight / height),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  logo.name = 'music-logo';
  logo.userData.bakedShadowCaster = false;
  let image, theme, lastFrame = -1;
  const moonInk = new THREE.Color(0x96acb9), sunInk = new THREE.Color(0xffffff);

  function tint() {
    ink.clearRect(0, 0, width, height);
    ink.drawImage(image, 0, 0, width, height);
    const gradient = ink.createLinearGradient(0, 0, width, height);
    const stops = wrap?.querySelectorAll('#logo-core-gradient stop');
    if (stops?.length) {
      for (const stop of stops) gradient.addColorStop(stop.offset.baseVal, getComputedStyle(stop).stopColor);
    } else {
      for (const [offset, color] of fallbackStops) gradient.addColorStop(offset, color);
    }
    ink.globalCompositeOperation = 'source-in';
    ink.fillStyle = gradient;
    ink.fillRect(0, 0, width, height);
    ink.globalCompositeOperation = 'source-over';
  }

  // Ripples and filaments extend past the heading. Sample the part that
  // actually falls onto the wordmark, also for the full-screen dissolve.
  function overlay(layer, bounds, opacity) {
    if (!layer?.width || !bounds?.width) return;
    const r = layer.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ctx.globalAlpha = opacity;
    ctx.drawImage(layer, (r.x-bounds.x)*width/bounds.width, (r.y-bounds.y)*height/bounds.height,
      r.width*width/bounds.width, r.height*height/bounds.height);
  }

  function drawShards(layer, bounds, fullscreen = false) {
    const box = layer.getBoundingClientRect();
    const layerStyle = getComputedStyle(layer);
    if (!box.width || !box.height || layerStyle.visibility === 'hidden') return;
    const scaleX = box.width / layer.clientWidth, scaleY = box.height / layer.clientHeight;
    // A storm travels across the viewport. Map that flight span onto the wall
    // decal so even its most distant pieces remain part of the projection.
    const travelX = fullscreen ? bounds.width / box.width : 1;
    const travelY = fullscreen ? bounds.height / box.height : 1;
    const alpha = Number(layerStyle.opacity);
    ctx.save();
    ctx.scale(width / bounds.width, height / bounds.height);
    ctx.translate(box.left - bounds.left, box.top - bounds.top);
    ctx.scale(scaleX, scaleY);
    for (const tile of layer.children) {
      const style = getComputedStyle(tile);
      const opacity = alpha * Number(style.opacity);
      if (opacity < .008) continue;
      const w = parseFloat(style.width), h = parseFloat(style.height);
      const [sizeX, sizeY] = style.backgroundSize.split(' ');
      const bgW = cssSize(sizeX, w), bgH = cssSize(sizeY, h);
      if (!(bgW > 0 && bgH > 0)) continue;
      const source = style.filter.includes('brightness(0)') ? white : image;
      const sx = source.width / bgW, sy = source.height / bgH;
      const m = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(parseFloat(style.left) + w / 2, parseFloat(style.top) + h / 2);
      ctx.transform(m.a, m.b, m.c, m.d, m.e * travelX, m.f * travelY);
      ctx.drawImage(source, cropStart(style.backgroundPositionX, w, bgW) * sx,
        cropStart(style.backgroundPositionY, h, bgH) * sy, w * sx, h * sy, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  function paint(now, animate) {
    if (!image) return;
    const currentTheme = document.documentElement.dataset.theme || '';
    if (theme !== currentTheme) { theme = currentTheme; tint(); }
    const time = animate ? now / 1000 : 0;
    const mode = animate && wrap ?
      wrap.dataset.mobileEffect || wrap.dataset.materialPreview || window.inteonHomeEffects?.active || '' : '';
    const bounds = animate && wrap ? wrap.getBoundingClientRect() : null;
    const storm = bounds?.width && wrap.classList.contains('is-rebuilding') && document.querySelector('.storm-inversion-shards');
    const shards = bounds?.width && (storm || wrap.querySelector('.mobile-logo-shards') ||
      (!wrap.classList.contains('is-assembled') && wrap.querySelector('#logo-particles')));
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    const alternate = wrap?.dataset.alternateLogo && wrap.querySelector('.alternate-base');
    if (alternate?.complete && alternate.naturalWidth) {
      ctx.drawImage(alternate, 0, 0, width, height);
    } else if (storm) {
      for (const rect of wrap.querySelectorAll('#logo-rebuild-clip rect')) {
        const x = rect.x.baseVal.value * width, y = rect.y.baseVal.value * height;
        const w = rect.width.baseVal.value * width, h = rect.height.baseVal.value * height;
        ctx.drawImage(stamp, x, y, w, h, x, y, w, h);
      }
      drawShards(storm, bounds, true);
    } else {
      const bass = animate ? Number(wrap?.style.getPropertyValue('--logo-bass')) || 0 : 0;
      if (shards) ctx.globalAlpha = Number(getComputedStyle(wrap.querySelector('.reactive-logo')).opacity);
      for (let y = 0; y < height; y += 4) {
        const shift = animate ? Math.sin(time * 1.4 + y * .053) * (1 + bass * 7) : 0;
        ctx.drawImage(stamp, 0, y, width, Math.min(4,height-y), shift, y, width, Math.min(4,height-y));
      }
      if (mode === 'recursion') {
        const echoes = wrap.querySelectorAll('.logo-material-preview g[transform]');
        for (const echo of echoes) {
          const transforms = echo.transform.baseVal;
          const scale = transforms.numberOfItems > 1 ? transforms.getItem(1).matrix.a : 1;
          ctx.globalAlpha = Number(echo.getAttribute('opacity')) || 0;
          ctx.drawImage(stamp, (1-scale)*width/2, (1-scale)*height/2, width*scale, height*scale);
        }
      }
      if (wrap?.classList.contains('is-acid') && animate) {
        ctx.clearRect(0,0,width,height);
        overlay(document.querySelector('canvas.logo-acid'), bounds, 1);
      } else if (bounds) {
        overlay(wrap.querySelector('.logo-ripples'), bounds, .75);
        overlay(wrap.querySelector('#logo-reactive-canvas'), bounds, .32);
        if (shards) drawShards(shards, bounds);
      }
    }
    ctx.globalAlpha = 1;
    paintMural.clearRect(0, 0, muralWidth, muralHeight);
    paintMural.drawImage(backdrop, 0, 0);
    flakes(paintMural, time, chip);
    paintMural.drawImage(face, insetX, insetY);
    map.needsUpdate = true;
  }

  new THREE.ImageLoader().load(new URL('../assets/logo-wordmark.svg', import.meta.url).href, loaded => {
    image = loaded;
    const mask = white.getContext('2d');
    mask.drawImage(image, 0, 0, width, height);
    mask.globalCompositeOperation = 'source-in';
    mask.fillStyle = '#fff';
    mask.fillRect(0, 0, width, height);
    paint(0, false);
    logo.userData.inkReady = true;
  });
  logo.onBeforeRender = (_renderer, scene, camera) => {
    logo.material.opacity = 1 - (scene.userData.virtuality || 0);
    const now = performance.now();
    if (!logo.material.opacity || camera.position.distanceToSquared(logo.position) > 65**2) return;
    logo.material.color.lerpColors(moonInk, sunInk, scene.userData.solarLighting?.daylight ?? 1);
    const animate = liveView && !still.matches;
    const frame = animate ? Math.floor(now / 85) : 0;
    if (frame === lastFrame && theme === (document.documentElement.dataset.theme || '')) return;
    lastFrame = frame;
    paint(now, animate);
  };
  return logo;
}
