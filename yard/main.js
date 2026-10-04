import * as THREE from "./vendor/three.module.js";
import { distanceToWall, isWalkable, moveCircle } from "./navigation.js";
import { createInputController } from "./input-controller.js";
import { createQualityMeter, pixelRatioCap } from "./quality.js";
import { createYardScene, drawScheme } from "./scene.js";
import { createWallPlayer } from "./wall-player.js";

const fallback = document.querySelector("#file-fallback");
const canvas = document.querySelector("#yard-view");
const prompt = document.querySelector("#open-player");
const scheme = document.querySelector("#scheme");
const schemeCanvas = document.querySelector("#scheme-canvas");
const walkButton = document.querySelector("#enter-walk");
const player = createWallPlayer(document);
const meter = createQualityMeter();
let layout = null;
if (location.protocol !== "file:") {
  layout = await fetch(new URL("./data/site-layout.json", import.meta.url)).then((response) => {
    if (!response.ok) throw new Error(`site-layout ${response.status}`);
    return response.json();
  });
}

if (location.protocol === "file:") {
  fallback.hidden = false;
  canvas.hidden = true;
} else {
  const schemeMap = drawScheme(schemeCanvas, layout);
  await player.load();
  const { scene, solids } = createYardScene(layout);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 400);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatioCap());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

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
  const input = createInputController(window, {
    walkSpeed: layout.movement.speedMps,
    sprintSpeed: layout.movement.sprintMps || 3.8,
  });
  const raycaster = new THREE.Raycaster();
  let nearWall = false;
  let reading = false;
  let last = performance.now();
  let frameHandle = null;
  let appliedLook = { yaw: 0, pitch: 0 };
  const syncLook = (next) => {
    body.yaw += next.yaw - appliedLook.yaw;
    body.pitch = Math.max(-1.1, Math.min(1.1, body.pitch + next.pitch - appliedLook.pitch));
    appliedLook = next;
  };

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  resize();
  window.addEventListener("resize", resize);

  const placeCamera = () => {
    camera.position.set(body.x, layout.movement.eyeM, body.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = -body.yaw;
    camera.rotation.x = body.pitch;
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
    input.setMode(next ? "interacting" : "paused");
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
    if (input.beginLook(event.pointerId, event.clientX, event.clientY)) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (reading || input.lookPointer.id !== event.pointerId) return;
    syncLook(input.moveLook(event.pointerId, event.clientX, event.clientY, 0.005));
  });
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  let marked = null;
  const scheduleFrame = () => {
    if (!document.hidden && frameHandle === null) frameHandle = requestAnimationFrame(frame);
  };
  const frame = (now) => {
    frameHandle = null;
    meter.tick(now);
    const dt = Math.min(layout.movement.maxDeltaSec, (now - last) / 1000);
    last = now;
    if (input.mode === "walking" && !reading && !document.hidden) {
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
    placeCamera();
    updateNear();
    if (!marked || marked.x !== body.x || marked.z !== body.z || marked.yaw !== body.yaw) {
      marked = { x: body.x, z: body.z, yaw: body.yaw };
      schemeMap.drawMarker(body.x, body.z, body.yaw);
    }
    if (!document.hidden) renderer.render(scene, camera);
    scheduleFrame();
  };
  placeCamera();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      last = performance.now();
      scheduleFrame();
    }
  });
  scheduleFrame();

  window.__yard = {
    layout,
    body,
    meter,
    renderer,
    scene,
    camera,
    reading: () => reading,
    openPlayer: () => setReading(true),
  };
}
