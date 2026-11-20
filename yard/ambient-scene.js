import * as THREE from './vendor/three.module.js';
import { createYardScene } from './scene.js?v=ural-courtyard-1';
import { courtyardSunForLocation, solarLighting } from './solar-clock.js';
import { ambientOpeningView, createAutoWalk } from './auto-walk.js?v=crow-flock-1';
import { createCrowFlock } from './crow-flock.js';
import { createCrowModels } from './crow-models.js';
import { createResidentModel } from './resident-model.js';
import { addPuddles } from './puddles.js';
import { createSolarLighting } from './solar-lighting.js';
import { createCameraOptics } from './camera-optics.js';

const layoutURL = new URL('./data/site-layout.json?v=zhdanova-entrances-20261120', import.meta.url);

function releaseScene(scene) {
  const resources = new Set();
  scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.isInstancedMesh) resources.add(object);
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) resources.add(value);
      }
    }
  });
  for (const resource of resources) resource.dispose();
  scene.clear();
}

export async function startAmbientScene(canvas, { signal, onReady, onError, onFrame, clearView = false } = {}) {
  const lifetime = new AbortController();
  const compact = matchMedia('(max-width: 800px), (pointer: coarse)');
  const desktopPixels = [360000, 490000, 640000, 840000, 1100000, 1350000, 1600000, 1850000, 2100000, 2300000];
  const mobilePixels = [155000, 255000, 400000, 460000, 535000, 610000, 680000, 750000, 825000, 900000];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const frameMs = 1000 / 30;
  let renderer, yard, walk, flock, crowModels, camera, resizeObserver, ripplePuddles, solar, optics, graphicsLevel;
  let residentModel, residentInYard = false;
  let frame = 0, lastDraw = null, nextDraw = 0, nextDetail = 0, ready = false;
  let moreDetail = true;

  function showCourtyardResident(shown) {
    if (residentInYard === shown) return;
    residentInYard = shown;
    window.inteonRoom?.setInCourtyard?.(shown);
  }

  function dispose() {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    signal?.removeEventListener('abort', dispose);
    window.removeEventListener('pagehide', dispose);
    window.removeEventListener('inteon-quality-change', resize);
    compact.removeEventListener('change', resize);
    document.removeEventListener('visibilitychange', visibilityChanged);
    canvas.removeEventListener('webglcontextlost', contextLost);
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    solar?.dispose();
    optics?.dispose();
    crowModels?.dispose();
    showCourtyardResident(false);
    residentModel?.dispose();
    yard?.roofPigeons.dispose();
    if (yard) releaseScene(yard.scene);
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    yard = renderer = walk = flock = crowModels = null;
  }

  function fail(error) {
    if (lifetime.signal.aborted) return;
    dispose();
    onError?.(error);
  }

  function contextLost() {
    fail(new Error('WebGL context lost'));
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const mobile = compact.matches;
    const level = graphicsLevel = Math.max(1, Math.min(10, Math.round(Number(document.documentElement.dataset.graphicsLevel)) || (mobile ? 3 : 5)));
    solar?.setQuality(level, mobile);
    // Share the existing quality meter with the mixer. Labels, hit targets and
    // waveforms keep their native resolution regardless of the 3D pixel budget.
    const budget = (mobile ? mobilePixels : desktopPixels)[level-1] * (clearView ? 1 : .37);
    const ratio = Math.min(devicePixelRatio || 1, clearView && level >= 4 ? 1.35 : 1, Math.sqrt(budget / (width*height)));
    if (canvas.width === Math.floor(width*ratio) && canvas.height === Math.floor(height*ratio) && camera.aspect === width/height) return;
    renderer.setDrawingBufferSize(width, height, ratio);
    optics?.reset();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function queueDraw() {
    if (!frame && !document.hidden && !lifetime.signal.aborted) frame = requestAnimationFrame(draw);
  }

  function visibilityChanged() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastDraw = null;
    optics?.reset();
    nextDraw = 0;
    queueDraw();
  }

  function draw(now) {
    frame = 0;
    if (document.hidden || lifetime.signal.aborted) return;
    if (now >= nextDraw) {
      try {
        const dt = lastDraw === null ? 0 : Math.min((now - lastDraw) / 1000, 0.15);
        lastDraw = now;
        nextDraw = now + frameMs - (nextDraw ? (now - nextDraw) % frameMs : 0);
        const pose = walk.update(dt);
        camera.position.set(pose.x, reducedMotion.matches ? pose.y - pose.eyeOffset : pose.y, pose.z);
        camera.rotation.set(pose.pitch, -pose.yaw, reducedMotion.matches ? 0 : pose.roll, 'YXZ');
        yard.edgeEffect.update(pose.x, pose.z, camera.position.y, now / 1000);
        // Keep the facade in view through the last ten centimetres of the crossing.
        const near = Math.abs(yard.edgeEffect.facadeDistance) < .20 ? .025 : .1;
        if (camera.fov !== pose.fov || camera.near !== near) {
          camera.fov = pose.fov;
          camera.near = near;
          camera.updateProjectionMatrix();
        }
        solar.update(Date.now(), camera);
        if (yard.roofPigeons.group.visible) yard.roofPigeons.update(reducedMotion.matches ? 0 : dt, camera);
        crowModels.update(flock.birds, dt, yard.scene.userData.virtuality, yard.scene.userData.solarLighting.daylight);
        if (residentModel) {
          const show = flock.visit?.amount > 0 && yard.scene.userData.virtuality < .5
            && window.inteonRoom?.canVisitCourtyard?.() === true;
          if (show) residentModel.update(flock.visit, dt, yard.scene.userData.solarLighting.daylight, yard.scene.userData.virtuality);
          else residentModel.group.visible = false;
          showCourtyardResident(residentModel.group.visible);
        }
        ripplePuddles(now / 1000);
        if (yard.scene.userData.grassWind) yard.scene.userData.grassWind.value = now / 1000;
        yard.scene.userData.updateLandscapingDetail?.(camera.position,graphicsLevel);
        optics.render(yard.scene,camera,dt,graphicsLevel,reducedMotion.matches);
        onFrame?.(canvas, now);
        if (!ready) {
          ready = true;
          nextDetail = now + 700;
          onReady?.();
        } else if (moreDetail && now >= nextDetail) {
          // Build only one nearby block at a time, leaving the mixer time between upgrades.
          moreDetail = yard.loadNextDetail(pose);
          nextDetail = now + 800;
          solar.refreshGeometry();
        }
      } catch (error) {
        fail(error);
      }
    }
    queueDraw();
  }

  if (signal?.aborted) throw new DOMException('Walk cancelled', 'AbortError');
  signal?.addEventListener('abort', dispose, { once: true });
  window.addEventListener('pagehide', dispose, { once: true });
  try {
    const response = await fetch(layoutURL, { signal: lifetime.signal });
    if (!response.ok) throw new Error('Courtyard layout: ' + response.status);
    const layout = await response.json();
    lifetime.signal.throwIfAborted();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    optics = createCameraOptics(renderer);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    camera = new THREE.PerspectiveCamera(64, 1, 0.1, 510);
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const openingView = ambientOpeningView(layout, aspect);
    const residentVisits = Boolean(document.querySelector('.room-presence'));
    flock = createCrowFlock(layout, openingView, {residentVisits});
    walk = createAutoWalk(layout, { openingView, flock });
    const lighting = solarLighting(courtyardSunForLocation(layout.origin, Date.now()));
    yard = createYardScene(layout, lighting, {
      progressive: true, origin: walk.update(0), passThroughBuildings: true,
    });
    solar = createSolarLighting(renderer, yard, layout, {sampleSun:courtyardSunForLocation});
    solar.update(Date.now(), camera);
    crowModels = createCrowModels(yard.edgeEffect.wallContact);
    crowModels.group.userData.visibleInBackstage = true;
    yard.scene.add(crowModels.group);
    if (residentVisits) {
      residentModel = createResidentModel();
      residentModel.group.visible = false;
      yard.scene.add(residentModel.group);
    }
    ripplePuddles = addPuddles(yard.scene, layout);
    canvas.addEventListener('webglcontextlost', contextLost);
    resize();
    resizeObserver = new ResizeObserver(() => {
      if (!lifetime.signal.aborted) resize();
    });
    resizeObserver.observe(canvas);
    window.addEventListener('inteon-quality-change', resize);
    compact.addEventListener('change', resize);
    document.addEventListener('visibilitychange', visibilityChanged);
    queueDraw();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
