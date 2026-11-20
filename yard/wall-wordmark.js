import * as THREE from './vendor/three.module.js';

// The wall is filmed in perspective. Paint the original alpha mask on a
// transparent decal, then composite the live title's own effect layers into it.
const width = 854, height = 172;
const fallbackStops = [[0,'#ded8b8'], [.23,'#bac48b'], [.42,'#d7b18a'], [.67,'#ba8158'], [.85,'#bec893'], [1,'#e0d4b2']];

function canvas() {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return el;
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
  const ink = stamp.getContext('2d'), ctx = face.getContext('2d');
  const map = new THREE.CanvasTexture(face);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.65),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  logo.name = 'music-logo';
  logo.userData.bakedShadowCaster = false;
  let image, theme, lastFrame = -1;

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
    const animate = liveView && !still.matches;
    const frame = animate ? Math.floor(now / 85) : 0;
    if (frame === lastFrame && theme === (document.documentElement.dataset.theme || '')) return;
    lastFrame = frame;
    paint(now, animate);
  };
  return logo;
}
