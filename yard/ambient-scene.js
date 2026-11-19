import * as THREE from './vendor/three.module.js';
import { createYardScene } from './scene.js?v=ambient-walk-1';
import { lightingPresetForLayout } from './baked-lighting.js';
import { ambientOpeningView, createAutoWalk } from './auto-walk.js?v=3';
import { addPuddles } from './puddles.js';

const layoutURL = new URL('./data/site-layout.json?v=lawn-pipe-correction-20261031', import.meta.url);

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
  const mobile = matchMedia('(max-width: 800px), (pointer: coarse)').matches;
  const maxPixels = clearView ? (mobile ? 400000 : 1048576) : (mobile ? 160000 : 385000);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const frameMs = 1000 / 30;
  let renderer, yard, walk, camera, eyeHeight, resizeObserver, ripplePuddles;
  let frame = 0, lastDraw = null, nextDraw = 0, nextDetail = 0, ready = false;
  let moreDetail = true;

  function dispose() {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    signal?.removeEventListener('abort', dispose);
    window.removeEventListener('pagehide', dispose);
    document.removeEventListener('visibilitychange', visibilityChanged);
    canvas.removeEventListener('webglcontextlost', contextLost);
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    if (yard) releaseScene(yard.scene);
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    yard = renderer = walk = null;
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
    const ratio = Math.min(devicePixelRatio || 1, 1, Math.sqrt(maxPixels / (width * height)));
    renderer.setDrawingBufferSize(width, height, ratio);
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
        camera.position.set(pose.x, eyeHeight + (reducedMotion.matches ? 0 : pose.eyeOffset), pose.z);
        camera.rotation.set(pose.pitch, -pose.yaw, 0, 'YXZ');
        yard.edgeEffect.update(pose.x, pose.z);
        ripplePuddles(now / 1000);
        if (yard.scene.userData.grassWind) yard.scene.userData.grassWind.value = now / 1000;
        renderer.render(yard.scene, camera);
        onFrame?.(canvas, now);
        if (!ready) {
          ready = true;
          nextDetail = now + 700;
          onReady?.();
        } else if (moreDetail && now >= nextDetail) {
          // Build only one nearby block at a time, leaving the mixer time between upgrades.
          moreDetail = yard.loadNextDetail(pose);
          nextDetail = now + 800;
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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    camera = new THREE.PerspectiveCamera(64, 1, 0.1, 510);
    walk = createAutoWalk(layout, { openingView: ambientOpeningView(layout) });
    eyeHeight = layout.movement.eyeM;
    const lighting = lightingPresetForLayout(layout, 2);
    yard = createYardScene(layout, lighting, { progressive: true, origin: walk.update(0) });
    ripplePuddles = addPuddles(yard.scene, layout);
    canvas.addEventListener('webglcontextlost', contextLost);
    resize();
    resizeObserver = new ResizeObserver(() => {
      if (!lifetime.signal.aborted) resize();
    });
    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', visibilityChanged);
    queueDraw();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
