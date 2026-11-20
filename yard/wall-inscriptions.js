import * as THREE from './vendor/three.module.js';
import { lyricSheets } from './wall-lyrics.js';

// Metres in the wordmark plane. On this end wall the left corner is at -7.56,
// the right at +5.60 and the pavement is at -1.90. Leave the main letters free.
function handwritingPatches() {
  const patches = [], pigments = [0x262329,0x483233,0x29393d,0x403c35,0x49303f];
  let seed = 9137;
  const random = () => (seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  // Big marker strokes share the brickwork with narrow, tightly packed notes.
  // Give each run its own slope and spacing as it works around the wall fittings.
  for (let row=0, bottom=-1.83; bottom<13.85; row++) {
    const narrow = row%4 === 1;
    const band = narrow ? .22+random()*.08 : .40+random()*.17;
    const baseline = bottom + band/2, drift = random()*Math.PI*2;
    const slope = (random()-.5)*.07, tilt = (random()-.5)*.12;
    const besideLogo = Math.abs(baseline) < .86+band*.55;
    const logoMargin = 4.22, minWidth = .85;
    bottom += band*(.79+.17*random());
    for (let left=-7.44+random()*.22; left<5.40;) {
      // Use the short strip on either side of the signature, even if a full
      // line from this run would otherwise extend across the signature.
      if (besideLogo && left < logoMargin && -logoMargin-left < minWidth) left = logoMargin;
      const end = besideLogo && left < -logoMargin ? -logoMargin : 5.48;
      const w = Math.min(end-left, narrow ? .94+random()*.72 : 1.55+random()*1.31);
      if (w < minWidth) break;
      const h = band*(.84+random()*.29);
      const x = left+w/2;
      const y = baseline+.08*Math.sin(drift+x*.63)+slope*x*.40;
      const angle = tilt+(random()-.5)*.16;
      left += w+.015+random()*.13;
      const halfW = (w*Math.cos(angle)+h*Math.abs(Math.sin(angle)))/2;
      const halfH = (h*Math.cos(angle)+w*Math.abs(Math.sin(angle)))/2;
      if (x-halfW <= -7.54 || x+halfW >= 5.58 || y-halfH <= -1.88) continue;
      if (Math.abs(x)<4.15+halfW && Math.abs(y)<.86+halfH) continue;
      if (x-halfW < -6.69 && x+halfW > -7.34 && y-halfH < 3.10 && y+halfH > 2.30) continue;
      patches.push({x,y,w,h,angle,ink:pigments[Math.floor(random()*pigments.length)]});
    }
  }
  return patches;
}
const notes = handwritingPatches();
const lyrics = [...new Set(lyricSheets.flatMap(sheet=>sheet.lines))];
const tileByLine = new Map(lyrics.map((text,i)=>[text,i]));
const columns = 16, rows = Math.ceil(lyrics.length / columns);
export function wallLyricAt(slot, cycle) {
  // Every position visits every lyric sheet, then advances its line.
  const step = slot*5+cycle, sheetIndex = step%lyricSheets.length;
  const lines = lyricSheets[sheetIndex].lines;
  const lineIndex = (Math.floor(slot*lines.length/notes.length)+Math.floor(step/lyricSheets.length))%lines.length;
  return {text:lines[lineIndex],sheetIndex,lineIndex};
}

// The source PNG is painted by tools/bake-wall-lyrics.py. Each context keeps
// a single-channel ink texture. Tile selections change without re-uploading it.
function markerAtlas() {
  const map = new THREE.TextureLoader().load(new URL('./assets/wall-lyrics-ink.png',import.meta.url).href);
  map.format = THREE.RedFormat;
  map.anisotropy = 4;
  return map;
}

export function createWallInscriptions(liveView, still) {
  const points = [], uv = [], slot = [], colors = [], indices = [];
  notes.forEach(({x,y,w,h,angle,ink}, i) => {
    const c = Math.cos(angle), s = Math.sin(angle), color = new THREE.Color(ink);
    for (const [u,v] of [[0,0],[1,0],[1,1],[0,1]]) {
      const dx = (u-.5)*w, dy = (v-.5)*h;
      points.push(x+dx*c-dy*s, y+dx*s+dy*c, -.17);
      uv.push(u,v); slot.push(i); colors.push(color.r,color.g,color.b);
    }
    const a = i*4;
    indices.push(a,a+1,a+2,a,a+2,a+3);
  });
  const geometry = new THREE.BufferGeometry();
  for (const [name, values, size] of [['position',points,3],['uv',uv,2],['inscription',slot,1],['color',colors,3]]) {
    geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  }
  geometry.setIndex(indices);
  const tile = new THREE.Float32BufferAttribute(new Float32Array(notes.length*4),1);
  tile.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('lyricTile',tile);
  let previousTime=-1, nextChange=0;
  const current=[];
  function selectLyrics(seconds) {
    if (seconds>=previousTime && seconds<nextChange) return;
    previousTime=seconds;
    nextChange=Infinity;
    notes.forEach((_,n)=>{
      const period=23+(n*7)%17, offset=.19+(n*.38197%1)*.58;
      const cycle=Math.floor(seconds/period+offset);
      nextChange=Math.min(nextChange,(cycle+1-offset)*period);
      if (cycle===current[n]) return;
      current[n]=cycle;
      tile.array.fill(tileByLine.get(wallLyricAt(n,cycle).text),n*4,n*4+4);
    });
    tile.needsUpdate=true;
  }
  selectLyrics(0);
  const time = {value:0}, night = {value:0};
  const material = new THREE.MeshBasicMaterial({
    map:markerAtlas(), vertexColors:true, transparent:true, depthWrite:false, alphaTest:.012,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.inkTime = time;
    shader.uniforms.nightInk = night;
    shader.vertexShader = 'attribute float inscription, lyricTile; uniform float inkTime; varying vec4 inkState;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      float age = inkTime / (23.0 + mod(inscription*7.0, 17.0)) + .19 + fract(inscription*.38197)*.58;
      float phase = fract(age);
      float tile = lyricTile;
      inkState = vec4(mod(tile,${columns}.), ${rows-1}. - floor(tile/${columns}.),
        smoothstep(.005,.09,phase)*(1.-smoothstep(.9,.995,phase)), inscription*.797);`);
    shader.fragmentShader = 'uniform float inkTime, nightInk; varying vec4 inkState;\n'+shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb += vec3(.091,.101,.109)*nightInk;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 uv = vMapUv;
      float age = inkTime*.102 + inkState.w;
      float cycle = floor(age), pulse = fract(age);
      vec2 centre = vec2(.5+.28*sin(cycle*2.4+inkState.w), .48+.17*cos(cycle*1.7-inkState.w));
      vec2 delta = (uv-centre)*vec2(2.7,1.);
      float d = length(delta), radius = .015+.43*pulse;
      float ring = exp(-56.*abs(d-radius)) * sin(pulse*3.14159);
      uv += delta/max(d,.001)*ring*vec2(.016,.066);
      uv.y += .012*sin(uv.x*17.+inkTime*.42+inkState.w);
      float ink = texture2D(map,(inkState.xy+clamp(uv,vec2(.008,.035),vec2(.992,.965)))/vec2(${columns}.,${rows}.)).r;
      diffuseColor.a *= inkState.z * max(ink,ring*.16);
    `);
  };
  const mesh = new THREE.Mesh(geometry,material), born = performance.now();
  mesh.name = 'wall-marker-inscriptions';
  mesh.userData.bakedShadowCaster = false;
  mesh.userData.bakedShadowReceiver = false;
  mesh.onBeforeRender = (_renderer, scene) => {
    material.opacity = .81*(1-(scene.userData.virtuality || 0));
    night.value = 1-(scene.userData.solarLighting?.daylight ?? 1);
    time.value = liveView && !still.matches ? (performance.now()-born)/1000 : 0;
    if (material.opacity > .005) selectLyrics(time.value);
  };
  return mesh;
}
