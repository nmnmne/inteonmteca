import * as THREE from './vendor/three.module.js';
import { buildings, streets } from './data/city-district.js';
import { blocks, routes } from './data/oral-relief.js';

// A second, ground-registered survey of the blocks around the authored courtyard.
// Street lengths and closed facade perimeters carry pulses across corners.
const baseY = 0.18;
const vertexShader = `
  uniform float rise;
  uniform vec4 yardFrame;
  attribute float routeMetres;
  attribute float featurePhase;
  attribute float detail;
  varying float vMetres;
  varying float vPhase;
  varying float vDetail;
  varying float vHeight;
  varying float vDepth;
  void main() {
    vec3 p = position;
    p.y = 0.18 + (p.y - 0.18) * rise;
    // Keep this courtyard in its surveyed position. Compress distances past
    // its perimeter so the far side of Oral fits inside the view frustum.
    vec2 delta = p.xz - yardFrame.xy;
    vec2 unit = abs(delta) / yardFrame.zw;
    float stretch = max(unit.x, unit.y);
    float distanceScale = 1.0;
    if (stretch > 1.0) {
      float radius = length(delta);
      float boundary = radius / stretch;
      float overhang = radius - boundary;
      distanceScale = (boundary + 38.0 * log(1.0 + overhang / 38.0)) / radius;
      p.xz = yardFrame.xy + delta * distanceScale;
    }
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    vMetres = routeMetres * distanceScale;
    vPhase = featurePhase;
    vDetail = detail;
    vHeight = position.y;
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }`;

const common = `
  uniform float visibility, seconds, backstage, overview;
  varying float vMetres, vPhase, vDetail, vHeight, vDepth;
  float rangeFade() { return 1.0 - 0.74 * smoothstep(130.0, 510.0, vDepth); }
  vec3 colour() {
    vec3 blueprint = mix(vec3(0.045, 0.56, 0.71), vec3(0.42, 0.28, 0.91), vPhase * 0.50);
    blueprint = mix(blueprint, vec3(0.34,0.30,0.82), overview * 0.58);
    return mix(blueprint, vec3(0.32, 0.22, 0.78), backstage * 0.58);
  }`;
const lineShader = common + `
  void main() {
    float wave = fract(vMetres / 42.0 - seconds * 0.21 + vPhase);
    float tail = smoothstep(0.71, 0.96, wave) * (1.0 - smoothstep(0.96, 1.0, wave));
    float shimmer = 0.86 + 0.14 * sin(seconds * 2.3 + vPhase * 26.0 + vHeight * 0.16);
    vec3 signal = mix(colour(), vec3(0.74, 1.0, 0.91), tail);
    float alpha = visibility * rangeFade() * (vDetail * shimmer + tail * 0.86);
    gl_FragColor = vec4(signal, min(1.0, alpha));
    #include <colorspace_fragment>
  }`;
const surfaceShader = common + `
  void main() {
    float scan = fract(vHeight / 13.0 - seconds * 0.11 + vPhase);
    float band = smoothstep(0.82, 0.95, scan) * (1.0 - smoothstep(0.95, 1.0, scan));
    // Give a distant row its own silhouette instead of summing every facade
    // seen down the street to white. Keep the shell open from the inside.
    float coverage = visibility * rangeFade();
    float threshold = fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.5625, 0.4375)));
    if (threshold > min(1.0, coverage * 1.8)) discard;
    vec3 shell = mix(vec3(0.014, 0.062, 0.094), colour(), 0.22 * band);
    gl_FragColor = vec4(shell, coverage * (0.54 + 0.18 * band));
    #include <colorspace_fragment>
  }`;

function vertexBuffer() {
  const positions = [], metres = [], phases = [], details = [];
  return {
    add(point, along, phase, detail) {
      positions.push(...point);
      metres.push(along); phases.push(phase); details.push(detail);
    },
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('routeMetres', new THREE.Float32BufferAttribute(metres, 1));
      geo.setAttribute('featurePhase', new THREE.Float32BufferAttribute(phases, 1));
      geo.setAttribute('detail', new THREE.Float32BufferAttribute(details, 1));
      return geo;
    },
  };
}

function trace(buffer, path, phase, detail) {
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i-1], b = path[i];
    buffer.add(a, along, phase, detail);
    along += Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
    buffer.add(b, along, phase, detail);
  }
}

function outline(layer, ring, height, phase, showStoreys = true) {
  const contour = ring.map(([x,z]) => new THREE.Vector2(x,z));
  if (THREE.ShapeUtils.isClockWise(contour)) {
    contour.reverse();
    ring = ring.slice().reverse();
  }
  const foot = ring.map(([x,z]) => [x,baseY,z]);
  const roof = ring.map(([x,z]) => [x,height+baseY,z]);
  trace(layer.lines, [...roof, roof[0]], phase, 0.85);
  for (let i = 0; i < ring.length; i++) {
    const next = (i+1) % ring.length;
    trace(layer.lines, [foot[i], roof[i]], phase, 0.48);
    for (const p of [foot[i], roof[i], foot[next], roof[i], roof[next], foot[next]]) {
      layer.faces.add(p, 0, phase, 0);
    }
  }
  const roofTriangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [a,b,c] of roofTriangles) for (const i of [c,b,a]) layer.faces.add(roof[i], 0, phase, 0);
  for (let storey = 5.7; showStoreys && storey < height-1; storey += 5.7) {
    const belt = ring.map(([x,z]) => [x,storey+baseY,z]);
    trace(layer.lines, [...belt, belt[0]], phase, 0.28);
  }
}

function createLayer() {
  return { lines: vertexBuffer(), faces: vertexBuffer() };
}

function drawLayer(root, buffers, uniforms, name) {
  const layer = new THREE.Group();
  layer.name = name;
  for (const solid of buffers.faces ? [true,false] : [false]) {
    const geometry = (solid ? buffers.faces : buffers.lines).geometry();
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader: solid ? surfaceShader : lineShader, uniforms,
      transparent: true, depthWrite: solid, polygonOffset: solid, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      toneMapped: false,
    });
    const object = solid ? new THREE.Mesh(geometry, material) : new THREE.LineSegments(geometry, material);
    object.userData.bakedShadowCaster = false;
    object.userData.bakedShadowReceiver = false;
    object.userData.digitalProxy = true;
    // CPU bounding volumes remain expressed in survey metres. The vertex
    // shader compresses the projection into the camera's actual view volume.
    object.frustumCulled = false;
    object.renderOrder = solid ? 4 : 5;
    layer.add(object);
  }
  root.add(layer);
  return layer;
}

// The sparse network is suspended from the rooftops that survive the crossing.
// Connect each relay to its nearest earlier neighbour, then drop to the street.
function relayNetwork(nodes) {
  const lines = vertexBuffer();
  for (let i=0; i<nodes.length; i++) {
    const p = nodes[i], tip = [p[0], p[1]+9, p[2]];
    const phase = (i*0.75488) % 1;
    trace(lines, [[p[0],baseY,p[2]],tip], phase, .58);
    trace(lines, [[tip[0]-1.2,tip[1],tip[2]], [tip[0],tip[1]+1.8,tip[2]],
      [tip[0]+1.2,tip[1],tip[2]], [tip[0],tip[1]-1.8,tip[2]], [tip[0]-1.2,tip[1],tip[2]]], phase, .95);
    if (!i) continue;
    let closest=nodes[0];
    for (let j=1; j<i; j++) {
      const q=nodes[j];
      if (Math.hypot(p[0]-q[0],p[2]-q[2]) < Math.hypot(p[0]-closest[0],p[2]-closest[2])) closest=q;
    }
    trace(lines, [tip,[closest[0],closest[1]+9,closest[2]]], phase, .38);
  }
  return {lines};
}

export function createCityHologram(scene, mapRing) {
  const fixed = createLayer(), extra = createLayer();
  const relays = [];
  for (const [id, height, ring] of buildings) {
    const phase = (Math.imul(id, 2654435761) >>> 0) / 4294967296;
    // An irregular handful of blocks remains addressable beyond the projection.
    if (phase < 0.07) relays.push([ring[0][0], height, ring[0][1]]);
    outline(phase < 0.07 ? fixed : extra, ring, height, phase);
  }
  streets.forEach(([rank, path], i) => {
    const remaining = rank === 2 || (rank === 1 && i % 5 === 0);
    const line = path.map(([x,z]) => [x,baseY,z]);
    trace((remaining ? fixed : extra).lines, line, (i * 0.618034) % 1, [0.34, 0.56, 0.9][rank]);
  });
  const relief = createLayer();
  for (const [height, ...coordinates] of blocks) {
    const ring = [];
    for (let i=0; i<coordinates.length; i+=2) ring.push([coordinates[i],coordinates[i+1]]);
    const phase = Math.abs((ring[0][0] * 0.059 + ring[0][1] * 0.031) % 1);
    outline(relief, ring, height, phase, false);
  }
  for (const [kind,...coordinates] of routes) {
    const points = [];
    for (let i=0; i<coordinates.length; i+=2) points.push([coordinates[i],baseY+0.1,coordinates[i+1]]);
    trace(relief.lines, points, kind * 0.34, [0.44,0.90,0.69][kind]);
  }
  const root = new THREE.Group();
  root.name = 'city-hologram';
  root.visible = false;
  scene.add(root);
  const xs = mapRing.map(p => p[0]), zs = mapRing.map(p => p[1]);
  const left = Math.min(...xs), north = Math.min(...zs), right = Math.max(...xs), south = Math.max(...zs);
  const yardFrame = {value:new THREE.Vector4((left+right)/2,(north+south)/2,(right-left)/2,(south-north)/2)};
  const seconds = {value: 0}, rise = {value: 0}, backstage = {value: 0};
  const commonUniforms = {seconds,rise,backstage,yardFrame,overview:{value:0}};
  const fixedVisibility = {value: 0}, extraVisibility = {value: 0};
  drawLayer(root, fixed, {...commonUniforms,visibility:fixedVisibility}, 'city-signal-backbone');
  const district = drawLayer(root, extra, {...commonUniforms,visibility:extraVisibility}, 'city-projected-blocks');
  const distant = drawLayer(root, relief, {...commonUniforms,overview:{value:1},visibility:extraVisibility}, 'city-distant-relief');
  const network = drawLayer(root, relayNetwork(relays), {...commonUniforms,visibility:backstage}, 'city-relay-network');
  return {
    root,
    update(reveal, behind, time) {
      root.visible = reveal > 0;
      district.visible = behind < 1;
      distant.visible = behind < 1;
      network.visible = behind > 0;
      rise.value = 0.04 + 0.96 * reveal;
      seconds.value = time;
      backstage.value = behind;
      fixedVisibility.value = reveal;
      extraVisibility.value = reveal * (1 - behind);
    },
  };
}
