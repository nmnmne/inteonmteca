import * as THREE from "./vendor/three.module.js";
import { distanceToWall, isWalkable, moveCircle } from "./navigation.js";
import { createInputController } from "./input-controller.js";
import { createQualityMeter, createRenderGate, pixelRatioCap, createAdaptiveQuality } from "./quality.js?v=optimization-20261009";
import { createYardScene, drawScheme } from "./scene.js?v=digital-shells-20261009-5";
import { createWallPlayer } from "./wall-player.js?v=seek-fade-20261006-2";
import { createBoundaryMusic } from "./boundary-music.js";
import { createLightingCycle, addBakedLighting } from "./baked-lighting.js";
import { createLightingTransition } from "./lighting-transition.js";

const portalPreview = new URLSearchParams(location.search).has('portal-preview');
const fallback = document.querySelector("#file-fallback");
const canvas = document.querySelector("#yard-view");
const prompt = document.querySelector("#open-player");
const scheme = document.querySelector("#scheme");
const schemeCanvas = document.querySelector("#scheme-canvas");
const walkButton = document.querySelector("#enter-walk");
const player = createWallPlayer(document);
const meter = createQualityMeter();
// Keep the ordinary player reachable if graphics or scene loading is unavailable.
try {
let layout = null;
if (location.protocol !== "file:") {
  layout = await fetch(new URL("./data/site-layout.json?v=digital-shells-20261009-5", import.meta.url)).then((response) => {
    if (!response.ok) throw new Error(`site-layout ${response.status}`);
    return response.json();
  });
}

if (location.protocol === "file:") {
  fallback.hidden = false;
  canvas.hidden = true;
} else {
  const schemeMap = drawScheme(schemeCanvas, layout);
  if (!portalPreview) void player.load();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 400);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatioCap());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  // Consume exactly one preset on entrance, never on walking/player/visibility events.
  const lighting = createLightingCycle(portalPreview ? () => ({getItem: key => localStorage.getItem(key), setItem: () => {}}) : undefined).next(layout);
  const { scene, solids, logo, edgeEffect } = createYardScene(layout, lighting);
  const lightingTransition = createLightingTransition(scene, layout, lighting, window.yardWalkClock);
  let disposed = false;
  // Draw and enable input before fetching the optional projected-depth enhancement.
  const shouldRender = createRenderGate(matchMedia("(max-width: 800px), (pointer: coarse)").matches);
  const quality = createAdaptiveQuality(pixelRatioCap(), matchMedia("(max-width: 800px), (pointer: coarse)").matches);

  const params = new URLSearchParams(location.search);
  const resumed = window.inteonStreet?.resumePose?.();
  const start = params.has("play") && layout.playground?.view
    ? layout.playground.view
    : params.has("photo") && layout.photoView
      ? layout.photoView
      : resumed || layout.spawn;
  const body = {
    x: start.x,
    z: start.z,
    yaw: start.yaw,
    pitch: start.pitch || 0,
  };
  let flightPromise = null;
  let returnPose = null, flightEye = layout.movement.eyeM, flightRoll = 0;
  const boundaryMusic = createBoundaryMusic(layout.walkable, body, () => player.playBoundaryTrack());
  const input = createInputController(window, {
    walkSpeed: layout.movement.speedMps,
    sprintSpeed: layout.movement.sprintMps || 3.8,
  });
  const raycaster = new THREE.Raycaster();
  const coarsePointer = matchMedia("(pointer: coarse)").matches;
  if (coarsePointer) input.setMode("walking");
  let nearWall = false;
  let reading = false;
  let last = performance.now();
  let frameHandle = null;
  let lastMapDraw = 0;
  let appliedLook = { yaw: 0, pitch: 0 };
  const syncLook = (next) => {
    if (returnPose) return;
    body.yaw += next.yaw - appliedLook.yaw;
    body.pitch = Math.max(-1.1, Math.min(1.1, body.pitch + next.pitch - appliedLook.pitch));
    appliedLook = next;
  };

  let renderRevision = 0;
  canvas.addEventListener("webglcontextlost", () => {
    delete document.documentElement.dataset.yardReady;
  });
  canvas.addEventListener("webglcontextrestored", () => { renderRevision += 1; });
  const resize = () => {
    renderRevision += 1;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(quality.resize(pixelRatioCap()));
    renderer.setSize(width, height, false);
  };
  resize();
  window.addEventListener("resize", resize);

  const placeCamera = () => {
    camera.position.set(body.x, flightEye, body.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = -body.yaw;
    camera.rotation.x = body.pitch;
    camera.rotation.z = flightRoll;
  };

  const wallVisible = () => {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(solids, false);
    if (!hits.length) return false;
    const hit = hits[0];
    return (hit.object.name === "music-wall" || hit.object.name === "music-logo") && hit.distance <= layout.approach.enterM + 1.5;
  };

  const setReading = (next) => {
    reading = next;
    player.setOpen(next);
    document.body.classList.toggle("is-reading", next);
    input.setMode(next ? "interacting" : coarsePointer ? "walking" : "paused");
    if (next && document.pointerLockElement) document.exitPointerLock();
    if (prompt) prompt.hidden = true;
  };

  const updateNear = () => {
    const distance = distanceToWall(body.x, body.z, layout.musicWall.segment);
    if (!nearWall && distance <= layout.approach.enterM && wallVisible()) nearWall = true;
    if (nearWall && distance >= layout.approach.exitM) nearWall = false;
    if (prompt) prompt.hidden = reading || !nearWall;
    if (reading && distance >= layout.approach.exitM) setReading(false);
  };

  const enterWalking = () => {
    input.setMode("walking");
    if (matchMedia("(pointer: fine)").matches) canvas.requestPointerLock().catch(() => {});
  };
  walkButton?.addEventListener("click", enterWalking);
  document.querySelector("#listen")?.addEventListener("click", () => setReading(true));
  canvas.addEventListener("click", () => {
    if (reading || document.pointerLockElement === canvas) return;
    enterWalking();
  });
  prompt?.addEventListener("click", () => setReading(true));
  document.querySelector("#close-player")?.addEventListener("click", () => setReading(false));
  document.addEventListener("pointerlockchange", () => {
    if (walkButton) walkButton.hidden = document.pointerLockElement === canvas || reading;
    if (!reading) input.setMode(document.pointerLockElement === canvas || !matchMedia("(pointer: fine)").matches ? "walking" : "paused");
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      input.setMode("paused");
      if (reading) setReading(false);
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (reading || input.mode !== "walking") return;
    if (event.code === "KeyE" && nearWall) setReading(true);
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas || reading) return;
    syncLook(input.mouseLook(event.movementX, event.movementY));
  });

  const stickEl = document.querySelector("#stick");
  const nub = document.querySelector("#stick-nub");
  stickEl.addEventListener("pointerdown", (event) => {
    if (!input.beginStick(event.pointerId, event.clientX, event.clientY)) return;
    document.body.classList.add("has-touch-input");
    stickEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  stickEl.addEventListener("pointermove", (event) => {
    const value = input.moveStick(event.pointerId, event.clientX, event.clientY, 42);
    nub.style.transform = `translate(${value.x * 28}px, ${value.z * 28}px)`;
  });
  const releasePointer = (event) => {
    const wasStick = input.stick.id === event.pointerId;
    input.endPointer(event.pointerId);
    if (!wasStick) return;
    nub.style.transform = "translate(0, 0)";
  };
  stickEl.addEventListener("pointerup", releasePointer);
  stickEl.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || reading) return;
    if (event.clientX < window.innerWidth * 0.45) return;
    if (input.beginLook(event.pointerId, event.clientX, event.clientY)) {
      document.body.classList.add("has-touch-input");
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (reading || input.lookPointer.id !== event.pointerId) return;
    syncLook(input.moveLook(event.pointerId, event.clientX, event.clientY, 0.005));
  });
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  const journeyKey = 'inteon-yard-journey-v1';
  let journey; try { journey = JSON.parse(localStorage.getItem(journeyKey)) || {}; } catch { journey = {}; }
  journey.walkMs = Number(journey.walkMs) || 0;
  journey.entries = Number(journey.entries) || 0;
  if (performance.getEntriesByType('navigation')[0]?.type !== 'reload') journey.entries++;
  let lastJourneySave = 0;
  const saveJourney = () => {
    if (portalPreview) return;
    window.inteonStreet?.savePose(returnPose || body);
    try { localStorage.setItem(journeyKey,JSON.stringify(journey)); } catch {}
  };
  window.addEventListener('pagehide',saveJourney);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveJourney();});
  const updateJourney = (now,dt) => {
    if (portalPreview) return;
    if (!document.hidden && !window.inteonPortal?.busy && !returnPose) journey.walkMs += dt*1000;
    if (now-lastJourneySave>1000) {lastJourneySave=now;saveJourney();}

  };
  let marked = null;
  const scheduleFrame = () => {
    if (!disposed && !document.hidden && frameHandle === null) frameHandle = requestAnimationFrame(frame);
  };
  const frame = (now) => {
    frameHandle = null;
    meter.tick(now);
    const dt = Math.min(layout.movement.maxDeltaSec, (now - last) / 1000);
    last = now;
    updateJourney(now,dt);
    if (input.mode === "walking" && !reading && !document.hidden && !returnPose) {
      const move = input.sample();
      const length = Math.hypot(move.forward, move.strafe);
      if (length > 1) {
        move.forward /= length;
        move.strafe /= length;
      }
      if (length > 0 && isWalkable(layout, body.x, body.z, layout.movement.radiusM)) {
        const scale = move.speed * dt;
        const sin = Math.sin(body.yaw);
        const cos = Math.cos(body.yaw);
        const dx = (sin * move.forward + cos * move.strafe) * scale;
        const dz = (-cos * move.forward + sin * move.strafe) * scale;
        const next = moveCircle(layout, body.x, body.z, dx, dz, layout.movement.radiusM, layout.movement.maxStepM);
        body.x = next.x;
        body.z = next.z;
      }
    }
    const range = Math.hypot(body.x-39,body.z+2.5)+1200;
    if (Math.abs(camera.far-range)>100) {camera.far=range;camera.updateProjectionMatrix();}
    placeCamera();
    edgeEffect?.update(body.x, body.z);
    if (lightingTransition.update()) renderRevision += 1;
    boundaryMusic(body.x, body.z);
    updateNear();
    const mapInterval = coarsePointer ? 120 : 48;
    if (now - lastMapDraw >= mapInterval && (!marked || marked.x !== body.x || marked.z !== body.z || marked.yaw !== body.yaw)) {
      marked = { x: body.x, z: body.z, yaw: body.yaw };
      schemeMap.drawMarker(body.x, body.z, body.yaw);
      lastMapDraw = now;
    }
    const dirty = shouldRender(body, canvas.width, canvas.height, `${renderRevision}:${logo.material.map?.version || 0}`);
    const ratio = quality.sample(now, dirty && !returnPose);
    if (ratio !== null) {
      renderer.setPixelRatio(ratio);
      renderRevision += 1;
    }
    if (!returnPose && !document.hidden && !renderer.getContext().isContextLost() && dirty) {
      renderer.render(scene, camera);
      document.documentElement.dataset.yardReady = "true";
    }
    scheduleFrame();
  };
  placeCamera();
  edgeEffect?.update(body.x, body.z);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderRevision += 1;
      last = performance.now();
      quality.reset();
      scheduleFrame();
    }
  });
  scheduleFrame();

  scene.userData.bakedLightingStatus = "loading";
  // Start after the first visible frame, not on the critical boot path.
  requestAnimationFrame(() => setTimeout(() => {
    if (disposed) return;
    addBakedLighting(scene, null, layout, lighting).then(atlas => {
      lightingTransition.attach(atlas);
      if (disposed) return;
      scene.userData.bakedLightingStatus = "ready";
      renderRevision += 1; // Wake the mobile idle gate when shaders/textures change.
      scheduleFrame();
    }).catch(error => {
      if (disposed) return;
      scene.userData.bakedLightingStatus = "unavailable";
      scene.userData.bakedLightingError = String(error);
      console.warn("Precomputed yard shadows unavailable; retaining lit scene:", error);
    });
  }, 0));

  window.addEventListener("pagehide", () => {
    disposed = true;
    cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lightingTransition.dispose();
    const resources = new Set();
    scene.traverse(mesh => {
      if (mesh.geometry) resources.add(mesh.geometry);
      for (const material of !mesh.material ? [] : Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    resources.forEach(resource => resource.dispose());
    renderer.dispose();
    scene.userData.bakedLightingStatus = "disposed";
  });

  // Back/forward cache restores an old frozen scene without re-running modules.
  // Treat that restoration as an entrance too, using the ordinary selected-texture load path.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });

  window.__yard = {
    layout,
    lighting,
    lightingTransition,
    body,
    meter,
    quality,
    renderer,
    scene,
    camera,
    rememberedPose: () => returnPose || {x: body.x, z: body.z, yaw: body.yaw, pitch: body.pitch},
    flyToSpawn: ({ stay = false } = {}) => {
      if (returnPose) return flightPromise || Promise.resolve();
      const previousMode = input.mode;
      returnPose = {x: body.x, z: body.z, yaw: body.yaw, pitch: body.pitch};
      window.inteonStreet?.savePose(returnPose);
      input.setMode('idle');
      const origin = {...returnPose}, target = layout.spawn;
      const turn = Math.atan2(Math.sin(target.yaw-origin.yaw), Math.cos(target.yaw-origin.yaw));
      const started = performance.now();
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1150;
      return flightPromise = new Promise(resolve => {
        const fly = now => {
          const t = duration ? Math.min(1, (now-started)/duration) : 1;
          const blend = t*t*(3-2*t);
          // Bank clockwise, then start levelling before the snapshot takes over.
          const bank = t < .65 ? Math.sin(t/.65*Math.PI/2)*9 : 9-(t-.65)/.35*3;
          flightRoll = -bank * Math.PI/180;
          const aspect = Math.max(camera.aspect, 1 / camera.aspect);
          const cover = Math.max(1.045, (Math.cos(Math.PI/30) + aspect*Math.sin(Math.PI/30))*1.001);
          camera.fov = Math.atan(Math.tan(Math.PI/6)*(1+(cover-1)*blend))*360/Math.PI;
          camera.updateProjectionMatrix();
          body.x = origin.x + (target.x-origin.x)*blend;
          body.z = origin.z + (target.z-origin.z)*blend;
          body.yaw = origin.yaw + turn*blend;
          body.pitch = origin.pitch + ((target.pitch || 0)-origin.pitch)*blend;
          flightEye = layout.movement.eyeM + Math.sin(Math.PI*t)*Math.min(6, Math.hypot(target.x-origin.x,target.z-origin.z)*.15);
          placeCamera(); renderer.render(scene, camera);
          if (t<1 && !disposed) requestAnimationFrame(fly);
          else {
            Object.assign(body, target); flightEye = layout.movement.eyeM; placeCamera();
            if (stay) {
              returnPose = null; flightRoll = 0; camera.fov = 60; camera.updateProjectionMatrix();
              appliedLook = { ...input.sample().look }; input.setMode(previousMode); placeCamera();
              window.inteonStreet?.savePose(body);
            }
            renderer.render(scene, camera); requestAnimationFrame(() => { flightPromise = null; resolve(); });
          }
        };
        requestAnimationFrame(fly);
      });
    },
    renderSnapshot: () => { if (!disposed) renderer.render(scene, camera); },
    reading: () => reading,
    openPlayer: () => setReading(true),
  };
}
} catch (error) {
  fallback.querySelector("p").textContent = "Двор не удалось открыть на этом устройстве. Музыку можно слушать в обычном плеере.";
  fallback.hidden = false;
  canvas.hidden = true;
  document.body.classList.add("yard-unavailable");
  console.warn("Yard unavailable:", error);
}
