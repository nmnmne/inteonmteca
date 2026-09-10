const player = document.getElementById("album-player");
const perceptionVisual = document.getElementById("perception-visual");
const perceptionContext = perceptionVisual?.getContext("2d");
const immersiveMode = document.getElementById("immersive-mode");
const immersiveVisual = document.getElementById("immersive-visual");
const immersiveTitle = document.getElementById("immersive-title");
const immersiveArtist = document.getElementById("immersive-artist");
const playbackStatus = document.getElementById("playback-status");
const immersiveBack = document.getElementById("immersive-back");
const immersivePlay = document.getElementById("immersive-play");
const immersivePlayIcon = document.getElementById("immersive-play-icon");
const previousTrack = document.getElementById("previous-track");
const nextTrack = document.getElementById("next-track");
const trackProgress = document.getElementById("track-progress");
const trackVolume = document.getElementById("track-volume");
const currentTime = document.getElementById("current-time");
const durationTime = document.getElementById("duration-time");
const playlistList = document.getElementById("track-list");
const playlistShell = document.getElementById("playlist-shell");
const trackViewport = document.getElementById("track-viewport");
const scrollbar = document.getElementById("track-scrollbar");
const scrollbarThumb = document.getElementById("track-scrollbar-thumb");
const inkField = document.getElementById("ink-field");
const inkContext = inkField?.getContext("2d");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
const lowPowerDevice = isMobileViewport
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4);
let animationQuality = lowPowerDevice ? "low" : "high";
document.documentElement.dataset.animationQuality = animationQuality;
const logoWrap = document.querySelector(".logo-wrap");
const reactiveLogo = document.getElementById("reactive-logo");
const logoVector = document.getElementById("logo-vector");
const logoGaze = document.getElementById("logo-gaze");
const logoTurbulence = document.getElementById("logo-turbulence");
const logoDisplacement = document.getElementById("logo-displacement");
const logoSliceContainer = document.getElementById("logo-vector-slices");
const logoReactiveCanvas = document.getElementById("logo-reactive-canvas");
const logoReactiveContext = logoReactiveCanvas?.getContext("2d");
const logoParticles = document.getElementById("logo-particles");
const logoSymbolEcho = document.getElementById("logo-symbol-echo");
const uniqueCount = document.getElementById("unique-count");
const visitCount = document.getElementById("visit-count");
const authHint = document.getElementById("auth-hint");
const authPanel = document.getElementById("auth-panel");
const authEmailForm = document.getElementById("auth-email-form");
const authCodeForm = document.getElementById("auth-code-form");
const authEmail = document.getElementById("auth-email");
const authCode = document.getElementById("auth-code");
const authStatus = document.getElementById("auth-status");
const authClose = document.getElementById("auth-close");
const authLogout = document.getElementById("auth-logout");
const chatHint = document.getElementById("chat-hint");
const chatPanel = document.getElementById("chat-panel");
const chatStream = document.getElementById("chat-stream");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatClose = document.getElementById("chat-close");
const themeHint = document.getElementById("theme-hint");
const themePanel = document.getElementById("theme-panel");
const themeClose = document.getElementById("theme-close");
const themeSelect = document.getElementById("theme-select");
const themeDuration = document.getElementById("theme-duration");
const themeDurationOutput = document.getElementById("theme-duration-output");
const themeRandom = document.getElementById("theme-random");
const refreshMedia = document.getElementById("refresh-media");
const themeStatus = document.getElementById("theme-status");
const apiMeta = document.querySelector('meta[name="inteonmteca-api"]');
const isFileMode = location.protocol === "file:";
const canUseNetwork = location.protocol === "http:" || location.protocol === "https:";
const explicitApiBase = (apiMeta?.getAttribute("content") || "").replace(/\/$/, "");
const API_BASE = canUseNetwork ? explicitApiBase : "";
const sceneClock = { now: 0, energy: 0, bass: 0 };
const perceptionField = [];
const perceptionChars = "0123456789";
const motionState = { x: 0, y: 0, strength: 0 };
const motionTarget = { x: 0, y: 0, strength: 0 };
const motionVelocity = { x: 0, y: 0 };
const pointerState = { x: innerWidth * .5, y: innerHeight * .5, active: false };
const motionStrength = 2.8;
const audioContext = window.AudioContext || window.webkitAudioContext;
const audioNodes = new WeakMap();
let sharedAudioContext = null;
const immersiveState = { active: false, audio: null, analyser: null, data: null, raf: 0, lastDraw: 0, pointerX: 0, pointerY: 0 };
const spectrumState = { at: -Infinity, bass: 0, mid: 0, high: 0, avg: 0, flux: 0, previous: 0, peaks: [] };
const logoReactiveState = { x: 0, y: 0, hoverX: 0, hoverY: 0, proximity: 0, bass: 0, mid: 0, high: 0, energy: 0 };
const matrixElements = document.querySelectorAll(".matrix-text");
const prefersDynamicMotion = !prefersReducedMotion;
const particleGrid = animationQuality === "low" ? { cols: 12, rows: 4 } : { cols: 18, rows: 6 };
const logoText = "inteonmteca";
const logoLetters = [];
const matrixGlyphs = "01/\\|<>[]{}#$%&*+-=abcdefghijklmnopqrstuvwxyz";
const titleGlyphs = "∆⟟⌁⋮╱╲░▒◇◌01/\\|<>[]{}+-=";
const readableElements = new Set();
const matrixHoldStates = new WeakMap();
const matrixHoldRatio = 0.15;
const matrixHoldDuration = 1000;
const counterNamespace = "inteonmteca.online";
const uniqueStorageKey = "inteonmteca-unique-visit";
const counterBaseUrl = "https://abacus.jasoncameron.dev";
const TRACK_VIEW = 4;
const THEME_MIN_MS = 4 * 1000;
const THEME_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const THEME_DEFAULT_MS = 30 * 60 * 1000;
const themeNames = ["desert", "sunset", "abyss", "moss", "infrared", "amethyst", "glacier"];
const themeStorageKey = "inteonmteca-theme";
const themeDurationStorageKey = "inteonmteca-theme-duration";
const localSessionStorageKey = "inteonmteca-local-session";
const localAccountsStorageKey = "inteonmteca-local-accounts";
const localChatStorageKey = "inteonmteca-local-chat";
const emailFormat = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

let tracks = [];
let currentTrack = null;
let currentTrackIndex = -1;
let playlistRaf = 0;
let playlistScrollRaf = 0;
let playlistScrollTarget = 0;
let playlistScrollVelocity = 0;
let fullReadableMode = false;
let logoLocked = false;
let logoChaosActive = false;
let logoChargeTimeout;
let logoCycleTimeout;
let logoChaosCountdown = 0;
let pendingEmail = "";
let localLoginCode = "";
let sessionEmail = "";
let chatTimer = 0;
let chatGlyphs = [];
let draggingScroll = null;
let activeAudioNode = null;
let logoSlices = [];
let inkParticles = [];
let inkLastFrame = performance.now();
let inkLastEmission = 0;
let inkFieldBounds = null;
let perceptionLastFrame = 0;
let logoLastFrame = 0;
let titleLastFrame = 0;
let playlistLastFrame = 0;
let playlistSignature = "";
let playlistRefreshTimer = 0;
let themeRotationTimer = 0;
let themeShiftTimer = 0;
let slowFrameScore = 0;
let motionLastFrame = performance.now();
let playbackRequestId = 0;

const apiUrl = (path) => `${API_BASE}${path}`;

const renderInterval = () => animationQuality === "low" ? 52 : 34;

const setAnimationQuality = (quality) => {
  if (animationQuality === quality) return;
  animationQuality = quality;
  document.documentElement.dataset.animationQuality = quality;
  setupPerceptionField();
  resizeInkField();
  resizeLogoCanvas();
  sizeCanvas(immersiveVisual);
};

const recordFramePacing = (delta) => {
  if (document.hidden || animationQuality === "low") return;
  slowFrameScore = delta > 72 ? slowFrameScore + 1 : Math.max(0, slowFrameScore - .2);
  if (slowFrameScore > 20) setAnimationQuality("low");
};

const setMotion = (x, y, strength = 1) => {
  if (!prefersDynamicMotion) {
    motionTarget.x = 0;
    motionTarget.y = 0;
    motionTarget.strength = 0;
    return;
  }
  motionTarget.x = Math.max(-1, Math.min(1, x * motionStrength));
  motionTarget.y = Math.max(-1, Math.min(1, y * motionStrength));
  motionTarget.strength = Math.min(1, Math.max(0, strength));
};

const renderWeightedMotion = (now) => {
  const delta = Math.min(2.2, Math.max(.25, (now - motionLastFrame) / 16.67));
  motionLastFrame = now;
  const spring = .052 * delta;
  const damping = Math.pow(.82, delta);
  motionVelocity.x = (motionVelocity.x + (motionTarget.x - motionState.x) * spring) * damping;
  motionVelocity.y = (motionVelocity.y + (motionTarget.y - motionState.y) * spring) * damping;
  motionState.x += motionVelocity.x * delta;
  motionState.y += motionVelocity.y * delta;
  motionState.strength += (motionTarget.strength - motionState.strength) * (.055 * delta);
  document.documentElement.style.setProperty("--motion-x", motionState.x.toFixed(3));
  document.documentElement.style.setProperty("--motion-y", motionState.y.toFixed(3));
  document.documentElement.style.setProperty("--motion-strength", motionState.strength.toFixed(3));
  document.documentElement.style.setProperty("--hero-tilt-x", `${(motionState.x * 1.8).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--hero-tilt-y", `${(-motionState.y * 1.2).toFixed(2)}deg`);
  requestAnimationFrame(renderWeightedMotion);
};

const setPointerMotion = (event) => {
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  pointerState.active = true;
  const x = (event.clientX / Math.max(1, innerWidth) - .5) * 2;
  const y = (event.clientY / Math.max(1, innerHeight) - .5) * 2;
  setMotion(x, y, Math.min(1, Math.hypot(x, y)));
  immersiveState.pointerX += (x - immersiveState.pointerX) * .08;
  immersiveState.pointerY += (y - immersiveState.pointerY) * .08;
};

window.addEventListener("pointermove", setPointerMotion, { passive: true });
document.documentElement.addEventListener("pointerleave", () => {
  pointerState.active = false;
  setMotion(0, 0, 0);
}, { passive: true });
requestAnimationFrame(renderWeightedMotion);

const handleDeviceMotion = (event) => {
  const a = event.accelerationIncludingGravity;
  if (!a || prefersReducedMotion) return;
  const x = Math.max(-1, Math.min(1, (a.x || 0) / 5));
  const y = Math.max(-1, Math.min(1, (a.y || 0) / 5));
  setMotion(x, y, Math.min(1, Math.hypot(x, y)));
};

const handleDeviceOrientation = (event) => {
  if (prefersReducedMotion) return;
  const x = Math.max(-1, Math.min(1, (event.gamma || 0) / 30));
  const y = Math.max(-1, Math.min(1, ((event.beta || 0) - 45) / 30));
  setMotion(x, y, Math.min(1, Math.hypot(x, y)));
};

window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
  window.addEventListener("pointerdown", () => DeviceMotionEvent.requestPermission().catch(() => {}), { once: true, passive: true });
}

const canvasScale = () => Math.min(devicePixelRatio || 1, animationQuality === "low" ? 1 : 1.25);

const sizeCanvas = (canvas) => {
  if (!canvas) return;
  canvas.width = innerWidth * canvasScale();
  canvas.height = innerHeight * canvasScale();
};

const fractalLayer = document.createElement("canvas");
const fractalContext = fractalLayer.getContext("2d");
const smokeMaskLayer = document.createElement("canvas");
const smokeMaskContext = smokeMaskLayer.getContext("2d");
const hashUnit = (value) => {
  const raw = Math.sin(value * 91.721 + 17.17) * 43758.5453;
  return raw - Math.floor(raw);
};
const smokeEmitters = Array.from({ length: animationQuality === "low" ? 5 : 8 }, (_, index) => ({
  x: .08 + hashUnit(index + 1.2) * .84,
  y: .12 + hashUnit(index + 4.7) * .72,
  radius: .13 + hashUnit(index + 8.1) * .17,
  phase: hashUnit(index + 12.4) * Math.PI * 2,
  speed: .055 + hashUnit(index + 16.8) * .11,
  orbitX: .025 + hashUnit(index + 20.1) * .095,
  orbitY: .025 + hashUnit(index + 24.9) * .08,
}));

const setupPerceptionField = () => {
  if (!perceptionVisual || !perceptionContext) return;
  perceptionField.length = 0;
  const count = animationQuality === "low" ? 4 : 7;
  for (let index = 0; index < count; index += 1) {
    perceptionField.push({
      x: .08 + hashUnit(index + 31.2) * .84,
      y: .12 + hashUnit(index + 42.7) * .76,
      radius: .08 + hashUnit(index + 52.1) * .11,
      seed: index * 13.37 + 9,
      glyph: perceptionChars[Math.floor(hashUnit(index + 62.4) * perceptionChars.length)],
    });
  }
  sizeCanvas(perceptionVisual);
};

const renderPerceptionField = (now) => {
  if (!perceptionVisual || !perceptionContext) return;
  const elapsed = now - perceptionLastFrame;
  if (document.hidden || elapsed < renderInterval()) {
    requestAnimationFrame(renderPerceptionField);
    return;
  }
  recordFramePacing(elapsed);
  perceptionLastFrame = now;
  sceneClock.now = now;
  const energy = audioEnergy(now);
  const scale = canvasScale();
  perceptionContext.setTransform(scale, 0, 0, scale, 0, 0);
  perceptionContext.fillStyle = "rgba(7,6,6,.16)";
  perceptionContext.fillRect(0, 0, innerWidth, innerHeight);
  drawSmoke(perceptionContext, innerWidth, innerHeight, energy, now, immersiveState.active ? .55 : .3);
  perceptionContext.font = "11px ui-monospace, monospace";
  perceptionField.forEach((node, index) => {
    const breath = Math.max(0, Math.sin(now * .00018 + node.seed));
    const x = node.x * innerWidth + motionState.x * (8 + index * 1.3);
    const y = node.y * innerHeight + motionState.y * (6 + index);
    perceptionContext.fillStyle = `rgba(214,165,104,${(immersiveState.active ? .03 : .018) + breath * (immersiveState.active ? .09 : .055)})`;
    perceptionContext.fillText(node.glyph, x, y);
  });
  requestAnimationFrame(renderPerceptionField);
};

setupPerceptionField();
requestAnimationFrame(renderPerceptionField);
window.addEventListener("resize", setupPerceptionField, { passive: true });

const ensureAudioContext = async () => {
  if (!audioContext || isFileMode || !canUseNetwork) return null;
  try {
    sharedAudioContext ||= new audioContext();
    if (sharedAudioContext.state !== "running") await sharedAudioContext.resume();
    return sharedAudioContext.state === "running" ? sharedAudioContext : null;
  } catch {
    return null;
  }
};

const attachPlaybackAnalysis = async () => {
  const context = await ensureAudioContext();
  const node = getAudioNode(player, context);
  if (!node) return;
  activeAudioNode = node;
  immersiveState.analyser = node.analyser;
  immersiveState.data = node.data;
};

const getAudioNode = (audio, context = sharedAudioContext) => {
  if (!context || context.state !== "running" || !audio) return null;
  if (audioNodes.has(audio)) return audioNodes.get(audio);
  try {
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = .82;
    source.connect(analyser);
    analyser.connect(context.destination);
    const node = { context, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    audioNodes.set(audio, node);
    return node;
  } catch {
    return null;
  }
};

const averageBand = (data, from, to) => {
  const start = Math.max(0, Math.floor(data.length * from));
  const end = Math.max(start + 1, Math.floor(data.length * to));
  let total = 0;
  for (let index = start; index < end; index += 1) total += data[index];
  return total / (end - start) / 255;
};

const audioEnergy = (now = performance.now()) => {
  if (now - spectrumState.at < 10) return spectrumState;
  spectrumState.at = now;
  const node = activeAudioNode || (immersiveState.analyser ? {
    analyser: immersiveState.analyser,
    data: immersiveState.data,
  } : null);
  let bass = 0;
  let mid = 0;
  let high = 0;
  let avg = 0;
  const peaks = [];
  if (node?.analyser && node.data && player && !player.paused) {
    node.analyser.getByteFrequencyData(node.data);
    bass = averageBand(node.data, 0, .14);
    mid = averageBand(node.data, .14, .52);
    high = averageBand(node.data, .52, 1);
    avg = averageBand(node.data, 0, 1);
    node.data.forEach((value, index) => {
      if (value > 186 && index % 3 === 0) peaks.push(index);
    });
  }
  const flux = Math.min(1, Math.abs(avg - spectrumState.previous) * 8.5);
  spectrumState.previous = avg;
  spectrumState.bass += (bass - spectrumState.bass) * .24;
  spectrumState.mid += (mid - spectrumState.mid) * .2;
  spectrumState.high += (high - spectrumState.high) * .18;
  spectrumState.avg += (avg - spectrumState.avg) * .2;
  spectrumState.flux += (flux - spectrumState.flux) * .3;
  spectrumState.peaks = peaks;
  return spectrumState;
};

const ensureEffectLayers = (width, height) => {
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(height));
  if (fractalLayer.width !== targetWidth || fractalLayer.height !== targetHeight) {
    fractalLayer.width = targetWidth;
    fractalLayer.height = targetHeight;
    smokeMaskLayer.width = targetWidth;
    smokeMaskLayer.height = targetHeight;
  }
};

const smokeCloudsAt = (width, height, energy, now) => {
  const time = now * .001;
  const pointerX = immersiveState.active ? immersiveState.pointerX : motionState.x;
  const pointerY = immersiveState.active ? immersiveState.pointerY : motionState.y;
  const size = Math.min(width, height);
  return smokeEmitters.map((emitter, index) => {
    const lifeWave = (Math.sin(time * emitter.speed * Math.PI * 2 + emitter.phase) + 1) * .5;
    const life = .12 + Math.pow(lifeWave, 1.7) * .88;
    return {
      x: (emitter.x + Math.sin(time * emitter.speed + emitter.phase) * emitter.orbitX) * width + pointerX * (9 + index * 1.8),
      y: (emitter.y + Math.cos(time * emitter.speed * .77 + emitter.phase) * emitter.orbitY) * height + pointerY * (7 + index * 1.4),
      radius: size * emitter.radius * (.62 + life * .52 + energy.bass * .3),
      life,
      phase: emitter.phase,
      index,
    };
  });
};

const traceFractalBranch = (ctx, x, y, length, angle, depth, seed, now, energy) => {
  if (depth < 0 || length < 3) return;
  const time = now * .00022;
  const bend = (hashUnit(seed + depth * 3.1) - .5) * 1.2 + Math.sin(time + seed) * (.12 + energy.mid * .18);
  const endAngle = angle + bend;
  const endX = x + Math.cos(endAngle) * length;
  const endY = y + Math.sin(endAngle) * length;
  const normal = angle + Math.PI * .5;
  const kink = (hashUnit(seed + 8.8) - .5) * length * .44;
  const controlX = (x + endX) * .5 + Math.cos(normal) * kink;
  const controlY = (y + endY) * .5 + Math.sin(normal) * kink;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(controlX, controlY, endX, endY);
  ctx.stroke();
  if (depth === 0) {
    ctx.beginPath();
    ctx.arc(endX, endY, .7 + energy.high * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const spread = .34 + hashUnit(seed + 14.2) * .56;
  const shrink = .53 + hashUnit(seed + 19.6) * .15;
  traceFractalBranch(ctx, endX, endY, length * shrink, endAngle - spread, depth - 1, seed * 1.37 + 2.1, now, energy);
  traceFractalBranch(ctx, endX, endY, length * (shrink - .035), endAngle + spread * .82, depth - 1, seed * 1.61 + 5.4, now, energy);
  if (depth > 1 && hashUnit(seed + 27.3) > .72) {
    traceFractalBranch(ctx, endX, endY, length * .42, endAngle + Math.PI * (.68 + hashUnit(seed) * .28), depth - 2, seed * 1.83, now, energy);
  }
};

const traceFractalCell = (ctx, cx, cy, radius, seed, now, energy, depth) => {
  const sides = 5 + Math.floor(hashUnit(seed + 3) * 4);
  const turn = now * .000025 * (hashUnit(seed + 8) > .5 ? 1 : -1);
  for (let ring = 1; ring <= 3; ring += 1) {
    const points = [];
    for (let point = 0; point < sides; point += 1) {
      const angle = turn + (point / sides) * Math.PI * 2 + (hashUnit(seed + point * 2.7 + ring) - .5) * .7;
      const mutation = .42 + ring * .2 + Math.sin(now * .00016 + seed + point) * .045;
      points.push({
        x: cx + Math.cos(angle) * radius * mutation,
        y: cy + Math.sin(angle) * radius * mutation * (.52 + hashUnit(seed + point) * .5),
      });
    }
    ctx.beginPath();
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      if (index === 0) ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(
        cx + (point.x + next.x - cx * 2) * (.52 + hashUnit(seed + index) * .18),
        cy + (point.y + next.y - cy * 2) * (.52 + hashUnit(seed + index + 2) * .18),
        next.x,
        next.y,
      );
    });
    ctx.closePath();
    ctx.stroke();
    if (ring === 2) {
      points.forEach((point, index) => {
        if (index % 2) return;
        const angle = Math.atan2(point.y - cy, point.x - cx);
        traceFractalBranch(ctx, point.x, point.y, radius * .28, angle, depth, seed + index * 11.3, now, energy);
      });
    }
  }
};

const paintFractalLattice = (ctx, width, height, energy, now) => {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = .42 + energy.high * .8;
  ctx.strokeStyle = `rgba(231,176,111,${.28 + energy.mid * .42})`;
  ctx.shadowBlur = 4 + energy.bass * 15;
  ctx.shadowColor = `rgba(190,73,40,${.3 + energy.bass * .38})`;
  const depth = animationQuality === "low" ? 2 : 3;
  perceptionField.forEach((field, index) => {
    const parallax = .3 + index / Math.max(1, perceptionField.length);
    const x = field.x * width + motionState.x * 24 * parallax;
    const y = field.y * height + motionState.y * 18 * parallax;
    const radius = Math.min(width, height) * (field.radius + energy.bass * .025);
    traceFractalCell(ctx, x, y, radius, field.seed, now, energy, depth);
    traceFractalBranch(
      ctx,
      x,
      y,
      radius * 1.1,
      field.seed + now * .00004,
      depth + 1,
      field.seed * 2.3,
      now,
      energy,
    );
  });
  ctx.restore();
};

const paintSmokeMask = (ctx, width, height, clouds, energy, now) => {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  clouds.forEach((cloud) => {
    const lobes = 4;
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const angle = cloud.phase + lobe * 1.73 + now * .00008;
      const x = cloud.x + Math.cos(angle) * cloud.radius * .22;
      const y = cloud.y + Math.sin(angle * 1.13) * cloud.radius * .18;
      const radius = cloud.radius * (.62 + hashUnit(cloud.index * 9 + lobe) * .44);
      const gradient = ctx.createRadialGradient(x, y, radius * .04, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${.62 * cloud.life})`);
      gradient.addColorStop(.36, `rgba(255,255,255,${.38 * cloud.life})`);
      gradient.addColorStop(.72, `rgba(255,255,255,${.09 * cloud.life})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  ctx.restore();
};

const drawSmokeRevealedFractal = (ctx, width, height, energy, now, intensity = 1) => {
  if (!fractalContext || !smokeMaskContext || !perceptionField.length) return;
  ensureEffectLayers(width, height);
  const clouds = smokeCloudsAt(width, height, energy, now);
  paintFractalLattice(fractalContext, width, height, energy, now);
  paintSmokeMask(smokeMaskContext, width, height, clouds, energy, now);
  fractalContext.save();
  fractalContext.globalCompositeOperation = "destination-in";
  fractalContext.drawImage(smokeMaskLayer, 0, 0);
  fractalContext.restore();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = intensity * (.48 + energy.avg * .65);
  ctx.drawImage(fractalLayer, -motionState.x * 1.6, -motionState.y * 1.2);
  ctx.globalAlpha = intensity * (.12 + energy.high * .25);
  ctx.drawImage(fractalLayer, motionState.x * 4 + 2, motionState.y * 3 - 1);
  ctx.restore();
};

const drawGrid = drawSmokeRevealedFractal;

const drawSmoke = (ctx, width, height, energy, now, intensity = 1) => {
  const clouds = smokeCloudsAt(width, height, energy, now);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  clouds.forEach((cloud) => {
    for (let lobe = 0; lobe < 5; lobe += 1) {
      const angle = cloud.phase + lobe * 1.37 + now * .00011;
      const x = cloud.x + Math.cos(angle) * cloud.radius * .3;
      const y = cloud.y + Math.sin(angle * .83) * cloud.radius * .23;
      const radius = cloud.radius * (.38 + hashUnit(cloud.index * 7 + lobe) * .38);
      const alpha = intensity * cloud.life * (.014 + energy.avg * .035);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(235,173,111,${alpha * 1.3})`);
      gradient.addColorStop(.26, `rgba(139,57,37,${alpha})`);
      gradient.addColorStop(.68, `rgba(48,24,17,${alpha * .5})`);
      gradient.addColorStop(1, "rgba(8,6,5,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  ctx.restore();
};

const drawElectricity = (ctx, width, height, energy, now) => {
  const frame = Math.floor(now / 72);
  const impulse = Math.min(1, energy.flux * 2.4 + energy.high * .7 + energy.bass * .38);
  if (hashUnit(frame * 4.1) > impulse) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bolts = 1 + Math.floor(impulse * 3);
  for (let bolt = 0; bolt < bolts; bolt += 1) {
    const seed = frame * 17 + bolt * 23;
    const field = perceptionField[Math.floor(hashUnit(seed) * perceptionField.length)] || { x: .5, y: .3 };
    let x = field.x * width;
    let y = field.y * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 7 + Math.floor(hashUnit(seed + 2) * 10);
    for (let step = 0; step < steps; step += 1) {
      x += (hashUnit(seed + step * 8.3) - .5) * (48 + energy.high * 80);
      y += (hashUnit(seed + step * 5.7 + 4) - .22) * (42 + energy.bass * 55);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(232,255,178,${.12 + impulse * .55})`;
    ctx.lineWidth = .65 + energy.high * 2.4;
    ctx.shadowBlur = 10 + energy.bass * 24;
    ctx.shadowColor = "rgba(224,108,61,.85)";
    ctx.stroke();
  }
  ctx.restore();
};

const drawImmersiveScene = (now) => {
  if (!immersiveState.active || !immersiveVisual) return;
  const elapsed = now - immersiveState.lastDraw;
  if (document.hidden || elapsed < renderInterval()) {
    immersiveState.raf = requestAnimationFrame(drawImmersiveScene);
    return;
  }
  recordFramePacing(elapsed);
  immersiveState.lastDraw = now;
  const ctx = immersiveVisual.getContext("2d");
  if (!ctx) return;
  const energy = audioEnergy(now);
  sceneClock.now = now;
  sceneClock.energy = energy.avg;
  sceneClock.bass = energy.bass;
  const scale = canvasScale();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  drawSmoke(ctx, innerWidth, innerHeight, energy, now, 1.28);
  drawSmokeRevealedFractal(ctx, innerWidth, innerHeight, energy, now, 1.22);
  drawElectricity(ctx, innerWidth, innerHeight, energy, now);
  immersiveState.raf = requestAnimationFrame(drawImmersiveScene);
};

const drawLiquid = drawImmersiveScene;

const resizeInkField = () => {
  if (!inkField || !inkContext) return;
  inkFieldBounds = inkField.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  inkField.width = Math.max(1, Math.round(inkFieldBounds.width * scale));
  inkField.height = Math.max(1, Math.round(inkFieldBounds.height * scale));
  inkParticles = [];
};

const emitTitleInk = (now, energy) => {
  if (!inkField || !inkFieldBounds) return;
  const titles = [...document.querySelectorAll(".track-title")];
  const limit = animationQuality === "low" ? 150 : 320;
  titles.forEach((title, titleIndex) => {
    const rect = title.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 2) return;
    const item = title.closest(".track-item");
    if (!item || Number.parseFloat(getComputedStyle(item).opacity || "1") < .18) return;
    const amount = 1 + (energy.bass > .24 && (titleIndex + Math.floor(now / 120)) % 2 === 0 ? 1 : 0);
    for (let count = 0; count < amount && inkParticles.length < limit; count += 1) {
      const x = rect.left - inkFieldBounds.left + Math.random() * rect.width;
      const y = rect.top - inkFieldBounds.top + rect.height * (.62 + Math.random() * .24);
      const direction = Math.random() < .5 ? -1 : 1;
      inkParticles.push({
        x,
        y,
        previousX: x,
        previousY: y,
        vx: direction * (.08 + Math.random() * .34) + motionState.x * .08,
        vy: -.2 + Math.random() * .42,
        size: 2.1 + Math.random() * 5.2 + energy.bass * 3.4,
        age: 0,
        decay: .0026 + Math.random() * .0024,
        seed: Math.random() * Math.PI * 2,
        spin: direction * (.18 + Math.random() * .45),
        trail: [],
      });
    }
  });
};

const updateInkParticle = (particle, now, delta) => {
  particle.previousX = particle.x;
  particle.previousY = particle.y;
  const current = now * .00045 + particle.seed;
  particle.vx += Math.sin(current + particle.y * .011) * .018 * delta;
  particle.vy += Math.cos(current * 1.17 + particle.x * .008) * .012 * delta;
  particle.vy -= .006 * delta;

  if (pointerState.active && inkFieldBounds) {
    const pointerX = pointerState.x - inkFieldBounds.left;
    const pointerY = pointerState.y - inkFieldBounds.top;
    const dx = particle.x - pointerX;
    const dy = particle.y - pointerY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radius = 155;
    if (distance < radius) {
      const force = Math.pow(1 - distance / radius, 2) * .24 * delta;
      particle.vx += dx / distance * force;
      particle.vy += dy / distance * force;
      particle.spin += (dx / distance) * .008;
    }
  }

  particle.vx *= Math.pow(.986, delta);
  particle.vy *= Math.pow(.988, delta);
  particle.x += particle.vx * delta;
  particle.y += particle.vy * delta;
  particle.age += particle.decay * delta;
  particle.size += (.02 + particle.age * .06) * delta;
  if (Math.floor(particle.age * 180) % 3 === 0) {
    particle.trail.unshift({ x: particle.x, y: particle.y });
    if (particle.trail.length > 7) particle.trail.pop();
  }
};

const drawInkParticle = (ctx, particle) => {
  const alpha = Math.max(0, 1 - particle.age);
  if (particle.trail.length > 1) {
    ctx.beginPath();
    ctx.moveTo(particle.trail[0].x, particle.trail[0].y);
    particle.trail.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = `rgba(0,0,0,${alpha * .42})`;
    ctx.lineWidth = particle.size * (1.3 + particle.age * 2.2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.spin + Math.atan2(particle.vy, particle.vx || .001));
  ctx.scale(1.7 + particle.age * 3.8, .68 + particle.age * .55);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, particle.size * 1.8);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha * .94})`);
  gradient.addColorStop(.45, `rgba(1,1,1,${alpha * .74})`);
  gradient.addColorStop(.78, `rgba(9,5,4,${alpha * .3})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, particle.size * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(191,105,72,${alpha * .1})`;
  ctx.lineWidth = .45;
  ctx.stroke();
  ctx.restore();
};

const renderInkField = (now) => {
  if (!inkField || !inkContext) return;
  if (!inkFieldBounds?.width) resizeInkField();
  if (now - inkLastFrame < renderInterval()) {
    requestAnimationFrame(renderInkField);
    return;
  }
  const scale = inkField.width / Math.max(1, inkFieldBounds?.width || 1);
  const delta = Math.min(2.3, Math.max(.25, (now - inkLastFrame) / 16.67));
  inkLastFrame = now;
  inkContext.setTransform(scale, 0, 0, scale, 0, 0);
  inkContext.clearRect(0, 0, inkFieldBounds.width, inkFieldBounds.height);
  const energy = audioEnergy(now);
  const emissionDelay = prefersReducedMotion ? 420 : Math.max(74, 132 - energy.avg * 62);
  if (now - inkLastEmission > emissionDelay) {
    emitTitleInk(now, energy);
    inkLastEmission = now;
  }
  inkContext.save();
  inkContext.filter = `blur(${(.4 + energy.mid * 1.7).toFixed(2)}px)`;
  inkParticles.forEach((particle) => {
    updateInkParticle(particle, now, delta);
    drawInkParticle(inkContext, particle);
  });
  inkContext.restore();
  inkParticles = inkParticles.filter((particle) => (
    particle.age < 1
    && particle.x > -120
    && particle.x < inkFieldBounds.width + 120
    && particle.y > -120
    && particle.y < inkFieldBounds.height + 120
  ));
  requestAnimationFrame(renderInkField);
};

const mutateGlyphString = (text, intensity, frame, seed = 0) => [...text].map((character, index) => {
  if (/\s/.test(character)) return character;
  const gate = hashUnit(frame * .83 + index * 7.19 + seed * 13.7);
  if (gate > intensity) return character;
  return titleGlyphs[Math.floor(hashUnit(frame * 2.17 + index * 11.3 + seed) * titleGlyphs.length)];
}).join("");

const renderTitleMutation = (now) => {
  if (document.hidden || now - titleLastFrame < (animationQuality === "low" ? 120 : 68)) {
    requestAnimationFrame(renderTitleMutation);
    return;
  }
  titleLastFrame = now;
  const frame = Math.floor(now / (prefersReducedMotion ? 210 : 76));
  document.querySelectorAll(".track-title, .immersive-title").forEach((element, index) => {
    const original = element.dataset.originalText || element.textContent || "";
    if (!element.dataset.originalText) element.dataset.originalText = original;
    const hovering = Boolean(element.closest(".track-item")?.matches(":hover, :focus-within"));
    const phase = (now * .001 + index * 1.31) % 7.4;
    const wave = phase < .88 ? Math.sin((phase / .88) * Math.PI) : 0;
    const intensity = Math.min(.82, wave * .64 + (hovering ? .16 : 0));
    element.classList.toggle("is-scrambling", intensity > .05);
    element.textContent = intensity > .05
      ? mutateGlyphString(original, intensity, frame, index + 1)
      : original;
  });
  requestAnimationFrame(renderTitleMutation);
};

const renderLogoSymbolEcho = (now, energy) => {
  if (!logoSymbolEcho) return;
  const phase = (now * .001) % 11.6;
  const mutationWave = phase > 5.4 && phase < 7.6
    ? Math.sin(((phase - 5.4) / 2.2) * Math.PI)
    : 0;
  const intensity = Math.min(.94, mutationWave * .82 + energy.high * .16);
  const frame = Math.floor(now / (prefersReducedMotion ? 240 : 68));
  logoSymbolEcho.textContent = intensity > .04
    ? mutateGlyphString(logoText, intensity, frame, 47)
    : logoText;
  logoSymbolEcho.style.setProperty("--symbol-opacity", (.035 + mutationWave * .19 + energy.avg * .14).toFixed(3));
  logoSymbolEcho.style.setProperty("--symbol-blur", `${(1.1 + mutationWave * 2.8 + energy.bass * 2).toFixed(2)}px`);
};

const updateTrackFold = () => {
  if (!playlistList) return;
  if (immersiveState.active) {
    [...playlistList.querySelectorAll(".track-item")].forEach((item) => {
      if (!item.classList.contains("is-kept")) return;
      item.style.transform = "translate3d(0, 0, 28px) scale(1)";
      item.style.opacity = "1";
      item.style.filter = "none";
    });
    return;
  }
  const items = [...playlistList.querySelectorAll(".track-item")];
  const overflowing = items.length > TRACK_VIEW;
  const bounds = playlistList.getBoundingClientRect();
  const mid = bounds.top + bounds.height / 2;
  const half = Math.max(1, bounds.height / 2);
  items.forEach((item) => {
    if (item.classList.contains("is-departing")) return;
    if (item.classList.contains("is-kept")) {
      item.style.transform = "translate3d(0, 0, 12px) scale(1)";
      item.style.opacity = "1";
      item.style.filter = "none";
      return;
    }
    const rect = item.getBoundingClientRect();
    const offset = (rect.top + rect.height / 2 - mid) / half;
    const fold = Math.min(1, Math.abs(offset));
    const stretch = 1 - fold;
    const rotateX = offset * (overflowing ? 34 : 21);
    const bend = offset * (overflowing ? 9 : 4);
    const scaleY = overflowing ? 0.6 + stretch * .48 : 0.76 + stretch * .27;
    const scaleX = overflowing ? 0.84 + stretch * .2 : 0.88 + stretch * .13;
    const z = stretch * (overflowing ? 72 : 46) - fold * (overflowing ? 44 : 18);
    const melt = overflowing ? Math.max(0, Math.abs(offset) - .72) : 0;
    item.style.transform = `translate3d(0, ${offset * -8}px, ${z}px) rotateX(${rotateX}deg) rotateY(${bend}deg) scale(${scaleX}, ${scaleY})`;
    item.style.opacity = overflowing
      ? String(Math.max(0, 1 - melt * 2.15))
      : String(.78 + stretch * .22);
    item.style.filter = `blur(${(melt * 10).toFixed(2)}px)`;
  });
};

const updateScrollbar = () => {
  if (!playlistList || !scrollbar || !scrollbarThumb) return;
  const overflow = playlistList.querySelectorAll(".track-item").length > TRACK_VIEW;
  playlistList.classList.toggle("has-overflow", overflow);
  scrollbar.hidden = !overflow;
  if (!overflow) {
    playlistList.scrollTop = 0;
    return;
  }
  const trackHeight = scrollbar.clientHeight;
  const thumbHeight = 12;
  const max = playlistList.scrollHeight - playlistList.clientHeight;
  const top = max <= 0 ? 0 : (playlistList.scrollTop / max) * (trackHeight - thumbHeight);
  scrollbarThumb.style.height = `${thumbHeight}px`;
  scrollbarThumb.style.transform = `translateY(${top}px)`;
};

const loopPlaylistMotion = () => {
  const now = performance.now();
  if (document.hidden || now - playlistLastFrame < (animationQuality === "low" ? 90 : 50)) {
    playlistRaf = requestAnimationFrame(loopPlaylistMotion);
    return;
  }
  playlistLastFrame = now;
  updateTrackFold();
  updateScrollbar();
  playlistRaf = requestAnimationFrame(loopPlaylistMotion);
};

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
};

const setPlaybackStatus = (text = "", state = "") => {
  if (!playbackStatus) return;
  playbackStatus.textContent = text;
  playbackStatus.dataset.state = state;
};

const resolveTrackUrl = (track) => {
  const source = String(track?.audio || track?.file || "").replace(/\\/g, "/");
  if (!source) return "";
  if (isFileMode || !canUseNetwork) return encodeURI(source);
  try {
    return new URL(source, document.baseURI).href;
  } catch {
    return encodeURI(source);
  }
};

const findTrackForItem = (item) => {
  if (!item) return null;
  const indexedTrack = tracks[Number(item.dataset.trackIndex)];
  const title = item.dataset.trackTitle || "";
  const bundled = Array.isArray(window.INTEONMTECA_PLAYLIST) ? window.INTEONMTECA_PLAYLIST : [];
  return indexedTrack
    || tracks.find((candidate) => candidate.title === title)
    || bundled.find((candidate) => candidate.title === title)
    || tracks.find((candidate) => candidate.title.includes(title))
    || bundled.find((candidate) => candidate.title.includes(title))
    || null;
};

const playTrack = (track, sourceItem = null) => {
  if (!player || !track) return;
  const requestId = ++playbackRequestId;
  const wasImmersive = immersiveState.active;
  currentTrack = track;
  setPlaybackStatus("", "");
  document.body.classList.add("is-track-diving");
  currentTrackIndex = tracks.findIndex((candidate) => (
    candidate === track
    || candidate.audio === track.audio
    || candidate.file === track.file
  ));
  if (currentTrackIndex < 0 && Array.isArray(window.INTEONMTECA_PLAYLIST)) {
    tracks = tracks.length ? tracks : shuffle(window.INTEONMTECA_PLAYLIST.filter((item) => item?.audio));
    currentTrackIndex = tracks.findIndex((candidate) => (
      candidate.audio === track.audio || candidate.title === track.title
    ));
  }
  if (!sourceItem && currentTrackIndex >= 0) {
    sourceItem = playlistList?.querySelector(`[data-track-index="${currentTrackIndex}"]`) || null;
  }
  [...(playlistList?.querySelectorAll(".track-item") || [])].forEach((item) => {
    const keep = sourceItem ? item === sourceItem : Number(item.dataset.trackIndex) === currentTrackIndex;
    item.classList.toggle("is-kept", keep);
    item.classList.toggle("is-playing", keep);
    item.classList.remove("is-departing");
    if (keep) {
      item.style.opacity = "1";
      item.style.filter = "none";
      return;
    }
    if (wasImmersive) return;
    const dx = (Math.random() - 0.5) * 920;
    const dy = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 480);
    const dz = -120 - Math.random() * 280;
    item.classList.add("is-departing");
    const fly = `translate3d(${dx}px, ${dy}px, ${dz}px) rotateX(${dy / 28}deg) rotateY(${dx / 36}deg) scale(.42)`;
    window.requestAnimationFrame(() => {
      item.style.transform = fly;
      item.style.opacity = "0";
      item.style.filter = "blur(8px)";
    });
  });
  const src = resolveTrackUrl(track);
  if (player.getAttribute("src") !== src) player.src = src;
  const startSound = () => {
    if (requestId !== playbackRequestId) return;
    const attempt = player.play();
    if (!attempt || typeof attempt.then !== "function") {
      attachPlaybackAnalysis();
      syncTransport();
      return;
    }
    attempt.then(() => {
      if (requestId !== playbackRequestId) return;
      setPlaybackStatus();
      attachPlaybackAnalysis();
      syncTransport();
    }).catch((error) => {
      if (requestId !== playbackRequestId || error?.name === "AbortError") return;
      const message = error?.name === "NotAllowedError"
        ? "нажми ▶ чтобы пустить звук"
        : error?.name === "NotSupportedError"
          ? "этот файл браузер не играет"
          : "звук не открылся — нажми ▶";
      setPlaybackStatus(message, "error");
      syncTransport();
    });
  };
  startSound();
  window.setTimeout(() => {
    if (currentTrack === track) enterImmersiveMode(player, track);
  }, wasImmersive || prefersReducedMotion ? 0 : 280);
};

const renderPlaylist = (playlist, { force = false } = {}) => {
  if (!Array.isArray(playlist) || !playlistList) return false;
  const discovered = playlist.filter((track) => track?.audio && !String(track.audio).toLowerCase().includes("wave-phonk"));
  const nextSignature = discovered
    .map((track) => String(track.id || track.audio))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
  if (!force && tracks.length && nextSignature === playlistSignature) return false;
  if (!discovered.length) {
    tracks = [];
    playlistSignature = "";
    currentTrackIndex = -1;
    const emptyState = document.createElement("li");
    emptyState.className = "track-empty";
    emptyState.textContent = "media ожидает сигнал";
    playlistList.replaceChildren(emptyState);
    playlistScrollTarget = 0;
    playlistScrollVelocity = 0;
    updateScrollbar();
    return true;
  }
  const activeAudio = currentTrack?.audio || currentTrack?.file;
  tracks = shuffle(discovered);
  playlistSignature = nextSignature;
  currentTrackIndex = activeAudio
    ? tracks.findIndex((track) => (track.audio || track.file) === activeAudio)
    : -1;
  if (currentTrackIndex >= 0) currentTrack = tracks[currentTrackIndex];
  playlistList.replaceChildren(...tracks.map((track, index) => {
    const item = document.createElement("li");
    item.className = "track-item";
    item.dataset.trackTitle = track.title;
    item.dataset.trackIndex = String(index);
    const button = document.createElement("button");
    button.className = "track-select";
    button.type = "button";
    button.setAttribute("aria-label", `Воспроизвести ${track.title}`);
    const meta = document.createElement("span");
    meta.className = "track-meta";
    const title = document.createElement("span");
    title.className = "track-title";
    title.dataset.originalText = track.title;
    title.dataset.ink = track.title;
    title.textContent = track.title;
    const artist = document.createElement("span");
    artist.className = "track-artist";
    artist.textContent = track.artist || "inteonmteca";
    meta.append(title, artist);
    button.append(meta);
    item.append(button);
    return item;
  }));
  cancelAnimationFrame(playlistScrollRaf);
  playlistScrollRaf = 0;
  playlistScrollTarget = 0;
  playlistScrollVelocity = 0;
  playlistList.scrollTop = 0;
  updateTrackFold();
  updateScrollbar();
  return true;
};

const loadPlaylist = async ({ force = false, announce = false } = {}) => {
  if (!canUseNetwork) {
    if (Array.isArray(window.INTEONMTECA_PLAYLIST) && window.INTEONMTECA_PLAYLIST.length) {
      const changed = renderPlaylist(window.INTEONMTECA_PLAYLIST, { force });
      if (announce && themeStatus) themeStatus.textContent = changed ? "media из локального списка" : "media уже актуальна";
      return changed;
    }
    if (announce && themeStatus) themeStatus.textContent = "открой сайт через start-site.cmd";
    return false;
  }
  const sources = ["/api/playlist", `playlist.json?v=${Date.now()}`];
  for (const source of sources) {
    try {
      const response = await fetch(apiUrl(source), { cache: "no-store" });
      if (!response.ok) continue;
      const playlist = await response.json();
      if (Array.isArray(playlist)) {
        const changed = renderPlaylist(playlist, { force });
        if (announce && themeStatus) {
          themeStatus.textContent = changed ? "media обновлена" : "media уже актуальна";
        }
        return changed;
      }
    } catch {}
  }
  if (announce && themeStatus) themeStatus.textContent = "не удалось прочитать media";
  return false;
};

const bindFallbackTracks = () => {
  const randomizedItems = shuffle([...(playlistList?.querySelectorAll(".track-item") || [])]);
  playlistList?.replaceChildren(...randomizedItems);
  randomizedItems.forEach((item, index) => {
    item.dataset.trackIndex = String(index);
    const titleElement = item.querySelector(".track-title");
    if (titleElement) {
      titleElement.dataset.originalText = titleElement.textContent;
      titleElement.dataset.ink = titleElement.textContent;
    }
  });
};

playlistList?.addEventListener("click", (event) => {
  const button = event.target.closest(".track-select");
  if (!button || !playlistList.contains(button)) return;
  event.preventDefault();
  const item = button.closest(".track-item");
  const track = findTrackForItem(item);
  if (track) playTrack(track, item);
});

const restoreTrackStage = () => {
  [...(playlistList?.querySelectorAll(".track-item") || [])].forEach((item) => {
    item.classList.remove("is-departing", "is-kept", "is-playing");
    item.style.transform = "";
    item.style.opacity = "";
    item.style.filter = "";
  });
  updateTrackFold();
};

const enterImmersiveMode = (audio, track = null) => {
  if (!immersiveMode || !audio) return;
  sceneClock.now = performance.now();
  immersiveState.active = true;
  immersiveState.lastDraw = 0;
  immersiveState.audio = audio;
  const node = activeAudioNode;
  if (node) {
    activeAudioNode = node;
    immersiveState.analyser = node.analyser;
    immersiveState.data = node.data;
  }
  const item = audio.closest?.(".track-item");
  const title = track?.title || item?.dataset.trackTitle || "трек";
  immersiveTitle.textContent = title;
  immersiveTitle.dataset.originalText = title;
  immersiveTitle.dataset.ink = title;
  immersiveArtist.textContent = track?.artist || item?.querySelector(".track-artist")?.textContent.trim() || "inteonmteca";
  immersiveMode.setAttribute("aria-hidden", "false");
  immersiveMode.classList.add("is-active");
  document.body.classList.remove("is-track-diving");
  document.body.classList.add("is-immersive");
  sizeCanvas(immersiveVisual);
  syncTransport();
  cancelAnimationFrame(immersiveState.raf);
  immersiveState.raf = requestAnimationFrame(drawImmersiveScene);
};

const exitImmersiveMode = () => {
  playbackRequestId += 1;
  immersiveState.active = false;
  immersiveState.audio?.pause();
  immersiveState.audio = null;
  immersiveMode?.classList.remove("is-active");
  immersiveMode?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-track-diving");
  document.body.classList.remove("is-immersive");
  cancelAnimationFrame(immersiveState.raf);
  setPlaybackStatus();
  restoreTrackStage();
};

const formatTime = (value) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const syncTransport = () => {
  if (!player) return;
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const progress = duration > 0 ? player.currentTime / duration : 0;
  const seekValue = `${(progress * 100).toFixed(2)}%`;
  trackProgress?.parentElement?.style.setProperty("--seek", seekValue);
  if (trackProgress && document.activeElement !== trackProgress) {
    trackProgress.value = String(Math.round(progress * 1000));
    trackProgress.style.setProperty("--seek", seekValue);
  }
  if (currentTime) currentTime.textContent = formatTime(player.currentTime);
  if (durationTime) durationTime.textContent = formatTime(duration);
  if (immersivePlayIcon) immersivePlayIcon.textContent = player.paused ? "▶" : "Ⅱ";
  if (immersivePlay) immersivePlay.setAttribute("aria-label", player.paused ? "Воспроизвести" : "Пауза");
};

const togglePlayback = () => {
  if (!player || !currentTrack) return;
  if (player.paused) {
    setPlaybackStatus("", "");
    player.play()
      .then(() => {
        setPlaybackStatus();
        attachPlaybackAnalysis();
      })
      .catch(() => setPlaybackStatus("нажми ▶ ещё раз", "error"));
  } else {
    player.pause();
  }
};

const playRelativeTrack = (offset) => {
  if (!tracks.length) return;
  const start = currentTrackIndex >= 0 ? currentTrackIndex : 0;
  const nextIndex = (start + offset + tracks.length) % tracks.length;
  playTrack(tracks[nextIndex], playlistList?.querySelector(`[data-track-index="${nextIndex}"]`) || null);
};

immersiveBack?.addEventListener("click", exitImmersiveMode);
immersivePlay?.addEventListener("click", togglePlayback);
previousTrack?.addEventListener("click", () => playRelativeTrack(-1));
nextTrack?.addEventListener("click", () => playRelativeTrack(1));
trackProgress?.addEventListener("input", () => {
  if (!player || !Number.isFinite(player.duration)) return;
  player.currentTime = (Number(trackProgress.value) / 1000) * player.duration;
  syncTransport();
});
trackVolume?.addEventListener("input", () => {
  if (player) player.volume = Number(trackVolume.value);
});
if (player && trackVolume) player.volume = Number(trackVolume.value);
player?.addEventListener("timeupdate", syncTransport);
player?.addEventListener("durationchange", syncTransport);
player?.addEventListener("play", syncTransport);
player?.addEventListener("pause", syncTransport);
player?.addEventListener("playing", () => setPlaybackStatus());
player?.addEventListener("waiting", () => setPlaybackStatus("сигнал буферизуется…", "loading"));
player?.addEventListener("stalled", () => setPlaybackStatus("соединение с media замедлилось", "error"));
player?.addEventListener("error", () => {
  const messages = {
    1: "воспроизведение остановлено",
    2: "не удалось загрузить аудиофайл",
    3: "ошибка декодирования аудио",
    4: "формат аудио не поддерживается",
  };
  setPlaybackStatus(messages[player.error?.code] || "не удалось открыть аудиофайл", "error");
});
player?.addEventListener("ended", () => {
  if (tracks.length > 1) playRelativeTrack(1);
  else exitImmersiveMode();
});
window.addEventListener("keydown", (event) => {
  if (!immersiveState.active || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
  if (event.key === "Escape") exitImmersiveMode();
  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
  }
  if (event.key === "ArrowLeft" && player) player.currentTime = Math.max(0, player.currentTime - 8);
  if (event.key === "ArrowRight" && player && Number.isFinite(player.duration)) player.currentTime = Math.min(player.duration, player.currentTime + 8);
});
window.addEventListener("resize", () => {
  sizeCanvas(immersiveVisual);
  resizeInkField();
  updateTrackFold();
  updateScrollbar();
}, { passive: true });
sizeCanvas(immersiveVisual);
resizeInkField();

const animatePlaylistScroll = () => {
  if (!playlistList) return;
  const max = Math.max(0, playlistList.scrollHeight - playlistList.clientHeight);
  playlistScrollTarget = Math.max(0, Math.min(max, playlistScrollTarget));
  const distance = playlistScrollTarget - playlistList.scrollTop;
  playlistScrollVelocity = (playlistScrollVelocity + distance * .075) * .8;
  const nextPosition = Math.max(0, Math.min(max, playlistList.scrollTop + playlistScrollVelocity));
  playlistList.scrollTop = nextPosition;
  if (Math.abs(distance) < .35 && Math.abs(playlistScrollVelocity) < .12) {
    playlistList.scrollTop = playlistScrollTarget;
    playlistScrollVelocity = 0;
    playlistScrollRaf = 0;
    return;
  }
  playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
};

trackViewport?.addEventListener("wheel", (event) => {
  if (!playlistList) return;
  const max = playlistList.scrollHeight - playlistList.clientHeight;
  if (max <= 0) return;
  event.preventDefault();
  const lineScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20 : 1;
  const pageScale = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? playlistList.clientHeight : 1;
  const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  const delta = rawDelta * lineScale * pageScale;
  if (!playlistScrollRaf) playlistScrollTarget = playlistList.scrollTop;
  playlistScrollTarget = Math.max(0, Math.min(max, playlistScrollTarget + delta * .92));
  playlistScrollVelocity += Math.max(-18, Math.min(18, delta * .035));
  if (!playlistScrollRaf) playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
}, { passive: false });

playlistList?.addEventListener("scroll", () => {
  if (!playlistScrollRaf) playlistScrollTarget = playlistList.scrollTop;
  updateTrackFold();
  updateScrollbar();
}, { passive: true });

scrollbarThumb?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  cancelAnimationFrame(playlistScrollRaf);
  playlistScrollRaf = 0;
  playlistScrollVelocity = 0;
  draggingScroll = { startY: event.clientY, startTop: playlistList.scrollTop };
  scrollbarThumb.setPointerCapture(event.pointerId);
});

scrollbarThumb?.addEventListener("pointermove", (event) => {
  if (!draggingScroll || !playlistList || !scrollbar) return;
  const max = playlistList.scrollHeight - playlistList.clientHeight;
  const trackTravel = scrollbar.clientHeight - scrollbarThumb.clientHeight;
  if (trackTravel <= 0) return;
  const delta = event.clientY - draggingScroll.startY;
  playlistList.scrollTop = draggingScroll.startTop + (delta / trackTravel) * max;
  playlistScrollTarget = playlistList.scrollTop;
});

scrollbarThumb?.addEventListener("pointerup", () => {
  draggingScroll = null;
});

const setPanelOpen = (panel, open) => {
  if (!panel) return;
  panel.hidden = !open;
  panel.setAttribute("aria-hidden", String(!open));
};

const readStoredValue = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const storeValue = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
};

const readStoredJson = (key, fallback) => {
  try {
    const value = JSON.parse(readStoredValue(key) || "");
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const createLoginCode = () => {
  if (window.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return String(value[0] % 1000000).padStart(6, "0");
  }
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
};

const rememberLocalAccount = (email) => {
  const accounts = readStoredJson(localAccountsStorageKey, []);
  if (!accounts.includes(email)) {
    accounts.push(email);
    storeValue(localAccountsStorageKey, JSON.stringify(accounts));
  }
};

const themeSliderToDuration = (value) => {
  const progress = Math.max(0, Math.min(1, Number(value) / 1000));
  const duration = THEME_MIN_MS * Math.pow(THEME_MAX_MS / THEME_MIN_MS, progress);
  const quantum = duration < 60000 ? 1000 : duration < 3600000 ? 10000 : 60000;
  return Math.max(THEME_MIN_MS, Math.min(THEME_MAX_MS, Math.round(duration / quantum) * quantum));
};

const themeDurationToSlider = (duration) => {
  const safeDuration = Math.max(THEME_MIN_MS, Math.min(THEME_MAX_MS, Number(duration) || THEME_DEFAULT_MS));
  return Math.round(Math.log(safeDuration / THEME_MIN_MS) / Math.log(THEME_MAX_MS / THEME_MIN_MS) * 1000);
};

const formatThemeDuration = (duration) => {
  if (duration < 60000) return `${Math.round(duration / 1000)} секунд`;
  const minutes = Math.round(duration / 60000);
  if (minutes < 90) return `${minutes} минут`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} часов`;
  const days = Math.max(2, Math.round(hours / 24));
  return days >= 7 ? "1 неделя" : `${days} дней`;
};

const currentThemeDuration = () => themeSliderToDuration(themeDuration?.value || themeDurationToSlider(THEME_DEFAULT_MS));

const updateThemeDurationLabel = () => {
  const duration = currentThemeDuration();
  if (themeDurationOutput) themeDurationOutput.textContent = formatThemeDuration(duration);
  return duration;
};

const setTheme = (name, { animate = true, persist = true } = {}) => {
  const nextTheme = themeNames.includes(name) ? name : "desert";
  const root = document.documentElement;
  const changed = root.dataset.theme !== nextTheme;
  if (changed && animate && !prefersReducedMotion) {
    root.classList.remove("is-theme-shifting");
    void root.offsetWidth;
    root.classList.add("is-theme-shifting");
    window.clearTimeout(themeShiftTimer);
    themeShiftTimer = window.setTimeout(() => root.classList.remove("is-theme-shifting"), 1650);
  }
  root.dataset.theme = nextTheme;
  if (themeSelect) themeSelect.value = nextTheme;
  if (persist) storeValue(themeStorageKey, nextTheme);
  if (changed && themeStatus) {
    themeStatus.textContent = themeSelect?.selectedOptions[0]?.textContent || nextTheme;
  }
};

const randomizeTheme = () => {
  const current = document.documentElement.dataset.theme;
  const available = themeNames.filter((name) => name !== current);
  setTheme(available[Math.floor(Math.random() * available.length)] || "desert");
};

const scheduleThemeRotation = () => {
  window.clearTimeout(themeRotationTimer);
  const duration = updateThemeDurationLabel();
  storeValue(themeDurationStorageKey, duration);
  themeRotationTimer = window.setTimeout(() => {
    randomizeTheme();
    scheduleThemeRotation();
  }, duration);
};

const initializeThemeSystem = () => {
  const storedTheme = readStoredValue(themeStorageKey);
  const storedDuration = Number(readStoredValue(themeDurationStorageKey)) || THEME_DEFAULT_MS;
  if (themeDuration) themeDuration.value = String(themeDurationToSlider(storedDuration));
  setTheme(storedTheme || "desert", { animate: false, persist: false });
  scheduleThemeRotation();
};

themeHint?.addEventListener("click", () => {
  const opening = Boolean(themePanel?.hidden);
  setPanelOpen(themePanel, opening);
  if (opening) themeSelect?.focus();
});
themeClose?.addEventListener("click", () => setPanelOpen(themePanel, false));
themeSelect?.addEventListener("change", () => {
  setTheme(themeSelect.value);
  scheduleThemeRotation();
});
themeDuration?.addEventListener("input", updateThemeDurationLabel);
themeDuration?.addEventListener("change", scheduleThemeRotation);
themeRandom?.addEventListener("click", () => {
  randomizeTheme();
  scheduleThemeRotation();
});
refreshMedia?.addEventListener("click", () => loadPlaylist({ force: true, announce: true }));

const schedulePlaylistRefresh = () => {
  window.clearTimeout(playlistRefreshTimer);
  if (!canUseNetwork) return;
  playlistRefreshTimer = window.setTimeout(async () => {
    if (!document.hidden) await loadPlaylist();
    schedulePlaylistRefresh();
  }, 30000);
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  perceptionLastFrame = performance.now();
  inkLastFrame = performance.now();
  logoLastFrame = performance.now();
  if (canUseNetwork) loadPlaylist();
});

const setAuthStatus = (text) => {
  if (authStatus) authStatus.textContent = text;
};

const refreshAuthHint = () => {
  if (!authHint) return;
  authHint.textContent = sessionEmail ? sessionEmail.split("@")[0] : "вход";
  if (authLogout) authLogout.hidden = !sessionEmail;
  if (authEmailForm) authEmailForm.hidden = Boolean(sessionEmail);
  if (sessionEmail && authCodeForm) authCodeForm.hidden = true;
};

const requestJson = async (path, options = {}) => {
  if (!canUseNetwork) throw new Error("local-auth");
  let response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("сервер входа не запущен — открой сайт через start-site.cmd");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("API входа не подключён к этому адресу сайта");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
};

const loadSession = async () => {
  if (isFileMode) {
    sessionEmail = readStoredValue(localSessionStorageKey) || "";
    refreshAuthHint();
    return;
  }
  try {
    const data = await requestJson("/api/auth/me");
    sessionEmail = data.email || "";
  } catch {
    sessionEmail = "";
  }
  refreshAuthHint();
};

authHint?.addEventListener("click", () => {
  setPanelOpen(authPanel, true);
  if (sessionEmail) {
    setAuthStatus(sessionEmail);
    return;
  }
  authEmail?.focus();
});

authLogout?.addEventListener("click", async () => {
  if (isFileMode) {
    try {
      localStorage.removeItem(localSessionStorageKey);
    } catch {}
  } else {
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {}
  }
  sessionEmail = "";
  refreshAuthHint();
  setPanelOpen(authPanel, false);
  closeChat();
  setAuthStatus("вышли");
});

authClose?.addEventListener("click", () => setPanelOpen(authPanel, false));

authEmailForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  pendingEmail = authEmail?.value.trim().toLowerCase() || "";
  setAuthStatus("отправляем код…");
  try {
    if (isFileMode) {
      if (!emailFormat.test(pendingEmail)) throw new Error("нужна почта в обычном формате");
      rememberLocalAccount(pendingEmail);
      localLoginCode = createLoginCode();
      authCodeForm.hidden = false;
      setAuthStatus(`код входа: ${localLoginCode}`);
      authCode?.focus();
      return;
    }
    const data = await requestJson("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail }),
    });
    authCodeForm.hidden = false;
    const directCode = data.login_code || data.dev_code;
    setAuthStatus(directCode ? `код входа: ${directCode}` : "письмо отправлено — проверь почту");
    authCode?.focus();
  } catch (error) {
    setAuthStatus(error.message === "request failed" ? "сервер входа недоступен" : error.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});

authCodeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  setAuthStatus("проверяем…");
  try {
    if (isFileMode) {
      if (authCode?.value.trim() !== localLoginCode) throw new Error("код не подошёл");
      sessionEmail = pendingEmail;
      storeValue(localSessionStorageKey, sessionEmail);
      refreshAuthHint();
      setPanelOpen(authPanel, false);
      setAuthStatus("");
      return;
    }
    const data = await requestJson("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail, code: authCode?.value.trim() }),
    });
    sessionEmail = data.email || pendingEmail;
    refreshAuthHint();
    setPanelOpen(authPanel, false);
    setAuthStatus("");
  } catch (error) {
    setAuthStatus(error.message === "request failed" ? "код не подошёл" : error.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});

const animateChatGlyphs = (now) => {
  const t = now * 0.001;
  const beat = (Math.sin(t * 1.45) + 1) / 2;
  chatGlyphs.forEach((glyph, index) => {
    const wave = Math.sin(t * 1.7 + index * 0.42) * 9;
    const helixX = Math.cos(t * 0.9 + index * 0.26) * (5 + beat * 10);
    const helixZ = Math.sin(t * 0.9 + index * 0.26) * (10 + beat * 18);
    const rotY = Math.sin(t * 1.1 + index * 0.2) * 20;
    const rotX = Math.cos(t * 0.8 + index * 0.16) * 14;
    const rotZ = Math.sin(t * 0.6 + index * 0.12) * 8;
    const scale = 1 + Math.sin(t * 2.2 + index * 0.3) * 0.09;
    glyph.style.transform = `translate3d(${helixX}px, ${wave}px, ${helixZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg) scale(${scale})`;
  });
  if (!chatPanel?.hidden) requestAnimationFrame(animateChatGlyphs);
};

const renderChatMessages = (messages) => {
  if (!chatStream) return;
  chatStream.replaceChildren();
  chatGlyphs = [];
  (messages || []).slice(-12).forEach((message) => {
    const line = document.createElement("div");
    line.className = "chat-line";
    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = (message.email || "").split("@")[0] || "гость";
    line.append(meta);
    [...String(message.text || "")].forEach((char) => {
      const glyph = document.createElement("span");
      glyph.className = "chat-glyph";
      glyph.textContent = char === " " ? "\u00a0" : char;
      line.append(glyph);
      chatGlyphs.push(glyph);
    });
    chatStream.append(line);
  });
  requestAnimationFrame(animateChatGlyphs);
};

const loadChat = async () => {
  if (isFileMode) {
    renderChatMessages(readStoredJson(localChatStorageKey, []));
    return;
  }
  try {
    const data = await requestJson("/api/chat");
    renderChatMessages(data.messages || data);
  } catch {
    if (!chatStream.childElementCount) {
      renderChatMessages([{ email: "inteonmteca", text: "воздух молчит" }]);
    }
  }
};

const openChat = async () => {
  if (!sessionEmail) {
    setPanelOpen(authPanel, true);
    setAuthStatus("сначала почта");
    return;
  }
  setPanelOpen(chatPanel, true);
  chatHint.style.opacity = "0";
  await loadChat();
  chatInput?.focus();
  window.clearInterval(chatTimer);
  chatTimer = window.setInterval(loadChat, 2500);
};

const closeChat = () => {
  setPanelOpen(chatPanel, false);
  if (chatHint) chatHint.style.opacity = "";
  window.clearInterval(chatTimer);
};

chatHint?.addEventListener("click", openChat);
chatClose?.addEventListener("click", closeChat);
chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = chatInput?.value.trim();
  if (!text) return;
  try {
    if (isFileMode) {
      const messages = readStoredJson(localChatStorageKey, []);
      messages.push({
        id: Date.now(),
        email: sessionEmail,
        text,
        created_at: Math.floor(Date.now() / 1000),
      });
      storeValue(localChatStorageKey, JSON.stringify(messages.slice(-80)));
      chatInput.value = "";
      renderChatMessages(messages);
      return;
    }
    await requestJson("/api/chat", { method: "POST", body: JSON.stringify({ text }) });
    chatInput.value = "";
    await loadChat();
  } catch (error) {
    renderChatMessages([{ email: "система", text: error.message === "request failed" ? "нет связи" : error.message }]);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (immersiveState.active) {
    exitImmersiveMode();
    return;
  }
  setPanelOpen(authPanel, false);
  closeChat();
});

const updateCounterText = (element, value) => {
  if (!element || value === null || value === undefined) return;
  element.textContent = String(value);
};

const readCounterValue = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("counter unavailable");
  const data = await response.json();
  return data.value;
};

const bumpCounter = (key) => readCounterValue(`${counterBaseUrl}/hit/${counterNamespace}/${key}`);
const loadCounter = async (key) => {
  try {
    return await readCounterValue(`${counterBaseUrl}/get/${counterNamespace}/${key}`);
  } catch {
    return null;
  }
};

const setupVisitCounter = async () => {
  if (!uniqueCount && !visitCount) return;
  try {
    const visits = await bumpCounter("visits");
    updateCounterText(visitCount, visits);
    if (localStorage.getItem(uniqueStorageKey)) {
      updateCounterText(uniqueCount, await loadCounter("unique"));
      return;
    }
    const unique = await bumpCounter("unique");
    localStorage.setItem(uniqueStorageKey, "1");
    updateCounterText(uniqueCount, unique);
  } catch {
    updateCounterText(uniqueCount, "--");
    updateCounterText(visitCount, "--");
  }
};

const randomGlyph = () => matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
const isStaticChar = (char) => [" ", ".", "-", "—", "/"].includes(char);
const randomRange = (min, max) => Math.random() * (max - min) + min;
const randomInteger = (min, max) => Math.floor(randomRange(min, max + 1));

const getMatrixHoldState = (element, original) => {
  let state = matrixHoldStates.get(element);
  if (!state || state.length !== original.length) {
    state = { heldIndexes: new Set(), length: original.length, nextShuffleAt: 0, rendered: "" };
    matrixHoldStates.set(element, state);
  }
  return state;
};

const shuffleMatrixHoldIndexes = (state, original, now) => {
  if (now < state.nextShuffleAt) return;
  const indexes = [...original].map((char, index) => (isStaticChar(char) ? null : index)).filter((index) => index !== null);
  const holdCount = Math.max(1, Math.round(indexes.length * matrixHoldRatio));
  state.heldIndexes = new Set(shuffle(indexes).slice(0, holdCount));
  state.nextShuffleAt = now + matrixHoldDuration;
};

const renderMatrixNoise = (element) => {
  if (fullReadableMode || readableElements.has(element)) return;
  const original = element.dataset.originalText || element.textContent;
  const state = getMatrixHoldState(element, original);
  const now = Date.now();
  shuffleMatrixHoldIndexes(state, original, now);
  const nextText = [...original].map((char, index) => {
    if (isStaticChar(char)) return char;
    if (state.heldIndexes.has(index) && state.rendered[index]) return state.rendered[index];
    return Math.random() < 0.16 ? char : randomGlyph();
  }).join("");
  state.rendered = nextText;
  element.textContent = nextText;
};

const revealText = (element) => {
  const original = element.dataset.originalText || element.textContent;
  readableElements.add(element);
  element.classList.remove("is-matrixing");
  element.classList.add("is-readable");
  element.textContent = original;
  window.setTimeout(() => {
    element.classList.remove("is-readable");
    element.classList.add("is-matrixing");
    readableElements.delete(element);
    renderMatrixNoise(element);
  }, 780);
};

const runReadableWave = () => {
  matrixElements.forEach((element, index) => {
    window.setTimeout(() => revealText(element), index * 140);
  });
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const logoFilamentSeeds = Array.from({ length: animationQuality === "low" ? 28 : 52 }, (_, index) => ({
  x: .08 + hashUnit(index + 101.3) * .84,
  y: .32 + hashUnit(index + 141.8) * .36,
  phase: hashUnit(index + 181.4) * Math.PI * 2,
  size: .35 + hashUnit(index + 221.9) * 1.45,
  band: index % 3,
}));

const setupLogoSlices = () => {
  if (!logoVector || !logoSliceContainer) return;
  const defs = logoVector.querySelector("defs");
  if (!defs) return;
  logoSlices = [];
  logoSliceContainer.replaceChildren();
  const count = animationQuality === "low" ? 14 : 24;
  for (let index = 0; index < count; index += 1) {
    const clip = document.createElementNS(SVG_NAMESPACE, "clipPath");
    const clipId = `logo-slice-clip-${index}`;
    clip.id = clipId;
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const clipRect = document.createElementNS(SVG_NAMESPACE, "rect");
    const sliceHeight = 107 / count + .8;
    clipRect.setAttribute("x", "-40");
    clipRect.setAttribute("y", String(index * 107 / count - .4));
    clipRect.setAttribute("width", "614");
    clipRect.setAttribute("height", String(sliceHeight));
    clip.append(clipRect);
    defs.append(clip);

    const image = document.createElementNS(SVG_NAMESPACE, "image");
    image.classList.add("logo-slice");
    image.setAttribute("href", "assets/logo-wordmark.svg");
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", "534");
    image.setAttribute("height", "107");
    image.setAttribute("clip-path", `url(#${clipId})`);
    image.dataset.index = String(index);
    logoSliceContainer.append(image);
    logoSlices.push(image);
  }
};

const resizeLogoCanvas = () => {
  if (!logoReactiveCanvas || !logoReactiveContext) return;
  const bounds = logoReactiveCanvas.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  logoReactiveCanvas.width = Math.max(1, Math.round(bounds.width * scale));
  logoReactiveCanvas.height = Math.max(1, Math.round(bounds.height * scale));
};

const updateLogoPointer = (event) => {
  if (!logoWrap) return;
  const bounds = logoWrap.getBoundingClientRect();
  const x = (event.clientX - (bounds.left + bounds.width * .5)) / Math.max(1, bounds.width * .5);
  const y = (event.clientY - (bounds.top + bounds.height * .5)) / Math.max(1, bounds.height * .5);
  const distance = Math.hypot(x * .75, y);
  logoReactiveState.hoverX = Math.max(-1.35, Math.min(1.35, x));
  logoReactiveState.hoverY = Math.max(-1.35, Math.min(1.35, y));
  logoReactiveState.proximity = Math.max(0, Math.min(1, 1.5 - distance));
};

window.addEventListener("pointermove", updateLogoPointer, { passive: true });
logoWrap?.addEventListener("pointerleave", () => {
  logoReactiveState.proximity *= .35;
});

const drawLogoFilaments = (now, profile) => {
  if (!logoReactiveCanvas || !logoReactiveContext) return;
  const bounds = logoReactiveCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const scale = logoReactiveCanvas.width / bounds.width;
  const ctx = logoReactiveContext;
  const width = bounds.width;
  const height = bounds.height;
  const t = now * .001;
  const pointerX = (.5 + logoReactiveState.x * .34) * width;
  const pointerY = (.5 + logoReactiveState.y * .28) * height;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const strandCount = animationQuality === "low" ? 5 : 9;
  for (let strand = 0; strand < strandCount; strand += 1) {
    ctx.beginPath();
    const steps = 34;
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const x = width * (.08 + progress * .84);
      const base = height * (.5 + (strand - (strandCount - 1) * .5) * .021);
      const octaveA = Math.sin(progress * Math.PI * (3 + strand % 4) + t * (.35 + profile.mid) + strand);
      const octaveB = Math.sin(progress * Math.PI * 11 + t * .62 + strand * 2.1);
      const nearPointer = Math.exp(-Math.pow((x - pointerX) / Math.max(1, width * .19), 2));
      const y = base
        + octaveA * (4 + profile.bass * 18)
        + octaveB * (1.2 + profile.high * 7)
        + nearPointer * (pointerY - base) * .13 * logoReactiveState.proximity;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const green = strand % 3 === 0;
    ctx.strokeStyle = green
      ? `rgba(204,255,105,${.025 + profile.high * .18})`
      : `rgba(224,112,64,${.025 + profile.mid * .14})`;
    ctx.lineWidth = .35 + profile.bass * 1.2;
    ctx.shadowBlur = 4 + profile.high * 16;
    ctx.shadowColor = green ? "rgba(201,255,97,.55)" : "rgba(224,92,51,.5)";
    ctx.stroke();
  }

  logoFilamentSeeds.forEach((particle, index) => {
    const bandEnergy = particle.band === 0 ? profile.bass : particle.band === 1 ? profile.mid : profile.high;
    const orbit = t * (.18 + particle.band * .12) + particle.phase;
    let x = particle.x * width + Math.cos(orbit) * (4 + bandEnergy * 20);
    let y = particle.y * height + Math.sin(orbit * 1.7) * (3 + bandEnergy * 13);
    const dx = x - pointerX;
    const dy = y - pointerY;
    const pull = Math.exp(-(dx * dx + dy * dy) / Math.max(1, width * width * .035)) * logoReactiveState.proximity;
    x += (pointerX - x) * pull * .12;
    y += (pointerY - y) * pull * .12;
    const alpha = .04 + bandEnergy * .45 + profile.flux * .25;
    ctx.fillStyle = particle.band === 2
      ? `rgba(214,255,118,${alpha})`
      : `rgba(239,168,104,${alpha})`;
    ctx.shadowBlur = 5 + bandEnergy * 18;
    ctx.shadowColor = particle.band === 2 ? "#d6ff76" : "#dc7042";
    ctx.beginPath();
    ctx.arc(x, y, particle.size * (1 + bandEnergy * 1.8), 0, Math.PI * 2);
    ctx.fill();
    if (index % 7 === 0 && bandEnergy > .08) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(orbit * 2.3) * (8 + bandEnergy * 34), y + Math.sin(orbit * 1.9) * (5 + bandEnergy * 18));
      ctx.strokeStyle = `rgba(244,220,167,${alpha * .45})`;
      ctx.lineWidth = .45;
      ctx.stroke();
    }
  });
  ctx.restore();
};

const setLogoCssVariable = (name, value) => {
  document.documentElement.style.setProperty(name, value);
  logoWrap?.style.setProperty(name, value);
};

const renderReactiveLogo = (now) => {
  if (document.hidden || now - logoLastFrame < renderInterval()) {
    requestAnimationFrame(renderReactiveLogo);
    return;
  }
  logoLastFrame = now;
  const profile = audioEnergy(now);
  renderLogoSymbolEcho(now, profile);
  const motionLimit = prefersReducedMotion ? .14 : 1;
  const pointerMix = logoReactiveState.proximity * .72;
  const targetX = (motionState.x * (1 - pointerMix) + logoReactiveState.hoverX * pointerMix) * motionLimit;
  const targetY = (motionState.y * (1 - pointerMix) + logoReactiveState.hoverY * pointerMix) * motionLimit;
  logoReactiveState.x += (targetX - logoReactiveState.x) * .085;
  logoReactiveState.y += (targetY - logoReactiveState.y) * .085;
  logoReactiveState.bass += (profile.bass - logoReactiveState.bass) * .18;
  logoReactiveState.mid += (profile.mid - logoReactiveState.mid) * .16;
  logoReactiveState.high += (profile.high - logoReactiveState.high) * .14;
  logoReactiveState.energy += (profile.avg - logoReactiveState.energy) * .16;

  const x = logoReactiveState.x;
  const y = logoReactiveState.y;
  const bass = logoReactiveState.bass;
  const mid = logoReactiveState.mid;
  const high = logoReactiveState.high;
  const energy = logoReactiveState.energy;
  setLogoCssVariable("--logo-x", `${(x * 12).toFixed(2)}px`);
  setLogoCssVariable("--logo-y", `${(y * 8).toFixed(2)}px`);
  setLogoCssVariable("--logo-rx", `${(-y * 9).toFixed(2)}deg`);
  setLogoCssVariable("--logo-ry", `${(x * 13).toFixed(2)}deg`);
  const live = immersiveState.active ? 1.45 : 1;
  setLogoCssVariable("--logo-scale", (1 + (bass * .075 + profile.flux * .025) * live).toFixed(4));
  setLogoCssVariable("--logo-bass", Math.min(1, bass * live).toFixed(4));
  setLogoCssVariable("--logo-mid", Math.min(1, mid * live).toFixed(4));
  setLogoCssVariable("--logo-high", Math.min(1, high * live).toFixed(4));
  setLogoCssVariable("--logo-energy", Math.min(1, energy * live).toFixed(4));

  if (logoGaze) {
    const size = 150 + bass * 72 + logoReactiveState.proximity * 26;
    logoGaze.setAttribute("x", String(267 + x * 224 - size * .5));
    logoGaze.setAttribute("y", String(53.5 + y * 58 - size * .5));
    logoGaze.setAttribute("width", String(size));
    logoGaze.setAttribute("height", String(size));
    logoGaze.setAttribute("rx", String(size * .5));
  }
  if (logoTurbulence) {
    logoTurbulence.setAttribute(
      "baseFrequency",
      `${(.0035 + high * .012).toFixed(4)} ${(.031 + mid * .075).toFixed(4)}`,
    );
  }
  if (logoDisplacement) {
    const chaos = logoChaosActive ? 12 : 0;
    const liveWarp = immersiveState.active ? 8 : 0;
    logoDisplacement.setAttribute("scale", String(1.4 + bass * 13 + high * 8 + profile.flux * 14 + chaos + liveWarp));
  }

  const sliceForce = high * 8 + profile.flux * 13 + (logoChaosActive ? 12 : 0) + (immersiveState.active ? 7 : 0);
  logoSlices.forEach((slice, index) => {
    const normalized = index / Math.max(1, logoSlices.length - 1) - .5;
    const phase = now * .0023 + index * 1.91;
    const dx = Math.sin(phase) * sliceForce * (.3 + Math.abs(normalized)) + x * normalized * 9;
    const dy = Math.cos(phase * .73) * sliceForce * .11 + y * normalized * 3;
    const skew = Math.sin(phase * .41) * (high * 3 + (logoChaosActive ? 5 : 0));
    slice.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) skewX(${skew.toFixed(2)}deg)`;
    slice.style.opacity = String(Math.min(.9, .06 + high * .34 + profile.flux * .45 + (logoChaosActive ? .18 : 0)));
  });

  drawLogoFilaments(now, profile);
  requestAnimationFrame(renderReactiveLogo);
};

const scatterLogoParticles = () => {
  if (!logoParticles) return;
  const particles = [...logoParticles.querySelectorAll(".logo-particle")];
  const shuffledCells = shuffle(particles.map((_, index) => ({
    col: index % particleGrid.cols,
    row: Math.floor(index / particleGrid.cols),
  })));
  particles.forEach((particle, index) => {
    const cell = shuffledCells[index];
    particle.style.setProperty("--bg-x", particleGrid.cols === 1 ? "0%" : `${((cell.col / (particleGrid.cols - 1)) * 100).toFixed(4)}%`);
    particle.style.setProperty("--bg-y", particleGrid.rows === 1 ? "0%" : `${((cell.row / (particleGrid.rows - 1)) * 100).toFixed(4)}%`);
    particle.style.setProperty("--scatter-x", `${randomRange(-110, 110).toFixed(1)}px`);
    particle.style.setProperty("--scatter-y", `${randomRange(-64, 64).toFixed(1)}px`);
    particle.style.setProperty("--scatter-z", `${randomRange(-160, 160).toFixed(1)}px`);
    particle.style.setProperty("--scatter-r", `${randomRange(-34, 34).toFixed(1)}deg`);
    particle.style.setProperty("--scatter-scale", randomRange(0.62, 1.28).toFixed(2));
  });
};

const setupLogoParticles = () => {
  if (!logoParticles) return;
  const { cols, rows } = particleGrid;
  logoParticles.textContent = "";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const particle = document.createElement("span");
      particle.className = "logo-particle";
      particle.style.setProperty("--cols", cols);
      particle.style.setProperty("--rows", rows);
      particle.style.setProperty("--x", ((col / cols) * 100).toFixed(4));
      particle.style.setProperty("--y", ((row / rows) * 100).toFixed(4));
      particle.dataset.bgX = cols === 1 ? "0%" : `${((col / (cols - 1)) * 100).toFixed(4)}%`;
      particle.dataset.bgY = rows === 1 ? "0%" : `${((row / (rows - 1)) * 100).toFixed(4)}%`;
      particle.style.setProperty("--bg-x", particle.dataset.bgX);
      particle.style.setProperty("--bg-y", particle.dataset.bgY);
      logoParticles.appendChild(particle);
    }
  }
  scatterLogoParticles();
};

const restoreLogoTileOrder = () => {
  logoParticles?.querySelectorAll(".logo-particle").forEach((particle) => {
    particle.style.setProperty("--bg-x", particle.dataset.bgX || "0%");
    particle.style.setProperty("--bg-y", particle.dataset.bgY || "0%");
  });
};

const shuffleLogoTiles = () => {
  const particles = [...(logoParticles?.querySelectorAll(".logo-particle") || [])];
  const shuffledTiles = shuffle(particles.map((particle) => ({
    bgX: particle.dataset.bgX || "0%",
    bgY: particle.dataset.bgY || "0%",
  })));
  particles.forEach((particle, index) => {
    particle.style.setProperty("--bg-x", shuffledTiles[index].bgX);
    particle.style.setProperty("--bg-y", shuffledTiles[index].bgY);
  });
};

const renderLogoMatrix = (readable = false) => {
  logoWrap?.classList.toggle("is-assembled", readable);
  logoWrap?.classList.toggle("is-charging", readable);
  if (logoChargeTimeout) window.clearTimeout(logoChargeTimeout);
  if (readable) {
    logoChargeTimeout = window.setTimeout(() => logoWrap?.classList.remove("is-charging"), 1350);
    restoreLogoTileOrder();
  } else {
    scatterLogoParticles();
  }
};

const setAllTextReadable = (isReadable) => {
  fullReadableMode = isReadable;
  logoWrap?.classList.toggle("is-stable", isReadable);
  if (isReadable) renderLogoMatrix(true);
  matrixElements.forEach((element) => {
    const original = element.dataset.originalText || element.textContent;
    if (isReadable) {
      readableElements.add(element);
      element.classList.remove("is-matrixing");
      element.classList.add("is-readable");
      element.textContent = original;
      return;
    }
    element.classList.remove("is-readable");
    element.classList.add("is-matrixing");
    readableElements.delete(element);
    renderMatrixNoise(element);
  });
};

const runLongReadableMoment = () => {
  if (logoChaosActive) return;
  logoLocked = true;
  logoWrap?.classList.add("is-stable");
  renderLogoMatrix(true);
  window.setTimeout(() => setAllTextReadable(true), 520);
  window.setTimeout(() => setAllTextReadable(false), 4120);
  window.setTimeout(() => {
    logoLocked = false;
    logoWrap?.classList.remove("is-stable");
  }, 5200);
};

const resetLogoChaosCountdown = () => {
  logoChaosCountdown = randomInteger(5, 10);
};

const runLongLogoChaos = () => {
  if (logoChaosActive) return;
  if (logoCycleTimeout) window.clearTimeout(logoCycleTimeout);
  logoLocked = false;
  fullReadableMode = false;
  logoChaosActive = true;
  logoWrap?.classList.remove("is-stable", "is-assembled", "is-charging", "is-assembling");
  restoreLogoTileOrder();
  logoWrap?.classList.add("is-long-chaos");
  shuffleLogoTiles();
  const chaosDuration = randomRange(20000, 30000);
  const jitterInterval = window.setInterval(() => shuffleLogoTiles(), 90);
  window.setTimeout(() => {
    window.clearInterval(jitterInterval);
    logoChaosActive = false;
    logoWrap?.classList.remove("is-long-chaos");
    restoreLogoTileOrder();
    logoWrap?.classList.add("is-assembling");
    renderLogoMatrix(true);
    resetLogoChaosCountdown();
    window.setTimeout(() => {
      logoWrap?.classList.remove("is-assembling");
      logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
    }, 320);
  }, chaosDuration);
};

const runLogoCycle = () => {
  if (logoChaosActive) {
    logoCycleTimeout = window.setTimeout(runLogoCycle, 1200);
    return;
  }
  if (fullReadableMode || logoLocked) {
    renderLogoMatrix(true);
    logoCycleTimeout = window.setTimeout(runLogoCycle, 1200);
    return;
  }
  logoChaosCountdown -= 1;
  if (logoChaosCountdown <= 0) {
    runLongLogoChaos();
    return;
  }
  renderLogoMatrix(false);
  const chaosDuration = randomRange(2000, 16000);
  window.setTimeout(() => {
    if (logoChaosActive) return;
    logoWrap?.classList.add("is-assembling");
    renderLogoMatrix(true);
    window.setTimeout(() => logoWrap?.classList.remove("is-assembling"), 320);
    logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
  }, chaosDuration);
};

matrixElements.forEach((element) => {
  element.dataset.originalText = element.textContent;
  element.classList.add("is-matrixing");
});

window.setInterval(() => {
  if (!document.hidden) matrixElements.forEach(renderMatrixNoise);
}, prefersReducedMotion ? 360 : 95);
window.setTimeout(runReadableWave, 1200);
window.setInterval(runReadableWave, 6200);
window.setTimeout(runLongReadableMoment, 3200);
window.setInterval(runLongReadableMoment, 9500);
setupLogoSlices();
setupLogoParticles();
resizeLogoCanvas();
renderLogoMatrix(true);
resetLogoChaosCountdown();
logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
requestAnimationFrame(renderReactiveLogo);
requestAnimationFrame(renderInkField);
requestAnimationFrame(renderTitleMutation);
window.addEventListener("resize", resizeLogoCanvas, { passive: true });

bindFallbackTracks();
if (Array.isArray(window.INTEONMTECA_PLAYLIST) && window.INTEONMTECA_PLAYLIST.length) {
  renderPlaylist(window.INTEONMTECA_PLAYLIST);
}
initializeThemeSystem();
loadPlaylist();
schedulePlaylistRefresh();
loadSession();
loopPlaylistMotion();

window.addEventListener("DOMContentLoaded", () => {
  setupVisitCounter();
  updateScrollbar();
});
