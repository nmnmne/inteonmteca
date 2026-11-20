// The surface has its own clock. The original header runs on DOM transitions,
// which stop when its window is hidden; a wall in the yard still has paint.
export const wallLogoScore = [
  { name: 'surface', duration: 4.8 },
  { name: 'scatter', duration: 4.2 },
  { name: 'handwriting', variant: 1, duration: 2.8 },
  { name: 'ripples', duration: 5.2 },
  { name: 'handwriting', variant: 3, duration: 2.8 },
  { name: 'recursion', duration: 6.5 },
  { name: 'handwriting', variant: 5, duration: 2.8 },
  { name: 'acid', duration: 11.6 },
  { name: 'handwriting', variant: 12, duration: 2.8 },
  { name: 'storm', duration: 12.8 },
  { name: 'handwriting', variant: 13, duration: 2.8 },
  { name: 'symbols', duration: 4.4 },
  { name: 'handwriting', variant: 16, duration: 2.8 },
  { name: 'spectral', duration: 4 },
  { name: 'handwriting', variant: 17, duration: 2.8 },
  { name: 'pixels', duration: 10 },
];
const period = wallLogoScore.reduce((sum, cue) => sum + cue.duration, 0);
const clamp = n => Math.min(1, Math.max(0, n));
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const fade = (t, length) => smooth(t / .35) * smooth((length - t) / .35);
const random = n => { const v = Math.sin(n * 78.233 + 31.14) * 43758.5453; return v - Math.floor(v); };

export function wallLogoFrame(seconds) {
  let elapsed = Math.max(0, seconds) % period;
  for (const cue of wallLogoScore) {
    if (elapsed < cue.duration) return { ...cue, elapsed, progress: elapsed / cue.duration };
    elapsed -= cue.duration;
  }
  return { ...wallLogoScore[0], elapsed: 0, progress: 0 };
}

// Authoring units of the original SVG. Draw at the decal's native resolution.
const W = 534, H = 107;
function layer(w, h) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return el;
}

function samplePigment(mask) {
  const probe = layer(W, H);
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0, W, H);
  // One read when the SVG loads. Both particle effects reuse the same contours.
  const data = ctx.getImageData(0, 0, W, H).data;
  const alpha = (x, y) => x >= 0 && x < W && y >= 0 && y < H ? data[(y * W + x) * 4 + 3] : 0;
  const edge = [], interior = [];
  for (let y = 1; y < H; y += 3) for (let x = 1; x < W; x += 3) {
    if (alpha(x, y) < 105) continue;
    const i = x + y * W;
    const point = { x, y, life: random(i), depth: .3 + .7 * random(i + .37), phase: 6.28 * random(i + .78) };
    interior.push(point);
    if (Math.min(alpha(x - 3, y), alpha(x + 3, y), alpha(x, y - 3), alpha(x, y + 3)) < 70) edge.push(point);
  }
  return { edge, interior };
}

function pigment(ctx, source, color) {
  const {width, height} = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
}

function makeTiles(cols, rows) {
  const tiles = [], w = W / cols, h = H / rows;
  const order = Array.from({length: cols * rows}, (_, i) => i).sort((a, b) => random(a) - random(b));
  for (let i = 0; i < order.length; i++) {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    const cell = order[i];
    const holes = Array.from({length: 3}, (_, j) => {
      const holeX = w * random(i + j + .18), holeY = h * random(i + j + .97);
      const path = new Path2D();
      for (let k = 0; k < 12; k++) {
        const angle = k * Math.PI / 6, r = 1 + .18 * Math.sin(k * 2.7 + holeX);
        if (k === 0) path.moveTo(r, 0);
        else path.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      path.closePath();
      return {x: x + holeX, y: y + holeY, size: .65 + .7 * random(i + j + .74), path};
    });
    tiles.push({ x, y, w, h, holes, dx: ((cell % cols) + .5) * w - (x + w / 2),
      dy: (Math.floor(cell / cols) + .5) * h - (y + h / 2),
      driftX: (random(i + .1) - .5) * 76, driftY: (random(i + .2) - .5) * 40,
      angle: (random(i + .3) - .5) * 1.68, delay: random(i + .4) });
  }
  return tiles;
}

// Same four veins and source contours as the pre-courtyard SVG, plus its
// broad noise grain. The static pigment and morphology rim are cached.
const veins = [
  'M-12 84C62 18 98 116 161 39S267 103 332 31 445 96 552 20',
  'M18 24C91 89 135 3 203 72S318 8 387 75 486 23 548 82',
  'M44 104C117 61 153 112 225 51S341 116 414 45 492 72 536 36',
  'M-8 52C80 44 102 65 184 48S304 65 390 41 486 58 552 49',
];

export function createWallLogoPaint(mask, width, height) {
  const base = layer(width, height), rim = layer(width, height), white = layer(width, height);
  const baseCtx = base.getContext('2d'), rimCtx = rim.getContext('2d');
  pigment(white.getContext('2d'), mask, '#f1f1de');
  const points = samplePigment(mask);
  const motes = Array.from({length: 52}, (_, i) => ({
    x: W * (.08 + random(i + 101.3) * .84), y: H * (.32 + random(i + 141.8) * .36),
    phase: random(i + 181.4) * Math.PI * 2, size: .35 + random(i + 221.9) * 1.45, band: i % 3,
  }));
  const smallTiles = makeTiles(9, 4), largeTiles = makeTiles(15, 6);
  const acidTexture = layer(width, height), acidCtx = acidTexture.getContext('2d');
  const sx = width / W, sy = height / H;
  const veinPaths = veins.map(d => new Path2D(d));
  const grains = layer(64, 64), grainCtx = grains.getContext('2d');
  const noise = grainCtx.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const v = random(i + 3) > .5 ? 255 : 24;
    noise.data.set([v, v, v, Math.floor(random(i + .26) * 45)], i * 4);
  }
  grainCtx.putImageData(noise, 0, 0);
  let handwriting = null;

  function setPalette(stops, accent) {
    const gradient = baseCtx.createLinearGradient(0, 8 * sy, width, 101 * sy);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    pigment(baseCtx, mask, gradient);
    baseCtx.save();
    baseCtx.globalCompositeOperation = 'source-atop';
    baseCtx.fillStyle = baseCtx.createPattern(grains, 'repeat');
    baseCtx.fillRect(0, 0, width, height);
    baseCtx.scale(sx, sy);
    baseCtx.strokeStyle = '#f1edc688';
    baseCtx.lineWidth = .95;
    for (const path of veinPaths) baseCtx.stroke(path);
    baseCtx.restore();
    rimCtx.clearRect(0, 0, width, height);
    for (const [x, y] of [[-1.35, 0], [1.35, 0], [0, -1.35], [0, 1.35]]) {
      rimCtx.drawImage(mask, x, y, width, height);
    }
    rimCtx.globalCompositeOperation = 'destination-out';
    rimCtx.drawImage(mask, 0, 0, width, height);
    rimCtx.globalCompositeOperation = 'source-in';
    rimCtx.fillStyle = accent;
    rimCtx.fillRect(0, 0, width, height);
    rimCtx.globalCompositeOperation = 'source-over';
  }

  function setHandwriting(image) {
    const hand = layer(width, height), lime = layer(width, height), warm = layer(width, height);
    hand.getContext('2d').drawImage(image, 0, 0, width, height);
    pigment(lime.getContext('2d'), image, '#caff57');
    pigment(warm.getContext('2d'), image, '#e9bb8e');
    handwriting = { hand, lime, warm };
  }

  function stamp(ctx, image, opacity = 1, dx = 0, dy = 0, zoom = 1) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(image, dx + (1 - zoom) * W / 2, dy + (1 - zoom) * H / 2, W * zoom, H * zoom);
  }

  function writeHand(ctx, cue) {
    const { hand, lime, warm } = handwriting;
    const mix = fade(cue.elapsed, cue.duration), variant = cue.variant;
    const baseOpacity = ({12: .82, 13: .93, 16: .95, 17: .91})[variant] ?? .96;
    stamp(ctx, base, 1 - mix);
    // The original handwriting was centred at 105% of the heading width.
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1.05, 1.05 * (111 / 536) / (H / W));
    ctx.translate(-W / 2, -H / 2);
    if (variant === 17) {
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(W * .38, H * .38);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      halo.addColorStop(0, '#caff5732'); halo.addColorStop(1, '#caff5700');
      ctx.globalAlpha = mix; ctx.fillStyle = halo;
      ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    if (variant === 3) stamp(ctx, lime, .62 * mix, .005 * W, -.015 * H);
    if (variant === 12) stamp(ctx, lime, .64 * mix, 0, 0, 1.018);
    if (variant === 17) stamp(ctx, lime, .32 * mix, .012 * W);
    const stripes = (image, alpha, y, h, dx, dy) => {
      ctx.globalAlpha = mix * alpha;
      ctx.drawImage(image, 0, y * height, width, h * height, dx * W, (y + dy) * H, W, h * H);
    };
    if (variant === 5) { stripes(lime, .68, .32, .20, -.008, .01); stripes(warm, .42, .61, .20, .008, -.02); }
    if (variant === 13) { stripes(lime, .62, .24, .12, .005, 0); stripes(warm, .4, .68, .17, -.005, -.01); }
    if (variant === 16) { stripes(hand, .4, .34, .19, -.008, .01); stripes(lime, .53, .62, .17, .008, -.02); }
    stamp(ctx, hand, baseOpacity * mix);
    ctx.restore();
  }

  function filaments(ctx, t, controls) {
    const {bass, mid, gazeX, gazeY, low} = controls;
    const signal = Math.min(1, Math.max(bass, mid));
    const px = W * (.5 + gazeX * .34), py = H * (.5 + gazeY * .28);
    const n = low ? 3 : 6;
    ctx.lineWidth = .42 + bass * 1.2;
    for (let s = 0; s < n; s++) {
      ctx.strokeStyle = s % 3 === 0 ? '#ccff69' : '#e07040';
      ctx.globalAlpha = .13 + signal * .25;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, x = W * (.08 + .84 * u), baseY = H * (.5 + (s - (n - 1) / 2) * .021);
        const y = baseY + Math.sin(u * Math.PI * (3 + s % 4) + t * (.35 + mid) + s) * (4 + bass * 18)
          + Math.sin(u * Math.PI * 11 + t * .62 + s * 2.1) * (1.2 + mid * 7)
          + Math.exp(-(((x - px) / (W * .19)) ** 2)) * (py - baseY) * .13;
        if (!k) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < motes.length; i += low ? 3 : 1) {
      const p = motes[i], energy = p.band ? mid : bass, orbit = t * (.18 + p.band * .12) + p.phase;
      const x = p.x + Math.cos(orbit) * (4 + energy * 20), y = p.y + Math.sin(orbit * 1.7) * (3 + energy * 13);
      const pull = Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (W * W * .035));
      ctx.fillStyle = p.band === 2 ? '#d6ff76' : '#efa868'; ctx.globalAlpha = .22 + energy * .45;
      ctx.fillRect(x + (px - x) * pull * .12, y + (py - y) * pull * .12, p.size, p.size);
    }
  }

  function contours(ctx, time, strength, low) {
    ctx.strokeStyle = '#c6c49c'; ctx.lineWidth = .45; ctx.globalAlpha = strength * .38;
    for (let line = 0; line < (low ? 2 : 4); line++) {
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const u = k / 30;
        const x = W * u, y = H * (.37 + line * .065) + Math.sin(u * Math.PI) *
          (Math.sin(u * 6 + time * .3 + line * .35) * 13 + Math.sin(u * 13 - time * .17) * 4);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const count = Math.min(points.edge.length, low ? 95 : 235);
    ctx.fillStyle = '#d3d4a7';
    for (let i = 0; i < count; i++) {
      const p = points.edge[Math.floor(points.edge.length * (i + .5) / count)];
      const age = (time * (.035 + p.depth * .012) + p.life) % 1;
      const lift = Math.sin(Math.PI * age);
      const curl = Math.sin(p.x * .018 + time * .37 + p.phase) * .6 + Math.sin(p.y * .055 - time * .23) * .4;
      const x = p.x + lift * (curl * 44 + Math.sin(age * 6 + p.phase) * 13) * p.depth;
      const y = p.y + lift * ((p.y < H / 2 ? -1 : 1) * (9 + p.depth * 14) + Math.sin(age * 7 + p.phase + time * .2) * 4);
      ctx.globalAlpha = strength * lift;
      ctx.fillRect(x, y, .7 + p.depth, .7 + p.depth);
      if (!low && i % 4 === 0) {
        ctx.globalAlpha *= .42; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - .09 * (x - p.x), y - 2, x - .14 * (x - p.x), y - .14 * (y - p.y));
        ctx.stroke();
      }
    }
  }

  function pixelField(ctx, cue, low) {
    const t = cue.elapsed, mix = fade(t, cue.duration);
    stamp(ctx, base, 1 - .84 * mix);
    const step = low ? 3 : 1;
    for (let i = 0; i < points.interior.length; i += step) {
      const p = points.interior[i], wave = (Math.sin(p.x * .025 + p.y * .038 - t * 1.8) + 1) / 2;
      const d = Math.abs(p.x / W - (t * .12) % 1), front = Math.exp(-Math.pow(Math.min(d, 1 - d) * 17, 2));
      const release = ((Math.sin(t * .9 + p.phase) + 1) / 2) ** 2 * (.22 + wave * .45 + front * .33);
      const x = p.x + (Math.sin(p.x * .032 + p.y * .027 - t * .8) * 4 + Math.sin(t * 2.6 * p.depth + p.phase) * 3) * release;
      const y = p.y + (Math.cos(p.x * .027 - t) * 3 + Math.cos(t * 2.1 + p.phase) * 2) * release;
      ctx.fillStyle = front > .65 ? '#f8ffe5' : p.life > .85 ? '#adc6bf' : '#dce0ba';
      ctx.globalAlpha = mix * (.5 + wave * .28 + front * .22);
      ctx.fillRect(x, y, 1.9 - release * .6, 1.9 - release * .6);
    }
  }

  function stormLine(ctx, t) {
    const flashes = Math.exp(-((t - 4.4) ** 2) * 24) + Math.exp(-((t - 5.35) ** 2) * 18) + Math.exp(-((t - 6.46) ** 2) * 18);
    if (flashes < .02) return;
    ctx.globalAlpha = Math.min(1, flashes); ctx.strokeStyle = '#eef4dd'; ctx.lineWidth = 1.15;
    for (let bolt = 0; bolt < 3; bolt++) {
      let x = W * (.19 + bolt * .3), y = -23;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let n = 0; n < 7; n++) {
        x += (random(n + bolt * 17) - .55) * 75; y += 19; ctx.lineTo(x, y);
        if (n === 2 || n === 3) { ctx.lineTo(x + 14, y - 2); ctx.lineTo(x + 25, y + 9); ctx.moveTo(x, y); }
      }
      ctx.stroke();
    }
  }

  function fragments(ctx, cue, low) {
    const tiles = low ? smallTiles : largeTiles;
    const t = cue.elapsed, acid = cue.name === 'acid', storm = cue.name === 'storm';
    // The old acid renderer bored holes in each rotated tile. Cut the atlas
    // once in source coordinates before applying the per-piece transforms.
    let source = base;
    if (acid && t > 3.1 && t < 9.8) {
      acidCtx.clearRect(0, 0, width, height); acidCtx.drawImage(base, 0, 0);
      acidCtx.save(); acidCtx.scale(sx, sy); acidCtx.globalCompositeOperation = 'destination-out';
      for (const tile of tiles) {
        const delay = tile.delay * .28, amount = clamp(((t - 3.1) / 5.9 - delay) / (1 - delay));
        const radius = amount * amount * Math.hypot(tile.w, tile.h) * .94;
        if (radius < .1) continue;
        acidCtx.save(); acidCtx.beginPath();
        acidCtx.rect(tile.x, tile.y, tile.w, tile.h); acidCtx.clip();
        for (const hole of tile.holes) {
          const size = radius * hole.size;
          acidCtx.setTransform(sx * size, 0, 0, sy * size, sx * hole.x, sy * hole.y);
          acidCtx.fill(hole.path);
        }
        acidCtx.restore();
      }
      acidCtx.restore(); source = acidTexture;
    }
    stamp(ctx, base, acid ? .14 + .86 * clamp((t - 9.8) / 1.8) : .14);
    if (acid && t >= 9.8) return;
    if (storm) stormLine(ctx, t);
    for (const tile of tiles) {
      let travel, dx, dy;
      if (storm) {
        travel = (1 - (1 - clamp(t / 4)) ** 3) * (1 - smooth((t - 9 - tile.delay * 2.2) / 1.6));
        dx = tile.dx * .98 + tile.driftX; dy = tile.dy + tile.driftY;
      } else if (acid) {
        travel = 1 - (1 - clamp(t / 2.3)) ** 3;
        dx = tile.driftX * .50; dy = tile.driftY * .68;
      } else {
        const f = cue.progress;
        travel = f < .32 ? smooth(f / .32) : f < .7 ? 1 - .2 * smooth((f - .32) / .38) : .8 * (1 - smooth((f - .7) / .3));
        dx = tile.dx * .3 + tile.driftX; dy = tile.dy * .4 + tile.driftY;
      }
      ctx.save();
      ctx.translate(tile.x + tile.w / 2 + dx * travel, tile.y + tile.h / 2 + dy * travel);
      ctx.rotate(tile.angle * travel);
      const scale = 1 - travel * tile.delay * .19;
      ctx.scale(scale, scale);
      ctx.globalAlpha = 1 - travel * (storm ? .08 : tile.delay * .25);
      ctx.drawImage(storm && travel > .01 ? white : source, tile.x * sx, tile.y * sy, tile.w * sx, tile.h * sy,
        -tile.w / 2, -tile.h / 2, tile.w + .06, tile.h + .06);
      ctx.restore();
    }
  }

  function paint(ctx, cue, time, controls) {
    const {low, bass, mid, gazeX, gazeY} = controls;
    ctx.save();
    ctx.scale(sx, sy);
    if (cue.name === 'still') { stamp(ctx, base); stamp(ctx, rim, .48); }
    else if (cue.name === 'handwriting' && handwriting) writeHand(ctx, cue);
    else if (['scatter', 'acid', 'storm'].includes(cue.name)) fragments(ctx, cue, low);
    else if (cue.name === 'pixels') pixelField(ctx, cue, low);
    else {
      if (cue.name === 'recursion') {
        for (let i = 0; i < (low ? 2 : 5); i++) {
          const p = clamp((cue.elapsed - i * .22) / (6.5 - i * .22));
          stamp(ctx, rim, Math.sin(Math.PI * p) ** 2 * .48, 0, 0, 1 + (1 - (1 - p) ** 2) * .35);
        }
      }
      const spectral = cue.name === 'spectral' ? Math.sin(Math.PI * cue.progress) : 0;
      const shift = 1.3 + spectral * 6 + mid * 3;
      stamp(ctx, rim, .43 + spectral * .32, -shift, .8);
      stamp(ctx, rim, .28 + spectral * .42, shift, -.65);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 24; i++) {
        const y = i * H / 24;
        const warp = Math.sin(time * 1.4 + i * .43) * (.55 + bass * 4 + spectral * 3) + Math.sin(i * 1.8 - time) * spectral * 2;
        ctx.drawImage(base, 0, y * sy, width, height / 24, warp, y, W, H / 24 + .12);
      }
      stamp(ctx, rim, .53);
      // Draw a moving light through the letters only, keeping masonry bare.
      const gx = W * (.5 + gazeX * .31), gy = H * (.5 + gazeY * .34);
      ctx.save(); ctx.beginPath(); ctx.rect(gx - 50, 0, 100, H); ctx.clip();
      // Paint onto a transparent isolated mask, so source-atop never samples
      // the surrounding graffiti already composited into the decal.
      acidCtx.clearRect(0, 0, width, height); acidCtx.drawImage(white, 0, 0);
      acidCtx.save(); acidCtx.scale(sx, sy); acidCtx.globalCompositeOperation = 'source-in';
      const gaze = acidCtx.createRadialGradient(gx, gy, 0, gx, gy, 50);
      gaze.addColorStop(0, '#e6ddae'); gaze.addColorStop(.28, '#bbcf8575'); gaze.addColorStop(1, '#30231200');
      acidCtx.fillStyle = gaze; acidCtx.fillRect(0, 0, W, H); acidCtx.restore();
      stamp(ctx, acidTexture, .63 + .2 * bass); ctx.restore();
      if (cue.name === 'ripples' || cue.name === 'surface' || cue.name === 'spectral') {
        contours(ctx, time, cue.name === 'ripples' ? .93 : .27 + mid * .27, low);
        filaments(ctx, time, controls);
      }
      if (cue.name === 'symbols') {
        const chars = '∴⌁+:·⧖Ξ≡∫<>/∷', word = 'inteonmteca';
        ctx.font = 'bold 66px monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        const wave = Math.sin(cue.progress * Math.PI) ** 2;
        ctx.globalAlpha = .36 * wave; ctx.fillStyle = '#d4eca9';
        const tick = Math.floor(time / .09);
        for (let i = 0; i < word.length; i++) {
          const glyph = random(tick + i * 11) < wave ? chars[Math.floor(random(tick + i + .7) * chars.length)] : word[i];
          ctx.fillText(glyph, (i + .5) * W / word.length, H * .54 + Math.sin(i + time) * 3);
        }
      }
    }
    ctx.restore();
  }
  return { paint, setPalette, setHandwriting };
}
