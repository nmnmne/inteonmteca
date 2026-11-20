/* A small glyph projection shares the text wave's clock, origin and pause rules. */
(() => {
  const width = 218, height = 104;
  const glyphs = '·:+=/\\<>⋮◇';
  const colors = ['#80dce9', '#c3aff6', '#dbfff3'];
  const sample = lines => {
    const points = [];
    for (const line of lines) {
      const vertices = line.split(' ').map(vertex => vertex.split(',').map(Number));
      let remainder = 0;
      for (let i = 1; i < vertices.length; i++) {
        const [x, y] = vertices[i - 1];
        const dx = vertices[i][0] - x, dy = vertices[i][1] - y;
        const length = Math.hypot(dx, dy);
        let step = remainder;
        for (; step < length; step += 4.1) {
          points.push({x: x + dx * step / length, y: y + dy * step / length, ink: points.length % glyphs.length});
        }
        remainder = step - length;
      }
    }
    return points;
  };
  // Outstretched primaries, a forked tail and the short, heavy crow's beak.
  const crow = sample([
    '57,63 21,74 41,57 8,62 42,46 11,47 47,33 26,32 55,23 77,28 107,49',
    '34,33 63,30 98,48 77,37 54,37 31,43',
    '31,53 65,41 90,48 67,47 47,59 75,49',
    '57,63 74,60 64,72 86,61 81,71 98,59 111,64',
    '108,48 136,27 161,19 200,24 176,27 209,32 183,35 203,41 177,40 194,48 166,44 180,53 152,47 137,54 122,59',
    '129,45 155,31 184,27 161,35 143,45 166,39 185,39',
    '100,52 109,48 117,48 124,53 139,56 127,59 119,58 109,66 91,75 69,83 82,71 62,79 79,62',
    '93,64 106,57 117,54'
  ]);
  const buildings = [];
  for (const [x, base, w, h] of [[16,65,25,25],[48,70,33,38],[87,74,28,54],[122,71,21,29],[151,65,30,42]]) {
    const p = (dx, dy) => (x + dx) + ',' + (base + dy);
    buildings.push([p(0,0),p(0,-h),p(w,-h-7),p(w+14,-h),p(w+14,0),p(w,7),p(0,0)].join(' '));
    buildings.push([p(0,-h),p(w,7-h),p(w+14,-h)].join(' '), [p(w,7-h),p(w,7)].join(' '));
    for (let floor = 9; floor < h - 3; floor += 9) buildings.push([p(3,-floor),p(w-3,5-floor)].join(' '));
  }
  buildings.push('7,73 86,94 201,67', '27,78 108,60 192,81');
  const motifs = [{name: 'crow', points: crow}, {name: 'city', points: sample(buildings)}];

  window.createStudioHolograms = studio => {
    const canvas = document.createElement('canvas');
    canvas.className = 'studio-projection';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.scale(ratio, ratio);
    // Pre-rasterize the ink once. Drawing a picture then only blits small tiles.
    const tile = 14, atlas = document.createElement('canvas');
    atlas.width = glyphs.length * tile * ratio; atlas.height = colors.length * tile * ratio;
    const ink = atlas.getContext('2d');
    ink.scale(ratio, ratio);
    ink.textAlign = 'center'; ink.textBaseline = 'middle'; ink.font = 'bold 8px monospace';
    ink.shadowColor = '#152a3b'; ink.shadowBlur = 1.5;
    colors.forEach((color, row) => {
      ink.fillStyle = color;
      [...glyphs].forEach((glyph, col) => ink.fillText(glyph, (col + .5) * tile, (row + .5) * tile));
    });
    studio.prepend(canvas);
    let motifIndex = -1, started = -Infinity, lastDraw = -Infinity, sleeping = true;
    const clear = () => {
      if (!sleeping) ctx.clearRect(0, 0, width, height);
      sleeping = true; started = -Infinity; lastDraw = -Infinity;
      canvas.hidden = true;
    };
    clear();
    return {
      seed(now, x, y) {
        if (now - started < 6800) return;
        const box = studio.getBoundingClientRect();
        if (!box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight) return;
        const size = Math.min(width, box.width * .55);
        const left = Math.max(0, Math.min(box.width - size, x - box.left - size * .28));
        const top = Math.max(0, Math.min(box.height - size * height / width, y - box.top - size * .24));
        canvas.style.width = size + 'px';
        canvas.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
        motifIndex = (motifIndex + 1) % motifs.length;
        canvas.dataset.motif = motifs[motifIndex].name; canvas.hidden = false;
        sleeping = false; started = now;
      },
      draw(now, mobile) {
        if (sleeping || now - lastDraw < (mobile ? 75 : 55)) return;
        lastDraw = now;
        const age = (now - started) / 1000;
        ctx.clearRect(0, 0, width, height);
        if (age > 4.8) { sleeping = true; canvas.hidden = true; return; }
        const sweep = age * 165 - 24;
        const fade = Math.max(0, Math.min(1, (4.8 - age) / 1.05));
        const scan = (age * 88) % (width + 45) - 20;
        const bird = motifIndex === 0, drift = Math.sin(age * 2) * 1.7;
        for (const point of motifs[motifIndex].points) {
          const reveal = Math.min(1, (sweep - point.x) / 22);
          if (reveal <= 0 || point.x < (age - 3.4) * 126) continue;
          const pulse = Math.max(0, 1 - Math.abs(point.x - scan) / 19);
          const row = pulse > .6 ? 2 : (point.x + point.y > 153 ? 1 : 0);
          const col = reveal < .6 ? 0 : (point.ink + Math.floor(age * 5)) % glyphs.length;
          const wing = bird ? Math.pow(Math.abs(point.x - 112) / 112, 1.3) * Math.sin(age * 5.6) * 8 : 0;
          ctx.globalAlpha = fade * reveal * (.62 + .38 * pulse);
          ctx.drawImage(atlas, col * tile * ratio, row * tile * ratio, tile * ratio, tile * ratio,
            point.x - tile / 2 + age * .8, point.y - tile / 2 + drift + wing, tile, tile);
        }
      },
      clear,
    };
  };
})();
