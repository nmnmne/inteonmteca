import * as THREE from './vendor/three.module.js';
import { lyricSheets } from './wall-lyrics.js';
import { inkGroups, inkPasses, inkAtlasColumns, mixWallPhrase, wallEcho, wallTranslation } from './wall-ink-codec.js';
import { wallGraffiti, verticesPerInscription } from './wall-graffiti.js';

const artwork = wallGraffiti();
const lyrics = [...new Set(lyricSheets.flatMap(sheet=>sheet.lines))];
const columns = inkAtlasColumns, rows = Math.ceil(lyrics.length * inkPasses / columns);
let lastWall = null;

export function readWallInscription(index) {
  return lastWall?.userData.readInscription(index) ?? null;
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
  for (const ribbon of artwork.ribbons) {
    const color=new THREE.Color(ribbon.color), first=points.length/3;
    const columns=ribbon.points.length/2, start=ribbon.from ?? 0, end=ribbon.to ?? 1;
    for (let j=0; j<columns; j++) {
      const u=start+(end-start)*j/(columns-1);
      for (let side=0; side<2; side++) {
        const [x,y]=ribbon.points[j*2+side];
        points.push(x,y,-.17);
        uv.push(u,side); slot.push(ribbon.slot); colors.push(color.r,color.g,color.b);
      }
      if (j>0) {
        const a=first+(j-1)*2;
        indices.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, values, size] of [['position',points,3],['uv',uv,2],['inscription',slot,1],['color',colors,3]]) {
    geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  }
  geometry.setIndex(indices);
  const pairs = new THREE.Float32BufferAttribute(new Float32Array(slot.length*3),3);
  pairs.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('lyricPair',pairs);
  let previousTick = -1;
  const current = new Int32Array(artwork.count).fill(-1);
  function selectLyrics(seconds) {
    const tick = Math.floor(seconds*10);
    if (tick === previousTick) return;
    previousTick = tick;
    for (let n=0; n<artwork.count; n++) {
      const period = 8+(n*5)%8;
      const cycle = Math.floor((tick+(n*13)%period)/period);
      if (cycle===current[n]) continue;
      current[n]=cycle;
      const first = Math.floor(Math.random()*lyrics.length);
      let second = Math.floor(Math.random()*(lyrics.length-1));
      if (second >= first) second++;
      const key = Math.floor(Math.random()*(1 << inkGroups));
      const firstVertex=n*verticesPerInscription;
      for (let v=firstVertex; v<firstVertex+verticesPerInscription; v++) pairs.setXYZ(v,first,second,key);
    }
    pairs.addUpdateRange(0,artwork.count*verticesPerInscription*pairs.itemSize);
    pairs.needsUpdate=true;
  }
  selectLyrics(0);
  const time = {value:0}, night = {value:0};
  const material = new THREE.MeshBasicMaterial({
    map:markerAtlas(), vertexColors:true, transparent:true, depthWrite:false, alphaTest:.012,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.inkTime = time;
    shader.uniforms.nightInk = night;
    const patchState = 'flat varying vec3 inkState; flat varying vec4 inkTiles;\n';
    shader.vertexShader = 'attribute float inscription; attribute vec3 lyricPair; uniform float inkTime; ' + patchState + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      float period = 8. + mod(inscription*5.,8.);
      float phase = fract((inkTime*10. + mod(inscription*13.,period))/period);
      inkState = vec3(.43+.57*smoothstep(0.,.16,phase)*(1.-smoothstep(.82,1.,phase)), inscription*.797, lyricPair.z);
      vec2 source = lyricPair.xy + floor(phase*${inkPasses}.)*${lyrics.length}.;
      inkTiles = vec4(mod(source.x,${columns}.), ${rows-1}. - floor(source.x/${columns}.),
                      mod(source.y,${columns}.), ${rows-1}. - floor(source.y/${columns}.));`);
    shader.fragmentShader = 'uniform float inkTime, nightInk; '+patchState+shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb += vec3(.091,.101,.109)*nightInk;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 uv = vMapUv;
      if (inkState.y<0.) {
        float edge = abs(uv.y-.5)*2.;
        float broadNib = step(1.,-inkState.y);
        float fibers = sin(uv.x*69.+uv.y*13.)*sin(uv.x*31.-uv.y*15.);
        float grain = mix(.65+.35*fibers,.86+.14*fibers,broadNib);
        float deposit = mix(.51+.15*sin(uv.x*23.+inkTime*.6),.96,broadNib);
        diffuseColor.a *= deposit * grain * (1.-smoothstep(.40+.32*broadNib,1.,edge));
      } else {
      float age = inkTime*.102 + inkState.y;
      float cycle = floor(age), pulse = fract(age);
      vec2 centre = vec2(.5+.28*sin(cycle*2.4+inkState.y), .48+.17*cos(cycle*1.7-inkState.y));
      vec2 delta = (uv-centre)*vec2(2.7,1.);
      float d = length(delta), radius = .015+.43*pulse;
      float ring = exp(-56.*abs(d-radius)) * sin(pulse*3.14159);
      uv += delta/max(d,.001)*ring*vec2(.016,.066);
      uv.y += .012*sin(uv.x*17.+inkTime*.42+inkState.y);
      vec2 atlasSize = vec2(${columns}.,${rows}.);
      vec2 gradients = vec2(2.,1.)/atlasSize;
      float strip = clamp(uv.x,0.,.99999)*${inkGroups*2}.;
      float group = floor(strip*.5);
      float swap = mod(floor(inkState.z/exp2(group)),2.);
      vec2 tile = mix(inkTiles.xy,inkTiles.zw,abs(mod(floor(strip),2.)-swap));
      vec2 local = vec2((group+fract(strip))/${inkGroups}., clamp(uv.y,.035,.965));
      // Neighbouring strips can point to distant tiles. Derive mip levels from
      // the continuous wall coordinates to keep those seams from washing out.
      float ink = textureGrad(map,(tile+local)/atlasSize,dFdx(uv)*gradients,dFdy(uv)*gradients).r;
      diffuseColor.a *= inkState.x * ink;
      }
    `);
  };
  const mesh = new THREE.Mesh(geometry,material), born = performance.now();
  mesh.name = 'wall-marker-inscriptions';
  mesh.userData.bakedShadowCaster = false;
  mesh.userData.bakedShadowReceiver = false;
  mesh.userData.inscriptionCount = artwork.count;
  mesh.userData.readInscription = index => {
    if (!Number.isInteger(index) || index < 0 || index >= artwork.count) return null;
    const v=index*verticesPerInscription, key=pairs.getZ(v);
    const a=lyrics[pairs.getX(v)], b=lyrics[pairs.getY(v)], period=8+(index*5)%8;
    const pass=Math.min(inkPasses-1,Math.floor(((time.value*10+(index*13)%period)%period)*inkPasses/period));
    return {chunks:mixWallPhrase(wallEcho(a),wallEcho(b),key),
      inkChunks:mixWallPhrase(wallTranslation(a,pass),wallTranslation(b,pass),key),pass,key};
  };
  geometry.addEventListener('dispose', () => {
    if (lastWall === mesh) lastWall = null;
  });
  mesh.onBeforeRender = (_renderer, scene) => {
    material.opacity = .81*(1-(scene.userData.virtuality || 0));
    night.value = 1-(scene.userData.solarLighting?.daylight ?? 1);
    time.value = liveView && !still.matches ? (performance.now()-born)/1000 : 0;
    if (material.opacity > .005) {
      selectLyrics(time.value);
      lastWall = mesh;
    }
  };
  return mesh;
}
