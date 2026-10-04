import * as THREE from "./vendor/three.module.js";
import { facadeNormal } from "./facade-frame.js";
import { createYardMaterials } from "./materials.js";
import { facadeSpec, openingsForFacade } from "./models.js";
import { addHruDetails } from "./hru-details.js";
import { addRoadDetails } from "./road-details.js";
import { addUtilityStructures } from "./site-structures.js";
import { addGasPipes, addSiteEntrances } from "./site-details.js";
import { addBakedLighting, fixedSunForLayout } from "./baked-lighting.js";

const ROOF_COLOR = {
  red: 0xa34a3a,
  metal: 0xd5d8dc,
  "unknown-flat-gray": 0x8d9298,
};

function outwardNormal(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dz, -dx) || 1;
  return [-dz / length, dx / length];
}


function addWall(scene, solids, a, b, height, material, { lift = 0, facadeId = "unknown-facade", outset = 0 } = {}) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  const overhang = 0.03;
  const span = length + overhang * 2;
  const normal = outwardNormal(a, b);
  material.side = THREE.DoubleSide;
  const geometry = new THREE.PlaneGeometry(span, height);
  const [tileWidth, tileHeight] = facadeSpec(facadeId).tileM;
  const uv = geometry.getAttribute("uv");
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * (span / tileWidth), uv.getY(index) * (height / tileHeight));
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, material);
  const gap = 0.02 + outset;
  mesh.position.set((a[0] + b[0]) / 2 + normal[0] * gap, lift + height / 2, (a[1] + b[1]) / 2 + normal[1] * gap);
  mesh.rotation.y = Math.atan2(normal[0], normal[1]);
  scene.add(mesh);
  solids.push(mesh);
  return mesh;
}

function collectOpenings(list, a, b, building, edgeIndex) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < 8 || (building.floors || 0) < 2) return;
  const tx = dx / length;
  const tz = dz / length;
  const normal = facadeNormal(a, b, building.footprint);
  const plan = openingsForFacade(building, length, edgeIndex);
  for (const item of plan.windows) {
    list.windows.push({
      x: a[0] + tx * item.along + normal[0] * 0.08,
      y: item.y,
      z: a[1] + tz * item.along + normal[1] * 0.08,
      yaw: Math.atan2(normal[0], normal[1]),
      width: item.width,
      height: item.height,
    });
  }
  for (const item of plan.balconies) {
    list.balconies.push({
      x: a[0] + tx * item.along + normal[0] * 0.48,
      y: item.y,
      z: a[1] + tz * item.along + normal[1] * 0.48,
      yaw: Math.atan2(normal[0], normal[1]),
      width: item.width,
      depth: item.depth,
      railHeight: item.railHeight,
      nx: normal[0],
      nz: normal[1],
      variant: item.variant || "open",
    });
  }

}

function addOpeningMeshes(scene, materials, list) {
  const windowMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.05, 1.35),
    materials.window(),
    Math.max(1, list.windows.length),
  );
  const balconyMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.12, 0.75),
    materials.balcony(),
    Math.max(1, list.balconies.length),
  );
  const balconyRail = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.06, 0.06),
    materials.balcony(),
    Math.max(1, list.balconies.length),
  );
  const balconyPost = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.86, 0.06),
    materials.balcony(),
    Math.max(1, list.balconies.length * 2),
  );
  const dummy = new THREE.Object3D();
  list.windows.forEach((item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.set(item.width / 1.05, item.height / 1.35, 1);
    dummy.updateMatrix();
    windowMesh.setMatrixAt(index, dummy.matrix);
  });
  list.balconies.forEach((item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.set(item.width / 1.5, 1, item.depth / 0.75);
    dummy.updateMatrix();
    balconyMesh.setMatrixAt(index, dummy.matrix);

    dummy.position.set(item.x + item.nx * (item.depth * 0.45), item.y + item.railHeight, item.z + item.nz * (item.depth * 0.45));
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.set(item.width / 1.5, 1, 1);
    dummy.updateMatrix();
    balconyRail.setMatrixAt(index, dummy.matrix);

    for (const side of [-0.46, 0.46]) {
      dummy.position.set(
        item.x + item.nx * (item.depth * 0.45) + Math.cos(item.yaw) * item.width * side,
        item.y + item.railHeight * 0.5,
        item.z + item.nz * (item.depth * 0.45) - Math.sin(item.yaw) * item.width * side,
      );
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(1, item.railHeight / 0.86, 1);
      dummy.updateMatrix();
      balconyPost.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), dummy.matrix);
    }
  });
  windowMesh.count = list.windows.length;
  balconyMesh.count = list.balconies.length;
  balconyRail.count = list.balconies.length;
  balconyPost.count = list.balconies.length * 2;
  scene.add(windowMesh);
  scene.add(balconyMesh);
  scene.add(balconyRail);
  scene.add(balconyPost);
}

function addRoof(scene, footprint, y, color, pitched = false) {
  if (pitched && footprint.length === 4) {
    const [a, b, c, d] = footprint;
    const ridgeA = [(a[0] + d[0]) / 2, y + 0.9, (a[1] + d[1]) / 2];
    const ridgeB = [(b[0] + c[0]) / 2, y + 0.9, (b[1] + c[1]) / 2];
    const vertices = new Float32Array([
      a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], d[0], y, d[1],
      ...ridgeA, ...ridgeB,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5]);
    geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.86, side: THREE.DoubleSide })));
    return;
  }
  const shape = new THREE.Shape();
  shape.moveTo(footprint[0][0], -footprint[0][1]);
  for (let index = 1; index < footprint.length; index += 1) shape.lineTo(footprint[index][0], -footprint[index][1]);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  scene.add(mesh);
}

function edgeFrame(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  const tx = dx / length;
  const tz = dz / length;
  let nx = tz;
  let nz = -tx;
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[1] + b[1]) / 2;
  if (nx * -midX + nz * -midZ < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { tx, tz, nx, nz, length, yaw: Math.atan2(nx, nz) };
}

function pointOnEdge(frame, a, distance, y, offset) {
  return {
    x: a[0] + frame.tx * distance + frame.nx * offset,
    y,
    z: a[1] + frame.tz * distance + frame.nz * offset,
  };
}

function addCornerDetails(scene, materials, layout) {
  const nearA = layout.musicWall.segment[0];
  const nearB = layout.musicWall.segment[1];
  const blankA = layout.musicWall.blank[0];
  const blankB = layout.musicWall.blank[1];
  const near = edgeFrame(nearA, nearB);
  const blank = edgeFrame(blankA, blankB);
  addWall(scene, [], nearA, nearB, 0.9, materials.flat(0xc4b6a2), { outset: 0.016 });
  addWall(scene, [], blankA, blankB, 0.9, materials.flat(0xc4897a), { outset: 0.016 });

  const signCanvas = document.createElement("canvas");
  signCanvas.width = 128;
  signCanvas.height = 160;
  const signPaint = signCanvas.getContext("2d");
  signPaint.fillStyle = "#f7f4ee";
  signPaint.fillRect(0, 0, 128, 160);
  signPaint.fillStyle = "#1d4e89";
  signPaint.font = "700 96px sans-serif";
  signPaint.textAlign = "center";
  signPaint.fillText("14", 64, 112);
  const signMap = new THREE.CanvasTexture(signCanvas);
  signMap.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.7),
    new THREE.MeshBasicMaterial({ map: signMap }),
  );
  const signAt = pointOnEdge(near, nearA, Math.max(0.4, near.length - 0.55), 4.6, 0.2);
  sign.position.set(signAt.x, signAt.y, signAt.z);
  sign.rotation.y = near.yaw;
  scene.add(sign);

  const air = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.35), materials.flat(0xe7e4dc));
  const airAt = pointOnEdge(blank, blankA, 2.4, 2.7, 0.28);
  air.position.set(airAt.x, airAt.y, airAt.z);
  air.rotation.y = blank.yaw;
  scene.add(air);

}

function addPlayground(scene, materials, playground) {
  if (!playground) return;
  const metal = materials.flat(0x76856f);
  const wood = materials.flat(0x917859);
  const sand = materials.flat(0xc4ad79);
  const yellow = materials.flat(0xd6b34d);
  const box = playground.sandbox;
  if (box) {
    const half = box.size / 2;
    const board = 0.22;
    for (const [x, z, width, depth] of [
      [box.x, box.z - half + board / 2, box.size, board],
      [box.x, box.z + half - board / 2, box.size, board],
      [box.x - half + board / 2, box.z, board, box.size],
      [box.x + half - board / 2, box.z, board, box.size],
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(width, box.height, depth), wood);
      rim.position.set(x, box.height / 2, z);
      scene.add(rim);
    }
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(box.size - board * 2, box.size - board * 2), sand);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(box.x, box.height + 0.012, box.z);
    scene.add(fill);
  }
  const bars = playground.bars;
  if (bars) {
    bars.heights.forEach((height, index) => {
      const x = bars.x - (bars.span || 4.2) / 2 + 0.8 + index * 1.4;
      for (const side of [-(bars.depth || 1.2) / 2, (bars.depth || 1.2) / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, height, 8), metal);
        post.position.set(x, height / 2, bars.z + side);
        scene.add(post);
      }
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, bars.depth || 1.2, 8), metal);
      rail.position.set(x, height, bars.z);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
      scene.add(rail);
    });
  }
  const slide = playground.slide;
  if (slide) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(slide.width, 0.12, 1.15), yellow);
    deck.position.set(slide.x, slide.platform, slide.z);
    scene.add(deck);
    for (const side of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, slide.platform, 8), metal);
      leg.position.set(slide.x + side * slide.width, slide.platform / 2, slide.z);
      scene.add(leg);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, slide.platform, 8), metal);
      rail.position.set(slide.x + side * slide.width, slide.platform + 0.3, slide.z - 0.2);
      scene.add(rail);
    }
    const chute = new THREE.Mesh(new THREE.BoxGeometry(slide.width * 0.72, 0.1, slide.length), yellow);
    chute.position.set(slide.x, slide.platform * 0.45, slide.z + slide.length * 0.45);
    chute.rotation.x = -0.35;
    scene.add(chute);
    for (let step = 0; step < 3; step += 1) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(slide.width * 0.75, 0.12, 0.34), wood);
      stair.position.set(slide.x, 0.15 + step * 0.22, slide.z - 0.62 - step * 0.28);
      scene.add(stair);
    }
  }
}

function addTree(scene, materials, circle) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(circle.radius, circle.radius * 1.2, 3.2, 6), materials.flat(0x5c4634));
  trunk.position.set(circle.x, 1.6, circle.z);
  scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 1), materials.flat(0x3f6b34));
  crown.position.set(circle.x - 0.25, 4.1, circle.z);
  scene.add(crown);
  const sideCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), materials.flat(0x4c7740));
  sideCrown.position.set(circle.x + 0.8, 3.85, circle.z + 0.25);
  scene.add(sideCrown);
}

export function createYardScene(layout) {
  const fixedSun = fixedSunForLayout(layout);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fixedSun.skyColor);
  scene.fog = new THREE.Fog(fixedSun.fogColor, 90, 260);
  const materials = createYardMaterials();
  const solids = [];

  const outside = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), materials.soil(420, 420));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.05;
  scene.add(outside);

  const groundShape = new THREE.Shape();
  groundShape.moveTo(layout.walkable[0][0], -layout.walkable[0][1]);
  for (let index = 1; index < layout.walkable.length; index += 1) {
    groundShape.lineTo(layout.walkable[index][0], -layout.walkable[index][1]);
  }
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(groundShape), materials.soil(1, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  for (const surface of layout.surfaces || []) {
    const shape = new THREE.Shape();
    shape.moveTo(surface.polygon[0][0], -surface.polygon[0][1]);
    for (let index = 1; index < surface.polygon.length; index += 1) {
      shape.lineTo(surface.polygon[index][0], -surface.polygon[index][1]);
    }
    const material = surface.kind === "asphalt" ? materials.asphalt(24, 16) : materials.concrete(12, 10);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.025;
    scene.add(mesh);
  }
  addRoadDetails(scene, materials, layout.roads || []);
  const openings = { windows: [], balconies: [], entrances: [] };
  for (const building of layout.buildings) {
    const ring = building.footprint;
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const facadeId = building.facadeMaterialId || "unknown-facade";
      const facade = materials.facade(facadeId);
      const mesh = addWall(scene, solids, a, b, building.heightM, facade, { facadeId });
      const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.2;
      const music = layout.musicWall;
      const isMusic = building.id === music.buildingId && (
        (same(a, music.segment[0]) && same(b, music.segment[1]))
        || (same(a, music.segment[1]) && same(b, music.segment[0]))
        || (same(a, music.blank[0]) && same(b, music.blank[1]))
        || (same(a, music.blank[1]) && same(b, music.blank[0]))
      );
      const onSegment = (same(a, music.segment[0]) && same(b, music.segment[1])) || (same(a, music.segment[1]) && same(b, music.segment[0]));
      if (building.id === music.buildingId && onSegment) mesh.name = "music-wall";
      if (!isMusic) collectOpenings(openings, a, b, building, index);
    }
    addRoof(scene, ring, building.heightM + 0.05, ROOF_COLOR[building.roof] || 0x8d9298, building.roof === "red");
  }
  addOpeningMeshes(scene, materials, openings);
  addHruDetails(scene, materials, openings);
  addUtilityStructures(scene, materials, layout.utilityStructures || []);
  addSiteEntrances(scene, materials, layout);
  addGasPipes(scene, layout);

  addCornerDetails(scene, materials, layout);

  const near = edgeFrame(layout.musicWall.segment[0], layout.musicWall.segment[1]);
  const logoAt = pointOnEdge(near, layout.musicWall.segment[0], 5.6, 1.9, 0.2);
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 1.65),
    new THREE.MeshBasicMaterial({ color: 0xf4efe6, transparent: true }),
  );
  logo.name = "music-logo";
  logo.position.set(logoAt.x, logoAt.y, logoAt.z);
  logo.rotation.y = near.yaw;
  scene.add(logo);
  solids.push(logo);
  const loader = new THREE.TextureLoader();
  loader.load("../assets/logo-wordmark.svg", (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    logo.material.map = texture;
    logo.material.needsUpdate = true;
  });

  addPlayground(scene, materials, layout.playground);
  for (const circle of layout.circles || []) {
    if (circle.id.startsWith("tree-")) addTree(scene, materials, circle);
  }
  addBakedLighting(scene, materials, layout);

  scene.add(new THREE.AmbientLight(0xfff6ea, fixedSun.ambientIntensity));
  scene.add(new THREE.HemisphereLight(0xbfd8ee, 0x8d7048, fixedSun.hemisphereIntensity));
  const sun = new THREE.DirectionalLight(0xfff1d6, fixedSun.sunIntensity);
  sun.position.set(
    fixedSun.sunVectorXYZ[0] * 84,
    fixedSun.sunVectorXYZ[1] * 84,
    fixedSun.sunVectorXYZ[2] * 84,
  );
  scene.add(sun);

  return { scene, solids, logo };
}

export function drawScheme(canvas, layout) {
  const context = canvas.getContext("2d");
  const points = [
    ...layout.walkable,
    ...layout.buildings.flatMap((building) => building.footprint),
    ...(layout.utilityStructures || []).flatMap((structure) => structure.footprint),
    ...(layout.roads || []).flatMap((road) => road.centerline),
  ];
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  const minX = Math.min(...xs) - 12;
  const maxX = Math.max(...xs) + 12;
  const minZ = Math.min(...zs) - 12;
  const maxZ = Math.max(...zs) + 12;
  const scale = Math.min(canvas.width / (maxX - minX), canvas.height / (maxZ - minZ));
  const mapX = (x) => (x - minX) * scale;
  const mapZ = (z) => (z - minZ) * scale;
  const trace = (ring) => {
    context.beginPath();
    ring.forEach((point, index) => {
      const x = mapX(point[0]);
      const y = mapZ(point[1]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  };
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(109, 116, 122, 0.55)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  trace(layout.walkable);
  context.fillStyle = "rgba(141, 112, 72, 0.72)";
  context.fill();
  for (const road of layout.roads || []) {
    if (road.render === false || !road.centerline?.length) continue;
    context.beginPath();
    road.centerline.forEach((point, index) => {
      const x = mapX(point[0]);
      const y = mapZ(point[1]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = "rgba(79, 76, 69, 0.8)";
    context.lineWidth = Math.max(2, road.widthM * scale);
    context.stroke();
  }
  for (const building of layout.buildings) {
    trace(building.footprint);
    context.fillStyle = building.roof === "red" ? "rgba(163, 74, 58, 0.82)" : building.id === layout.musicWall.buildingId ? "rgba(217, 210, 196, 0.82)" : "rgba(141, 146, 152, 0.82)";
    context.fill();
  }
  for (const structure of layout.utilityStructures || []) {
    trace(structure.footprint);
    context.fillStyle = "rgba(102, 102, 95, 0.82)";
    context.fill();
  }
  context.strokeStyle = "rgba(47, 107, 58, 0.9)";
  context.lineWidth = 2;
  trace(layout.walkable);
  context.stroke();
  const base = document.createElement("canvas");
  base.width = canvas.width;
  base.height = canvas.height;
  base.getContext("2d").drawImage(canvas, 0, 0);
  const drawMarker = (x, z, yaw) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0);
    const px = mapX(x);
    const py = mapZ(z);
    const dirX = Math.sin(yaw);
    const dirY = -Math.cos(yaw);
    const sideX = -dirY;
    const sideY = dirX;
    const reach = 34;
    const spread = Math.tan(Math.PI / 6) * reach;
    context.beginPath();
    context.moveTo(px, py);
    context.lineTo(px + dirX * reach + sideX * spread, py + dirY * reach + sideY * spread);
    context.lineTo(px + dirX * reach - sideX * spread, py + dirY * reach - sideY * spread);
    context.closePath();
    context.fillStyle = "rgba(255, 255, 255, 0.38)";
    context.fill();
    context.fillStyle = "#fff";
    context.beginPath();
    context.arc(px, py, 4.5, 0, Math.PI * 2);
    context.fill();
  };
  return { drawMarker };
}
