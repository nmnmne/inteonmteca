const size = 128, cells = 5, periodMetres = 70;
const seasons = ['rain', 'snow', 'spring', 'summer', 'autumn'];
const modulo = (x, n) => ((x % n) + n) % n;

// A small seamless survey of climate islands. A blurred Voronoi edge lets the
// two neighbouring kinds of precipitation coexist across a few metres.
function bakeField() {
  const centres = [];
  let seed = 60213;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
    centres.push([x + .22 + random() * .56, z + .22 + random() * .56, (x + 2*z) % seasons.length]);
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + .5) * cells / size, z = (j + .5) * cells / size;
    let first = Infinity, second = Infinity, a, b;
    for (const [cx, cz, kind] of centres) {
      const dx = Math.abs(x-cx), dz = Math.abs(z-cz);
      const d = Math.min(dx,cells-dx)**2 + Math.min(dz,cells-dz)**2;
      if (d < first) { second = first; b = a; first = d; a = kind; }
      else if (d < second) { second = d; b = kind; }
    }
    const edge = Math.min(1, (Math.sqrt(second) - Math.sqrt(first)) / .34);
    const amount = Math.round(127.5 * (1 + edge * edge * (3 - 2 * edge)));
    const offset = (i + size*j) * 4;
    if (a < 4) pixels[offset+a] = amount;
    if (b < 4) pixels[offset+b] += 255 - amount;
  }
  return pixels;
}

let pixels, texture;
export function weatherTexture(THREE) {
  if (texture) return texture;
  pixels ??= bakeField();
  texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const weatherFieldShader = `
  uniform sampler2D weatherMap;
  vec4 weatherAt(vec2 p, float seconds) {
    vec2 q = vec2(p.x + .22*p.y, p.y - .18*p.x) / ${periodMetres.toFixed(1)};
    q += seconds * vec2(.008, .003) + .045 * vec2(sin(seconds*.033), cos(seconds*.026));
    return texture2D(weatherMap, q);
  }`;

// Moving fronts give every patch of ground a recent weather history, even
// before it first comes into view. Reuse the precipitation atlas so nearby
// roofs and lawns see the same rain, but keep their own drainage patterns.
export const surfaceWeatherShader = `
  vec2 surfaceWeatherAt(vec2 p, float seconds, vec4 climate) {
    vec2 previous = .46 * weatherAt(p, seconds - 5.).rg
                  + .34 * weatherAt(p, seconds - 14.).rg
                  + .20 * weatherAt(p, seconds - 29.).rg;
    float warm = 1. - climate.g;
    float melt = previous.g * warm * (.20 + .32 * climate.b + .20 * climate.r);
    float water = (.36 * climate.r + .64 * previous.r + melt)
                * (1. - .58 * climate.g) * (1. - .28 * climate.a);
    float snow = (.38 * climate.g + .62 * previous.g)
               * (1. - .48 * climate.a - .32 * climate.r);
    return clamp(vec2(water, snow), 0., 1.);
  }`;

// Sample the same RGBA field and bilinear filtering as the GPU. The implicit
// fifth channel is autumn. Callers can supply an output object per listener.
export function sampleWeather(x, z, seconds, out = {}) {
  pixels ??= bakeField();
  const u = ((x + .22*z)/periodMetres + seconds*.008 + .045*Math.sin(seconds*.033)) * size - .5;
  const v = ((z - .18*x)/periodMetres + seconds*.003 + .045*Math.cos(seconds*.026)) * size - .5;
  const x0 = Math.floor(u), z0 = Math.floor(v), fx = u-x0, fz = v-z0;
  const a = modulo(x0,size), b = modulo(z0,size);
  const i00 = (a + size*b)*4, i10 = (modulo(a+1,size) + size*b)*4;
  const i01 = (a + size*modulo(b+1,size))*4, i11 = (modulo(a+1,size) + size*modulo(b+1,size))*4;
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const lo = pixels[i00+k] * (1-fx) + pixels[i10+k]*fx;
    const hi = pixels[i01+k] * (1-fx) + pixels[i11+k]*fx;
    out[seasons[k]] = (lo * (1-fz) + hi*fz)/255;
    total += out[seasons[k]];
  }
  out.autumn = Math.max(0, 1-total);
  return out;
}
