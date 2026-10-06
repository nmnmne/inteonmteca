// Select the mobile renderer before acquiring contexts or constructing effects.
const backgroundViewport = window.matchMedia("(max-width: 800px), (pointer: coarse)");
let isMobileViewport = backgroundViewport.matches;
const isListeningRoom = document.body.classList.contains("spatial-room");
document.documentElement.dataset.backgroundMode = isMobileViewport ? "static" : "live";
const player = document.getElementById("album-player");
const perceptionVisual = document.getElementById("perception-visual");
let perceptionContext = isMobileViewport ? null : perceptionVisual?.getContext("2d");
const immersiveMode = document.getElementById("immersive-mode");
const immersiveVisual = document.getElementById("immersive-visual");
const immersiveTitle = document.getElementById("immersive-title");
const immersiveArtist = document.getElementById("immersive-artist");
const playbackStatus = document.getElementById("playback-status");
const activePlayer = document.getElementById("active-player");
const activeTrackArtist = document.getElementById("active-track-artist");
const immersiveBack = document.getElementById("immersive-back");
const immersivePlay = document.getElementById("immersive-play");
const immersivePlayIcon = document.getElementById("immersive-play-icon");
// One-time typography setup; CSS carries the restrained letter wave, no JS loop.
const spatialHeading = document.querySelector(".spatial-room .listening-intro h1");
if (spatialHeading) {
  spatialHeading.setAttribute("aria-label", spatialHeading.textContent.replace(/\s+/g, " ").trim());
  let letterIndex = 0;
  const wrapHeadingLetters = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const fragment = document.createDocumentFragment();
        for (const character of node.textContent) {
          if (/\s/.test(character)) { fragment.append(document.createTextNode(character)); continue; }
          const letter = document.createElement("span");
          letter.className = "heading-letter";
          letter.style.setProperty("--letter", letterIndex++);
          letter.setAttribute("aria-hidden", "true");
          letter.textContent = character;
          fragment.append(letter);
        }
        node.replaceWith(fragment);
      } else if (node.nodeType === Node.ELEMENT_NODE) wrapHeadingLetters(node);
    });
  };
  wrapHeadingLetters(spatialHeading);
}
const nowPlayingTitle = document.getElementById("now-playing-title");
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
let inkContext = isMobileViewport || isListeningRoom ? null : inkField?.getContext("2d");
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = reducedMotionPreference.matches;
const lowPowerDevice = isMobileViewport
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4);
let animationQuality = lowPowerDevice ? "low" : "high";
document.documentElement.dataset.animationQuality = animationQuality;
let particleGrid = animationQuality === "low" ? { cols: 12, rows: 4 } : { cols: 18, rows: 6 };
const logoWrap = document.querySelector(".logo-wrap");
const reactiveLogo = document.getElementById("reactive-logo");
const logoVector = document.getElementById("logo-vector");
const logoGaze = document.getElementById("logo-gaze");
const logoTurbulence = document.getElementById("logo-turbulence");
const logoDisplacement = document.getElementById("logo-displacement");
const logoSliceContainer = document.getElementById("logo-vector-slices");
const logoReactiveCanvas = document.getElementById("logo-reactive-canvas");
let logoReactiveContext = isMobileViewport || isListeningRoom ? null : logoReactiveCanvas?.getContext("2d");
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
const authCodeLabel = document.getElementById("auth-code-label");
const authStatus = document.getElementById("auth-status");
const authClose = document.getElementById("auth-close");
const authLogout = document.getElementById("auth-logout");
const chatHint = document.getElementById("chat-hint");
const chatPanel = document.getElementById("chat-panel");
const inlineChat = chatPanel?.classList.contains("chat-inline");
const chatStream = document.getElementById("chat-stream");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatClose = document.getElementById("chat-close");
const compactChatViewport = window.matchMedia("(max-width: 1100px), (max-height: 540px)");
const themeHint = document.getElementById("theme-hint");
const themePanel = document.getElementById("theme-panel");
const themeClose = document.getElementById("theme-close");
const themeSelect = document.getElementById("theme-select");
const themeDuration = document.getElementById("theme-duration");
const themeDurationOutput = document.getElementById("theme-duration-output");
const themeRandom = document.getElementById("theme-random");
const themeStatus = document.getElementById("theme-status");
const streetLink = document.getElementById("street-link");
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
const matrixElements = document.querySelectorAll(".matrix-text[data-matrix-noise]");
const prefersDynamicMotion = !prefersReducedMotion;
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
const TRACK_VIEW = 5;
const THEME_MIN_MS = 4 * 1000;
const THEME_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const THEME_DEFAULT_MS = 8 * 1000;
// Curated collection: sixteen colorful atmospheres, two nights and two daylight palettes.
// Row: id | Russian label | background panel light-a light-b light-c accent text | mood.
const themeCoreFilters = Object.freeze({
  desert: { canvas: "none", logo: "none", fog: "18px", opacity: ".82" },
  sunset: { canvas: "hue-rotate(22deg) saturate(1.28)", logo: "hue-rotate(23deg) saturate(1.24)", fog: "22px", opacity: "1" },
  abyss: { canvas: "hue-rotate(165deg) saturate(1.42)", logo: "hue-rotate(162deg) saturate(1.48)", fog: "20px", opacity: ".82" },
  moss: { canvas: "hue-rotate(58deg) saturate(1.28)", logo: "hue-rotate(57deg) saturate(1.4)", fog: "16px", opacity: ".82" },
  infrared: { canvas: "hue-rotate(-22deg) saturate(1.7) contrast(1.08)", logo: "hue-rotate(-25deg) saturate(1.65)", fog: "18px", opacity: ".82" },
  amethyst: { canvas: "hue-rotate(226deg) saturate(1.5)", logo: "hue-rotate(224deg) saturate(1.55)", fog: "22px", opacity: ".82" },
  glacier: { canvas: "hue-rotate(148deg) saturate(.92) brightness(1.08)", logo: "hue-rotate(150deg) saturate(.82) brightness(1.1)", fog: "22px", opacity: ".8" },
  porcelain: { canvas: "hue-rotate(8deg) saturate(.95)", logo: "hue-rotate(10deg) saturate(.9)", fog: "18px", opacity: ".8" },
  graphite: { canvas: "hue-rotate(200deg) saturate(.62)", logo: "hue-rotate(198deg) saturate(.58)", fog: "18px", opacity: ".78" },
  oxblood: { canvas: "hue-rotate(-18deg) saturate(1.2)", logo: "hue-rotate(-16deg) saturate(1.16)", fog: "18px", opacity: ".84" },
});
const themeRegistry = Object.freeze([
  "desert|пустынная ртуть|3b2a19 23180e f3b966 d78855 c7d87a d3ff69 fff4df|color",
  "sunset|перегретый закат|492329 291b20 ff9556 ed5971 e8bd68 ffdb96 fff0e9|color",
  "moss|радиоактивный мох|263b15 15250f b7ee4b 64b454 e1c46a d5ff66 f3ffdc|color",
  "infrared|инфракрасный сон|4b192b 2a1320 ff626b e54836 ffaf6e ffb18f ffe9e4|color",
  "amethyst|аметистовый мираж|352452 211632 cb8cf0 9078e7 ec9bbb e3c0ff f9edff|color",
  "glacier|ледяная память|1c3d53 132936 98e8f3 4ba3dc 9fbaff c6fff9 e8fbff|color",
  "terracotta|пыльная терракота|4c3228 2d211a e9a076 c9826a f2c697 ebd0a3 fff1e2|color",
  "saffron|нить шафрана|494018 2d2714 e9cc55 e6a250 cad68a f6eab6 fff7da|color",
  "pistachio|скорлупа фисташки|35422a 232c1e bddd99 8ebf97 d8b68d d9eab7 f5f8e9|color",
  "mint-copper|мята и медь|1c483b 153024 8ee6b4 5eb6a6 e2aa7f d9ead0 f1faed|color",
  "petrol|петролевая эмаль|16464c 112f33 69d9df 4c9fba e5c994 b8f0eb e4faff|color",
  "ceramic-blue|синяя керамика|223c63 15243e 82b5f3 678ce1 e5b48d bed7ff eaf4ff|color",
  "indigo|потёртый индиго|303364 20213d 989fee 7278cc dda5be c8d2ff f0f0ff|color",
  "wisteria|сухая глициния|453552 2b2233 cdb0e7 9f8dc9 e3c8a8 e6d1ef f8efff|color",
  "hibiscus|чай каркаде|502b46 301c2a e78cb5 c16d9c efb19b f2c1dc ffedf7|color",
  "apricot|абрикосовая замша|4b382a 30251c efba8b d39c79 d7dca0 f2d0a9 fff3e4|color",
  "abyss|ультрамариновая глубина|030914 070c19 296dba 183b74 583777 9cb9d6 e8efff|dark",
  "graphite|мягкий графит|0c0e10 17191c 576267 323d44 76685f c2cdce eff1f0|dark",
  "porcelain|тёплый фарфор|e8dfca f6efdf e6b982 cab894 c6d6b4 526c37 282b26|light",
  "chalk|цветной мел|dce9ed eff6f6 9fcfd5 aab9df e6b8c3 356570 23353d|light",
].map((row) => {
  const [id, name, palette, mood] = row.split("|");
  const [bg, panel, a, b, c, accent, text] = palette.toLowerCase().split(" ");
  const rgb = (hex) => hex.match(/.{2}/g).map((channel) => parseInt(channel, 16)).join(", ");
  const hueOf = (hex) => {
    const [red, green, blue] = hex.match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max === min) return 22;
    const delta = max - min;
    let hue = max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
    return hue * 60;
  };
  const rotate = Math.round((hueOf(a) - 22 + 360) % 360);
  const core = themeCoreFilters[id];
  return Object.freeze({
    id,
    name,
    mood,
    group: {
      desert: "янтарные", saffron: "янтарные", terracotta: "земляные", apricot: "земляные",
      sunset: "розовые", hibiscus: "розовые", moss: "электрические", infrared: "электрические",
      pistachio: "зелёные", "mint-copper": "зелёные", glacier: "бирюзовые", petrol: "бирюзовые",
      "ceramic-blue": "синие", indigo: "синие", amethyst: "фиолетовые", wisteria: "фиолетовые",
      abyss: "мрачные", graphite: "мрачные", porcelain: "светлые", chalk: "светлые",
    }[id],
    tokens: Object.freeze({
      "--theme-bg": `#${bg}`,
      "--theme-panel-rgb": rgb(panel),
      "--theme-a-rgb": rgb(a),
      "--theme-b-rgb": rgb(b),
      "--theme-c-rgb": rgb(c),
      "--theme-accent-rgb": rgb(accent),
      "--theme-text-rgb": rgb(text),
      "--theme-canvas-filter": core?.canvas || `hue-rotate(${rotate}deg) saturate(1.22)`,
      "--theme-logo-filter": core?.logo || `hue-rotate(${rotate}deg) saturate(1.18)`,
      "--theme-fog-blur": core?.fog || "18px",
      "--theme-light-opacity": core?.opacity || ".8",
    }),
  });
}));
const themeNames = themeRegistry.map((theme) => theme.id);
const themesById = new Map(themeRegistry.map((theme) => [theme.id, theme]));

const populateThemeSelect = () => {
  if (!themeSelect) return;
  themeSelect.replaceChildren();
  const groups = Object.fromEntries(["мрачные", "светлые", "янтарные", "земляные", "розовые", "электрические", "зелёные", "бирюзовые", "синие", "фиолетовые"].map(label => {
    const group = document.createElement("optgroup"); group.label = label; return [label, group];
  }));
  for (const theme of themeRegistry) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    groups[theme.group].append(option);
  }
  themeSelect.append(...Object.values(groups));
};
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
let playlistPointerLockUntil = 0;
let playlistPointerCarry = 0;
let wheelBalancing = false;
let playLockAt = 0;
let trackPlayBlend = 0;
let playbackRequestId = 0;
let pendingPlaybackSeek = null;
let fullReadableMode = false;
let logoLocked = false;
let logoChaosActive = false;
let logoChargeTimeout;
let logoCycleTimeout;
let logoChaosCountdown = 0;
let pendingEmail = "";
let localLoginCode = "";
let passIsLocal = false;
let sessionEmail = "";
let chatTimer = 0;
let chatAnimationFrame = 0;
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
let themeRotationTimer = 0;
let themeShiftTimer = 0;
let slowFrameScore = 0;
let motionLastFrame = performance.now();
let trackItemNodes = [];
let trackTitleNodes = [];
let sceneRaf = 0;
let lastVisualTick = 0;
let logoCanvasBounds = { width: 0, height: 0 };
const lastMotionCss = { x: "", y: "", strength: "", tiltX: "", tiltY: "" };
const lastLogoVars = new Map();

const apiUrl = (path) => `${API_BASE}${path}`;

const refreshTrackNodes = () => {
  trackItemNodes = playlistList ? [...playlistList.querySelectorAll(".track-item")] : [];
  trackTitleNodes = trackItemNodes.map((item) => item.querySelector(".track-title")).filter(Boolean);
};

const renderInterval = () => animationQuality === "low" ? 52 : 34;

const rebuildQualityDependentState = () => {
  particleGrid = animationQuality === "low" ? { cols: 12, rows: 4 } : { cols: 18, rows: 6 };
  setupSmokeEmitters();
  setupPerceptionField();
  setupWindField();
  setupLogoFilaments();
  setupLogoSlices();
  setupLogoParticles();
  resizeInkField();
  resizeLogoCanvas();
  sizeCanvas(immersiveVisual);
};

const setAnimationQuality = (quality) => {
  if (animationQuality === quality) return;
  animationQuality = quality;
  document.documentElement.dataset.animationQuality = quality;
  rebuildQualityDependentState();
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
  const x = motionState.x.toFixed(3);
  const y = motionState.y.toFixed(3);
  const strength = motionState.strength.toFixed(3);
  const tiltX = `${(motionState.x * 1.8).toFixed(2)}deg`;
  const tiltY = `${(-motionState.y * 1.2).toFixed(2)}deg`;
  const root = document.documentElement.style;
  if (lastMotionCss.x !== x) { lastMotionCss.x = x; root.setProperty("--motion-x", x); }
  if (lastMotionCss.y !== y) { lastMotionCss.y = y; root.setProperty("--motion-y", y); }
  if (lastMotionCss.strength !== strength) { lastMotionCss.strength = strength; root.setProperty("--motion-strength", strength); }
  if (lastMotionCss.tiltX !== tiltX) { lastMotionCss.tiltX = tiltX; root.setProperty("--hero-tilt-x", tiltX); }
  if (lastMotionCss.tiltY !== tiltY) { lastMotionCss.tiltY = tiltY; root.setProperty("--hero-tilt-y", tiltY); }
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

if (!isMobileViewport) window.addEventListener("pointermove", setPointerMotion, { passive: true });
document.documentElement.addEventListener("pointerleave", () => {
  pointerState.active = false;
  setMotion(0, 0, 0);
}, { passive: true });

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

if (!isMobileViewport) window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
if (!isMobileViewport) window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
if (!isMobileViewport && typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
  window.addEventListener("pointerdown", () => DeviceMotionEvent.requestPermission().catch(() => {}), { once: true, passive: true });
}

const canvasScale = () => isListeningRoom ? (animationQuality === "low" ? .5 : .75) : Math.min(devicePixelRatio || 1, animationQuality === "low" ? 1 : 1.25);

const sizeCanvas = (canvas) => {
  if (!canvas) return;
  const scale = canvasScale();
  const nextWidth = Math.max(1, Math.round(innerWidth * scale));
  const nextHeight = Math.max(1, Math.round(innerHeight * scale));
  if (canvas.width === nextWidth && canvas.height === nextHeight) return;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
};

const fractalLayer = document.createElement("canvas");
const fractalContext = fractalLayer.getContext("2d", { alpha: true });
const smokeMaskLayer = document.createElement("canvas");
const smokeMaskContext = smokeMaskLayer.getContext("2d", { alpha: true });
const hashUnit = (value) => {
  let n = Math.imul((value * 4096) | 0 ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
let smokeEmitters = [];
let smokeClouds = [];
const setupSmokeEmitters = () => {
  if (isMobileViewport) return;
  const count = animationQuality === "low" ? 5 : 8;
  smokeEmitters = Array.from({ length: count }, (_, index) => ({
    x: .08 + hashUnit(index + 1.2) * .84,
    y: .12 + hashUnit(index + 4.7) * .72,
    radius: .13 + hashUnit(index + 8.1) * .17,
    phase: hashUnit(index + 12.4) * Math.PI * 2,
    speed: .055 + hashUnit(index + 16.8) * .11,
    orbitX: .025 + hashUnit(index + 20.1) * .095,
    orbitY: .025 + hashUnit(index + 24.9) * .08,
  }));
  smokeClouds = smokeEmitters.map((_, index) => ({ x: 0, y: 0, radius: 0, life: 0, phase: 0, index }));
};
setupSmokeEmitters();

const setupPerceptionField = () => {
  if (isMobileViewport) return;
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
  if (elapsed < renderInterval()) return;
  perceptionLastFrame = now;
  sceneClock.now = now;
  const energy = audioEnergy(now);
  const scale = canvasScale();
  perceptionContext.setTransform(scale, 0, 0, scale, 0, 0);
  perceptionContext.clearRect(0, 0, innerWidth, innerHeight);
  if (isListeningRoom) {
    perceptionContext.save();
    perceptionContext.translate(motionState.x * 20, motionState.y * 14);
    window.inteonRoom?.drawMist(perceptionContext, innerWidth, innerHeight, now, player.paused ? 0 : energy.avg);
    perceptionContext.restore();
  }
  if (!immersiveState.active && !isListeningRoom) {
    drawSmoke(perceptionContext, innerWidth, innerHeight, energy, now, .3);
  }
  drawWindField(perceptionContext, innerWidth, innerHeight, energy, now);
  perceptionContext.font = "11px ui-monospace, monospace";
  const live = immersiveState.active;
  for (let index = 0; index < perceptionField.length; index += 1) {
    const node = perceptionField[index];
    const breath = Math.max(0, Math.sin(now * .00018 + node.seed));
    const x = node.x * innerWidth + motionState.x * (8 + index * 1.3) + windState.x * (10 + index);
    const y = node.y * innerHeight + motionState.y * (6 + index) + windState.y * (8 + index * .6);
    perceptionContext.fillStyle = `rgba(214,165,104,${(live ? .03 : .018) + breath * (live ? .09 : .055)})`;
    perceptionContext.fillText(node.glyph, x, y);
  }
};

setupPerceptionField();
window.addEventListener("resize", setupPerceptionField, { passive: true });

const windState = { x: .55, y: -.14, gust: .4, angle: -.22 };
const windMotes = [];
const windDigits = [];
let windDigitAt = 0;
let windLastTick = 0;

const spawnWindMote = (anywhere = false) => {
  const fromLeft = windState.x >= 0;
  const fromTop = windState.y >= 0;
  let x;
  let y;
  if (anywhere) {
    x = Math.random() * innerWidth;
    y = Math.random() * innerHeight;
  } else if (Math.abs(windState.x) > Math.abs(windState.y)) {
    x = fromLeft ? -16 - Math.random() * 40 : innerWidth + 16 + Math.random() * 40;
    y = Math.random() * innerHeight;
  } else {
    x = Math.random() * innerWidth;
    y = fromTop ? -16 - Math.random() * 40 : innerHeight + 16 + Math.random() * 40;
  }
  return {
    x,
    y,
    z: .4 + Math.random() * .9,
    size: .5 + Math.random() * 1.9,
    wobble: Math.random() * Math.PI * 2,
    ember: Math.random() > .82,
  };
};

const spawnWindDigit = () => {
  const fromLeft = windState.x >= 0;
  return {
    x: fromLeft ? -28 : innerWidth + 28,
    y: innerHeight * (.1 + Math.random() * .78),
    z: .55 + Math.random() * .7,
    size: 10 + Math.random() * 20,
    rot: (Math.random() - .5) * .8,
    spin: (Math.random() - .5) * .035,
    glyph: perceptionChars[Math.floor(Math.random() * perceptionChars.length)],
    age: 0,
    ttl: 3.8 + Math.random() * 3.2,
  };
};

const setupWindField = () => {
  if (isMobileViewport) return;
  windMotes.length = 0;
  windDigits.length = 0;
  const count = prefersReducedMotion ? 10 : animationQuality === "low" ? 32 : 64;
  for (let index = 0; index < count; index += 1) windMotes.push(spawnWindMote(true));
};

const updateWind = (now, energy, delta) => {
  const time = now * .00012;
  const sway = Math.sin(time * 1.7) * .18 + Math.sin(time * .43) * .12;
  windState.angle += (sway + motionState.x * .04) * .018 * delta;
  const targetGust = .28 + energy.avg * .85 + energy.bass * .45 + motionState.strength * .35;
  windState.gust += (targetGust - windState.gust) * .045 * delta;
  windState.x = Math.cos(windState.angle) * (1.15 + windState.gust);
  windState.y = Math.sin(windState.angle) * (.32 + windState.gust * .28) - .12;
};

const recycleWindMote = (mote) => {
  const next = spawnWindMote(false);
  mote.x = next.x;
  mote.y = next.y;
  mote.z = next.z;
  mote.size = next.size;
  mote.wobble = next.wobble;
  mote.ember = next.ember;
};

const drawWindField = (ctx, width, height, energy, now) => {
  if (!ctx || prefersReducedMotion && !windMotes.length) return;
  const delta = Math.min(2.2, Math.max(.25, (now - (windLastTick || now)) / 16.67));
  windLastTick = now;
  updateWind(now, energy, delta);
  if (!windMotes.length) setupWindField();

  const live = .7 + energy.avg * .9;
  for (let index = 0; index < windMotes.length; index += 1) {
    const mote = windMotes[index];
    const speed = (1.1 + mote.z * 1.8) * live;
    mote.wobble += .04 * delta;
    mote.x += (windState.x * 1.8 + Math.sin(mote.wobble) * .35) * speed * delta;
    mote.y += (windState.y * 1.4 + Math.cos(mote.wobble * .7) * .22) * speed * delta;
    if (mote.x < -48 || mote.x > width + 48 || mote.y < -48 || mote.y > height + 48) recycleWindMote(mote);
    const alpha = (.045 + mote.z * .07) * (immersiveState.active ? 1.15 : 1);
    ctx.fillStyle = mote.ember
      ? `rgba(232,156,92,${alpha * 1.6})`
      : `rgba(236,214,176,${alpha})`;
    ctx.fillRect(mote.x, mote.y, mote.size * mote.z, mote.size * .45);
  }

  const digitGap = prefersReducedMotion ? 6400 : animationQuality === "low" ? 2200 : 1400;
  const wantDigit = now - windDigitAt > digitGap
    && windDigits.length < (animationQuality === "low" ? 3 : 6)
    && (energy.flux > .12 || hashUnit(now * .0013) > .72);
  if (wantDigit) {
    windDigits.push(spawnWindDigit());
    windDigitAt = now;
  }

  ctx.save();
  ctx.font = "500 14px ui-monospace, SFMono-Regular, Consolas, monospace";
  for (let index = windDigits.length - 1; index >= 0; index -= 1) {
    const digit = windDigits[index];
    const speed = (1.2 + digit.z * 1.6) * live;
    digit.age += delta * .016;
    digit.x += windState.x * 2.4 * speed * delta;
    digit.y += (windState.y * 1.6 + Math.sin(digit.age * 2.2) * .18) * speed * delta;
    digit.rot += digit.spin * delta;
    const fade = Math.min(1, digit.age * 1.8, (digit.ttl - digit.age) * 1.1);
    if (digit.age > digit.ttl || digit.x < -80 || digit.x > width + 80 || digit.y < -80 || digit.y > height + 80) {
      windDigits.splice(index, 1);
      continue;
    }
    ctx.save();
    ctx.translate(digit.x, digit.y);
    ctx.rotate(digit.rot);
    ctx.globalAlpha = Math.max(0, fade) * (.22 + energy.high * .28);
    ctx.fillStyle = digit.glyph === "0" || digit.glyph === "1"
      ? "rgba(211,255,105,.95)"
      : "rgba(244,214,168,.95)";
    ctx.font = `${Math.round(digit.size)}px ui-monospace, monospace`;
    ctx.fillText(digit.glyph, 0, 0);
    ctx.restore();
  }
  ctx.restore();
};
setupWindField();
window.addEventListener("resize", setupWindField, { passive: true });

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
  if (node?.analyser && node.data && player && !player.paused) {
    node.analyser.getByteFrequencyData(node.data);
    bass = averageBand(node.data, 0, .14);
    mid = averageBand(node.data, .14, .52);
    high = averageBand(node.data, .52, 1);
    avg = averageBand(node.data, 0, 1);
  }
  const flux = Math.min(1, Math.abs(avg - spectrumState.previous) * 8.5);
  spectrumState.previous = avg;
  spectrumState.bass += (bass - spectrumState.bass) * .24;
  spectrumState.mid += (mid - spectrumState.mid) * .2;
  spectrumState.high += (high - spectrumState.high) * .18;
  spectrumState.avg += (avg - spectrumState.avg) * .2;
  spectrumState.flux += (flux - spectrumState.flux) * .3;
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
  for (let index = 0; index < smokeEmitters.length; index += 1) {
    const emitter = smokeEmitters[index];
    const cloud = smokeClouds[index];
    const lifeWave = (Math.sin(time * emitter.speed * Math.PI * 2 + emitter.phase) + 1) * .5;
    cloud.x = (emitter.x + Math.sin(time * emitter.speed + emitter.phase) * emitter.orbitX) * width + pointerX * (9 + index * 1.8);
    cloud.y = (emitter.y + Math.cos(time * emitter.speed * .77 + emitter.phase) * emitter.orbitY) * height + pointerY * (7 + index * 1.4);
    cloud.life = .12 + Math.pow(lifeWave, 1.7) * .88;
    cloud.radius = size * emitter.radius * (.62 + cloud.life * .52 + energy.bass * .3);
    cloud.phase = emitter.phase;
    cloud.index = index;
  }
  return smokeClouds;
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
  ctx.shadowBlur = animationQuality === "low" ? 0 : 2 + energy.bass * 6;
  ctx.shadowColor = `rgba(190,73,40,${.22 + energy.bass * .28})`;
  const depth = animationQuality === "low" ? 1 : 2;
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
    const lobes = animationQuality === "low" ? 2 : 3;
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
  const layerScale = animationQuality === "low" ? .32 : .46;
  const layerW = Math.max(1, Math.round(width * layerScale));
  const layerH = Math.max(1, Math.round(height * layerScale));
  ensureEffectLayers(layerW, layerH);
  const clouds = smokeCloudsAt(layerW, layerH, energy, now);
  paintFractalLattice(fractalContext, layerW, layerH, energy, now);
  paintSmokeMask(smokeMaskContext, layerW, layerH, clouds, energy, now);
  fractalContext.save();
  fractalContext.globalCompositeOperation = "destination-in";
  fractalContext.drawImage(smokeMaskLayer, 0, 0);
  fractalContext.restore();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = intensity * (.48 + energy.avg * .65);
  ctx.drawImage(fractalLayer, -motionState.x * 1.6, -motionState.y * 1.2, width, height);
  ctx.globalAlpha = intensity * (.12 + energy.high * .25);
  ctx.drawImage(fractalLayer, motionState.x * 4 + 2, motionState.y * 3 - 1, width, height);
  ctx.restore();
};

const drawGrid = drawSmokeRevealedFractal;

const drawSmoke = (ctx, width, height, energy, now, intensity = 1) => {
  const clouds = smokeCloudsAt(width, height, energy, now);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  clouds.forEach((cloud) => {
    const lobes = 2;
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const angle = cloud.phase + lobe * 2.15 + now * .00011;
      const x = cloud.x + Math.cos(angle) * cloud.radius * .08;
      const y = cloud.y + Math.sin(angle * .83) * cloud.radius * .06;
      const radius = cloud.radius * (.2 + hashUnit(cloud.index * 7 + lobe) * .12);
      const alpha = intensity * cloud.life * (.018 + energy.avg * .03);
      const gradient = ctx.createRadialGradient(x, y, radius * .08, x, y, radius);
      gradient.addColorStop(0, `rgba(236,214,176,${alpha})`);
      gradient.addColorStop(.45, `rgba(168,112,74,${alpha * .45})`);
      gradient.addColorStop(1, "rgba(20,16,12,0)");
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
    ctx.shadowBlur = animationQuality === "low" ? 0 : 6 + energy.bass * 12;
    ctx.shadowColor = "rgba(224,108,61,.85)";
    ctx.stroke();
  }
  ctx.restore();
};

const immersiveContext = immersiveVisual?.getContext("2d");

const drawImmersiveScene = (now) => {
  if (!immersiveState.active || !immersiveVisual || !immersiveContext) return;
  const elapsed = now - immersiveState.lastDraw;
  if (elapsed < renderInterval()) return;
  immersiveState.lastDraw = now;
  const energy = audioEnergy(now);
  sceneClock.now = now;
  sceneClock.energy = energy.avg;
  sceneClock.bass = energy.bass;
  const scale = canvasScale();
  immersiveContext.setTransform(scale, 0, 0, scale, 0, 0);
  immersiveContext.clearRect(0, 0, innerWidth, innerHeight);
  drawSmoke(immersiveContext, innerWidth, innerHeight, energy, now, 1.28);
  drawSmokeRevealedFractal(immersiveContext, innerWidth, innerHeight, energy, now, 1.22);
  drawElectricity(immersiveContext, innerWidth, innerHeight, energy, now);
};

const drawLiquid = drawImmersiveScene;

const resizeInkField = () => {
  if (isMobileViewport) return;
  if (!inkField || !inkContext) return;
  inkFieldBounds = inkField.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, animationQuality === "low" ? 1 : 1.25);
  const nextWidth = Math.max(1, Math.round(inkFieldBounds.width * scale));
  const nextHeight = Math.max(1, Math.round(inkFieldBounds.height * scale));
  if (inkField.width !== nextWidth || inkField.height !== nextHeight) {
    inkField.width = nextWidth;
    inkField.height = nextHeight;
  }
  inkParticles = [];
};

const emitTitleInk = (now, energy) => {
  if (!inkField || !inkFieldBounds) return;
  const titles = trackTitleNodes.length ? trackTitleNodes : document.querySelectorAll(".track-title");
  const limit = animationQuality === "low" ? 60 : 110;
  for (let titleIndex = 0; titleIndex < titles.length; titleIndex += 1) {
    const title = titles[titleIndex];
    const item = title.closest(".track-item");
    if (!item || item.classList.contains("is-departing")) continue;
    const rect = title.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 2) continue;
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
      });
    }
  }
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

  particle.vx += windState.x * .11 * delta;
  particle.vy += windState.y * .08 * delta;
  particle.vx *= 1 - .014 * delta;
  particle.vy *= 1 - .012 * delta;
  particle.x += particle.vx * delta;
  particle.y += particle.vy * delta;
  particle.age += particle.decay * delta;
  if (particle.size < 8) particle.size += .012 * delta;
};

const inkSprite = document.createElement("canvas");
inkSprite.width = 48;
inkSprite.height = 48;
{
  const spriteContext = inkSprite.getContext("2d");
  const gradient = spriteContext.createRadialGradient(24, 24, 0, 24, 24, 24);
  gradient.addColorStop(0, "rgba(42,22,16,.85)");
  gradient.addColorStop(.42, "rgba(92,48,32,.38)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  spriteContext.fillStyle = gradient;
  spriteContext.fillRect(0, 0, 48, 48);
}

const drawInkParticle = (ctx, particle) => {
  const alpha = Math.max(0, 1 - particle.age);
  if (alpha <= 0) return;
  const length = particle.size * (1.05 + particle.age * .85);
  const breadth = particle.size * (.62 + particle.age * .15);
  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(Math.atan2(particle.vy, particle.vx || .001));
  ctx.globalAlpha = alpha * .62;
  ctx.drawImage(inkSprite, -length, -breadth * .5, length * 2, breadth);
  ctx.restore();
};

const renderInkField = (now) => {
  if (!inkField || !inkContext) return;
  if (!inkFieldBounds?.width) resizeInkField();
  if (now - inkLastFrame < renderInterval()) return;
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
  for (let index = 0; index < inkParticles.length; index += 1) {
    const particle = inkParticles[index];
    updateInkParticle(particle, now, delta);
    drawInkParticle(inkContext, particle);
  }
  let write = 0;
  const maxX = inkFieldBounds.width + 120;
  const maxY = inkFieldBounds.height + 120;
  for (let index = 0; index < inkParticles.length; index += 1) {
    const particle = inkParticles[index];
    if (particle.age < 1 && particle.x > -120 && particle.x < maxX && particle.y > -120 && particle.y < maxY) {
      inkParticles[write] = particle;
      write += 1;
    }
  }
  inkParticles.length = write;
};

const mutateGlyphString = (text, intensity, frame, seed = 0) => {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === " ") {
      result += character;
      continue;
    }
    const gate = hashUnit(frame * .83 + index * 7.19 + seed * 13.7);
    result += gate > intensity
      ? character
      : titleGlyphs[Math.floor(hashUnit(frame * 2.17 + index * 11.3 + seed) * titleGlyphs.length)];
  }
  return result;
};

let playingLetterMode = "rest";
let playingLetterUntil = 0;
let playingLetterNext = 0;
let playingLetterTitle = "";

const playingLetters = () => (nowPlayingTitle ? [...nowPlayingTitle.querySelectorAll(".play-letter")] : []);

const paintPlayingTitle = (title) => {
  if (!nowPlayingTitle) return [];
  const existing = playingLetters();
  if (playingLetterTitle === title && existing.length) return existing;
  playingLetterTitle = title;
  playingLetterMode = "rest";
  playingLetterUntil = 0;
  playingLetterNext = 0;
  nowPlayingTitle.replaceChildren(...[...title].map((char) => {
    const letter = document.createElement("span");
    letter.className = "play-letter";
    letter.dataset.char = char;
    letter.textContent = char === " " ? "\u00a0" : char;
    return letter;
  }));
  return playingLetters();
};

const restorePlayingLetters = (letters) => {
  letters.forEach((letter) => {
    const char = letter.dataset.char || "";
    letter.textContent = char === " " ? "\u00a0" : char;
    letter.style.transform = "";
  });
};

const renderPlayingLetters = (now) => {
  if (playlistList?.dataset?.layout === "catalog") return;
  if (!nowPlayingTitle) return;
  const playing = Boolean(currentTrack && player && !player.paused);
  if (!playing || prefersReducedMotion) {
    if (playingLetterTitle) {
      nowPlayingTitle.textContent = currentTrack?.title || playingLetterTitle;
      playingLetterTitle = "";
      playingLetterMode = "rest";
    }
    return;
  }
  const letters = paintPlayingTitle(currentTrack.title || "");
  if (!letters.length) return;
  if (playingLetterMode === "rest") {
    if (!playingLetterNext) playingLetterNext = now + 3200 + Math.random() * 4800;
    if (now < playingLetterNext) return;
    playingLetterMode = Math.random() < 0.5 ? "stair" : "glyphs";
    playingLetterUntil = now + (playingLetterMode === "stair" ? 1680 : 1280);
    return;
  }
  if (now >= playingLetterUntil) {
    restorePlayingLetters(letters);
    playingLetterMode = "rest";
    playingLetterNext = now + (isMobileViewport ? 2400 : 8000) + Math.random() * (isMobileViewport ? 2200 : 7000);
    return;
  }
  const duration = playingLetterMode === "stair" ? 1680 : 1280;
  const progress = 1 - Math.max(0, (playingLetterUntil - now) / duration);
  if (playingLetterMode === "stair") {
    const shift = Math.floor(progress * 5);
    const scales = [0.78, 0.92, 1.08, 1.26];
    letters.forEach((letter, index) => {
      if (letter.dataset.char === " ") {
        letter.style.transform = "";
        return;
      }
      letter.textContent = letter.dataset.char;
      letter.style.transform = `scale(${scales[(index + shift) % scales.length]})`;
    });
    return;
  }
  const head = Math.floor(progress * (letters.length + 2));
  letters.forEach((letter, index) => {
    letter.style.transform = "";
    const char = letter.dataset.char || "";
    if (char === " ") {
      letter.textContent = "\u00a0";
      return;
    }
    const passing = head - index;
    letter.textContent = passing >= 0 && passing < 3
      ? titleGlyphs[Math.floor(hashUnit(Math.floor(now / 70) + index * 9.1) * titleGlyphs.length)]
      : char;
  });
};

const renderTitleMutation = (now) => {
  if (playlistList?.dataset?.layout === "catalog") return;
  if (prefersReducedMotion) return;
  if (now - titleLastFrame < (animationQuality === "low" ? 120 : 68)) return;
  titleLastFrame = now;
  const frame = Math.floor(now / (prefersReducedMotion ? 210 : 76));
  const titles = trackTitleNodes.length ? trackTitleNodes : document.querySelectorAll(".track-title");
  const mutateTitle = (element, index) => {
    const original = element.dataset.originalText || element.textContent || "";
    if (!element.dataset.originalText) element.dataset.originalText = original;
    const hovering = Boolean(element.closest(".track-item")?.matches(":hover, :focus-within"));
    const phase = (now * .001 + index * 1.31) % (isMobileViewport ? 4.2 : 7.4);
    const wave = phase < .88 ? Math.sin((phase / .88) * Math.PI) : 0;
    const intensity = Math.min(.34, wave * .24 + (hovering ? .1 : 0));
    element.classList.toggle("is-scrambling", intensity > .05);
    const nextText = intensity > .05
      ? mutateGlyphString(original, intensity, frame, index + 1)
      : original;
    if (element.textContent !== nextText) element.textContent = nextText;
  };
  for (let index = 0; index < titles.length; index += 1) mutateTitle(titles[index], index);
  if (immersiveTitle) mutateTitle(immersiveTitle, titles.length);
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
  if (playlistList?.dataset?.layout === "catalog") return;
  if (!playlistList) return;
  const items = trackItemNodes.length ? trackItemNodes : [...playlistList.querySelectorAll(".track-item")];
  const overflowing = items.length > TRACK_VIEW;
  const bounds = playlistList.getBoundingClientRect();
  const mid = bounds.top + bounds.height / 2;
  const half = Math.max(1, bounds.height / 2);
  const live = Boolean((currentTrack || immersiveState.active) && player && !player.paused);
  const energy = live ? audioEnergy() : spectrumState;
  trackPlayBlend += ((live ? 1 : 0) - trackPlayBlend) * 0.055;
  if (Math.abs(trackPlayBlend - (live ? 1 : 0)) < 0.008) trackPlayBlend = live ? 1 : 0;
  const pulse = energy.bass * 10 + energy.flux * 6;
  const spread = 1.12 + trackPlayBlend * 0.42;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const card = item.querySelector(".track-fold") || item.querySelector(".track-meta") || item;
    item.style.transform = "";
    const button = item.querySelector(".track-select");
    if (button) button.style.transform = "";
    if (item.classList.contains("is-kept")) {
      const lift = 10 + trackPlayBlend * (6 + energy.bass * 8);
      card.style.transform = `translate3d(0, 0, ${lift}px) scale(${1 + trackPlayBlend * energy.avg * .02})`;
      item.style.opacity = "1";
      item.style.filter = "none";
      continue;
    }
    const rect = item.getBoundingClientRect();
    if (rect.bottom < bounds.top - 80 || rect.top > bounds.bottom + 80) {
      card.style.transform = "translate3d(0, 0, -180px) rotateX(0deg) scale(.62)";
      item.style.opacity = "0.28";
      item.style.filter = "blur(8px)";
      continue;
    }
    const hovered = item.matches(":hover, :focus-within");
    const offset = ((rect.top + rect.height / 2 - mid) / half) * spread;
    const fold = Math.min(1, Math.abs(offset));
    const depth = fold * (128 + trackPlayBlend * 36) + pulse * fold * trackPlayBlend;
    const rotateX = Math.max(-28, Math.min(28, offset * (20 + trackPlayBlend * 6)));
    const scale = Math.max(0.76, 1 - fold * (0.13 + trackPlayBlend * 0.05) + trackPlayBlend * energy.high * .02 * (1 - fold));
    // Keep the wheel's depth, not optical blur on readable track labels.
    const blur = 0;
    card.style.transform = `translate3d(0, ${offset * -5}px, ${-depth}px) rotateX(${rotateX}deg) scale(${scale})`;
    item.style.opacity = hovered ? "1" : String(Math.max(0.56, 1 - fold * 0.22));
    item.style.filter = `blur(${blur.toFixed(2)}px)`;
  }
};

const updateScrollbar = () => {
  if (!playlistList || !scrollbar || !scrollbarThumb) return;
  const overflow = (trackItemNodes.length || playlistList.querySelectorAll(".track-item").length) > TRACK_VIEW;
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

const pointerPlaylistNudge = () => {
  // Hover is for choosing a track. Only wheel, touch or drag may scroll.
  return 0;
};

const loopPlaylistMotion = (now) => {
  if (playlistList?.dataset?.layout === "catalog") return;
  if (now - playlistLastFrame < (animationQuality === "low" ? 90 : 50)) return;
  playlistLastFrame = now;
  if (pointerPlaylistNudge() && !playlistScrollRaf && playlistList) {
    playlistScrollTarget = playlistList.scrollTop;
    playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
  }
  updateTrackFold();
  updateScrollbar();
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
  try {
    return new URL(source, document.baseURI).href;
  } catch {
    return encodeURI(source);
  }
};

const findTrackForItem = (item) => {
  if (!item) return null;
  const index = Number(item.dataset.trackIndex);
  if (Number.isInteger(index) && tracks[index]) return tracks[index];
  const title = item.dataset.trackTitle
    || item.querySelector(".track-title")?.dataset.originalText
    || item.querySelector(".track-title")?.textContent?.trim()
    || "";
  const bundled = Array.isArray(window.INTEONMTECA_PLAYLIST) ? window.INTEONMTECA_PLAYLIST : [];
  const matchTitle = (candidate) => candidate?.title === title
    || (title && typeof candidate?.title === "string" && candidate.title.includes(title));
  return tracks.find(matchTitle) || bundled.find(matchTitle) || null;
};

const trackRowHeight = () => {
  const measured = playlistList?.querySelector(".track-item")?.offsetHeight || 0;
  if (measured > 1) return measured;
  return 72;
};

const bindTrackItem = (item, track) => {
  const button = item.querySelector(".track-select");
  if (!button || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  const play = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const resolved = track || findTrackForItem(item);
    if (resolved) playTrack(resolved, item);
  };
  button.addEventListener("click", play);
};

const wrapTrackNumber = number => ((number + 999) % 1999 + 1999) % 1999 - 999;
const createTrackItem = (track, index, wheelNumber = index) => {
  const item = document.createElement("li");
  item.className = "track-item";
  item.dataset.trackTitle = track.title;
  item.dataset.trackIndex = String(index);
  item.dataset.wheelNumber = String(wheelNumber);
  item.dataset.number = String(wrapTrackNumber(wheelNumber));
  const playing = currentTrack && (track === currentTrack || (track.audio || track.file) === (currentTrack.audio || currentTrack.file));
  if (playing) item.classList.add("is-playing");
  const button = document.createElement("button");
  button.className = "track-select";
  button.type = "button";
  button.setAttribute("aria-label", `Воспроизвести ${track.title}`);
  button.setAttribute("aria-pressed", String(Boolean(playing)));
  button.title = `${track.title} — ${track.artist || "inteonmteca"}`;
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
  const fold = document.createElement("span");
  fold.className = "track-fold";
  const artwork = document.createElement("span");
  artwork.className = "track-art";
  artwork.setAttribute("aria-hidden", "true");
  artwork.textContent = item.dataset.number;
  fold.append(artwork, meta);
  button.append(fold);
  item.append(button);
  bindTrackItem(item, track);
  return item;
};

const visibleTrackIndexes = () => tracks.map((_, index) => index);
const visibleTrackCount = () => Math.max(1, visibleTrackIndexes().length);
// The initial catalogue is shuffled once. Its cycles retain that order, including
// the selected row, so selection never changes neighbours or scroll position.
const shuffledTrackIndexes = () => visibleTrackIndexes();

const appendWheelCycle = () => {
  if (!playlistList || !tracks.length) return 0;
  const before = playlistList.scrollHeight;
  const start = playlistList.lastElementChild ? Number(playlistList.lastElementChild.dataset.wheelNumber) + 1 : -visibleTrackCount();
  shuffledTrackIndexes().forEach((index, offset) => playlistList.append(createTrackItem(tracks[index], index, start + offset)));
  return playlistList.scrollHeight - before;
};

const prependWheelCycle = () => {
  if (!playlistList || !tracks.length) return 0;
  const before = playlistList.scrollHeight;
  const fragment = document.createDocumentFragment();
  const start = Number(playlistList.firstElementChild?.dataset.wheelNumber || 0) - visibleTrackCount();
  shuffledTrackIndexes().forEach((index, offset) => fragment.append(createTrackItem(tracks[index], index, start + offset)));
  playlistList.prepend(fragment);
  const added = playlistList.scrollHeight - before;
  playlistList.scrollTop += added;
  playlistScrollTarget += added;
  return added;
};

const trimInfiniteWheel = () => {
  if (!playlistList || !tracks.length) return;
  const cycle = visibleTrackCount();
  const limit = cycle * 8;
  if (playlistList.children.length <= limit) return;
  const cycleH = cycle * trackRowHeight();
  if (playlistList.scrollTop > cycleH * 2.4) {
    for (let index = 0; index < cycle; index += 1) playlistList.firstElementChild?.remove();
    playlistList.scrollTop = Math.max(0, playlistList.scrollTop - cycleH);
    playlistScrollTarget = Math.max(0, playlistScrollTarget - cycleH);
  } else if (playlistList.scrollHeight - playlistList.scrollTop - playlistList.clientHeight > cycleH * 2.4) {
    for (let index = 0; index < cycle; index += 1) playlistList.lastElementChild?.remove();
  }
};

const balanceInfiniteWheel = () => {
  if (wheelBalancing || !playlistList || !tracks.length) return;
  wheelBalancing = true;
  const cycleH = Math.max(trackRowHeight(), visibleTrackCount() * trackRowHeight());
  let guard = 0;
  while (guard < 6 && playlistScrollTarget < cycleH * 0.8) {
    prependWheelCycle();
    guard += 1;
  }
  guard = 0;
  while (guard < 6 && playlistScrollTarget + playlistList.clientHeight > playlistList.scrollHeight - cycleH * 0.8) {
    appendWheelCycle();
    guard += 1;
  }
  trimInfiniteWheel();
  refreshTrackNodes();
  wheelBalancing = false;
};

const fillInfiniteWheel = () => {
  if (!playlistList || !tracks.length) return;
  wheelBalancing = true;
  try {
    playlistList.replaceChildren();
    appendWheelCycle();
    appendWheelCycle();
    appendWheelCycle();
    let extra = 0;
    while (
      extra < 8
      && playlistList.scrollHeight > 0
      && playlistList.clientHeight > 0
      && (playlistList.children.length <= TRACK_VIEW
        || playlistList.scrollHeight <= playlistList.clientHeight + trackRowHeight())
    ) {
      appendWheelCycle();
      extra += 1;
    }
    refreshTrackNodes();
    const cycleH = visibleTrackCount() * trackRowHeight();
    playlistList.scrollTop = cycleH;
    playlistScrollTarget = playlistList.scrollTop;
    playlistScrollVelocity = 0;
  } catch {
    playlistList.replaceChildren(...tracks.map((track, index) => createTrackItem(track, index)));
    refreshTrackNodes();
  }
  wheelBalancing = false;
};

const nearestItemForTrackIndex = (index) => {
  const items = [...(playlistList?.querySelectorAll(`[data-track-index="${index}"]`) || [])];
  if (!items.length) return null;
  const bounds = playlistList.getBoundingClientRect();
  const mid = bounds.top + bounds.height / 2;
  return items.reduce((best, item) => {
    const y = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
    const dist = Math.abs(y - mid);
    if (!best || dist < best.dist) return { item, dist };
    return best;
  }, null)?.item || items[0];
};

const centerWheelItem = (item) => {
  if (!item || !playlistList) return;
  const top = item.offsetTop - (playlistList.clientHeight - item.offsetHeight) / 2;
  playlistList.scrollTop = top;
  playlistScrollTarget = top;
  playlistScrollVelocity = 0;
  balanceInfiniteWheel();
};

let trackFlight = null;
const launchTrackFlight = (sourceRect, sourceFontSize, track) => {
  trackFlight?.remove();
  trackFlight = null;
  if (playlistList?.dataset?.layout === "catalog" || !sourceRect || prefersReducedMotion || !activePlayer) return;
  activePlayer.classList.add("is-arrival-target");
  const targetCopy = activePlayer.querySelector(".active-track-copy");
  const targetTitle = activePlayer.querySelector(".now-playing-title");
  const target = targetCopy?.getBoundingClientRect();
  const targetFontSize = targetTitle ? Number.parseFloat(getComputedStyle(targetTitle).fontSize) || sourceFontSize : sourceFontSize;
  activePlayer.classList.remove("is-arrival-target");
  if (!target?.width) return;
  const flight = document.createElement("div");
  flight.className = "track-flight";
  const title = document.createElement("span");
  title.className = "track-flight-title";
  title.textContent = track.title || "track";
  const artist = document.createElement("span");
  artist.className = "track-flight-artist";
  artist.textContent = track.artist || "inteonmteca";
  flight.append(title, artist);
  flight.style.left = sourceRect.left + "px";
  flight.style.top = sourceRect.top + "px";
  flight.style.width = sourceRect.width + "px";
  flight.style.setProperty("--flight-x", (target.left + target.width / 2 - sourceRect.left - sourceRect.width / 2) + "px");
  flight.style.setProperty("--flight-y", (target.top - sourceRect.top) + "px");
  flight.style.setProperty("--flight-scale", String(Math.max(1, Math.min(2.6, targetFontSize / Math.max(1, sourceFontSize)))));
  document.body.append(flight);
  trackFlight = flight;
  requestAnimationFrame(() => requestAnimationFrame(() => flight.classList.add("is-flying")));
  window.setTimeout(() => {
    if (trackFlight === flight) trackFlight = null;
    flight.remove();
  }, 680);
};

const playTrack = (track, sourceItem = null, options = {}) => {
  if (!track) return;
  const now = performance.now();
  if (now - playLockAt < 220 && currentTrack === track) return;
  playLockAt = now;
  cancelAnimationFrame(playlistScrollRaf);
  playlistScrollRaf = 0;
  playlistScrollVelocity = 0;
  playlistScrollTarget = playlistList?.scrollTop || 0;
  const requestId = ++playbackRequestId;
  if (pendingPlaybackSeek) player?.removeEventListener("loadedmetadata", pendingPlaybackSeek.place);
  pendingPlaybackSeek = null;
  currentTrack = track;
  if (player && options.shared) window.inteonPlayback?.restore?.(player, options.shared);
  else if (player) window.inteonPlayback?.select?.(player, options.origin || "home");
  playbackStamp = "";
  setPlaybackStatus("", "");
  currentTrackIndex = tracks.findIndex((candidate) => (
    candidate === track
    || (track.audio && candidate.audio === track.audio)
    || (track.file && candidate.file === track.file)
  ));
  if (currentTrackIndex < 0 && Array.isArray(window.INTEONMTECA_PLAYLIST)) {
    tracks = tracks.length ? tracks : shuffle(window.INTEONMTECA_PLAYLIST.filter((item) => item?.audio));
    currentTrackIndex = tracks.findIndex((candidate) => (
      candidate.audio === track.audio || candidate.title === track.title
    ));
  }
  if (!sourceItem && currentTrackIndex >= 0) {
    sourceItem = nearestItemForTrackIndex(currentTrackIndex);
  }
  const sourceMeta = sourceItem?.querySelector(".track-meta");
  const sourceTitle = sourceItem?.querySelector(".track-title");
  const sourceRect = sourceMeta?.getBoundingClientRect() || null;
  const sourceFontSize = sourceTitle ? Number.parseFloat(getComputedStyle(sourceTitle).fontSize) || 24 : 24;
  if (nowPlayingTitle) {
    nowPlayingTitle.textContent = track.title || "track";
    nowPlayingTitle.dataset.track = track.title || "track";
  }
  if (activeTrackArtist) activeTrackArtist.textContent = track.artist || "inteonmteca";
  document.body.classList.add("is-track-diving", "is-player-arranging");
  launchTrackFlight(sourceRect, sourceFontSize, track);
  const src = resolveTrackUrl(track);
  const assigned = player ? (player.getAttribute("src") || player.src || "") : "";
  if (options.shared && player) {
    player.preload = "metadata";
    pendingPlaybackSeek = { requestId };
  }
  if (player && src && assigned !== src && player.src !== src) player.src = src;
  if (player && options.shared) {
    const place = () => {
      if (requestId !== playbackRequestId) return;
      const time = Number(options.shared.time);
      if (Number.isFinite(time) && time > 0) player.currentTime = Number.isFinite(player.duration) ? Math.min(time, player.duration) : time;
      pendingPlaybackSeek = null;
    };
    pendingPlaybackSeek = { requestId, place };
    if (player.readyState >= 1) place();
    else player.addEventListener("loadedmetadata", place, { once: true });
  }
  if (player && src && options.shared?.paused) {
    syncTransport();
  } else if (player && src && !options.audioStarted) {
    const attempt = player.play();
    if (attempt && typeof attempt.then === "function") {
      attempt.then(() => {
        if (requestId !== playbackRequestId) return;
        setPlaybackStatus();
        attachPlaybackAnalysis();
        syncTransport();
      }).catch((error) => {
        if (requestId !== playbackRequestId) return;
        if (error?.name === "AbortError") {
          syncTransport();
          return;
        }
        const message = error?.name === "NotAllowedError"
          ? "Нажмите «Воспроизвести»"
          : error?.name === "NotSupportedError"
            ? "этот файл браузер не играет"
            : "Не удалось воспроизвести. Повторите попытку";
        setPlaybackStatus(message, "error");
        syncTransport();
      });
    } else {
      attachPlaybackAnalysis();
      syncTransport();
    }
  } else if (player && src && options.audioStarted) {
    attachPlaybackAnalysis();
    syncTransport();
  } else if (!src) {
    setPlaybackStatus("нет аудиофайла", "error");
  }
  [...(playlistList?.querySelectorAll(".track-item") || [])].forEach((item) => {
    const same = Number(item.dataset.trackIndex) === currentTrackIndex;
    item.classList.toggle("is-kept", Boolean(sourceItem) && item === sourceItem);
    item.classList.toggle("is-playing", same);
    item.querySelector(".track-select")?.setAttribute("aria-pressed", String(same));
    item.classList.remove("is-departing");
    if (sourceItem && item === sourceItem) {
      item.style.opacity = "1";
      item.style.filter = "none";
      item.classList.add("is-departing");
    }
  });
  updateTrackFold();
  enterImmersiveMode(player, track);
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
    refreshTrackNodes();
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
  cancelAnimationFrame(playlistScrollRaf);
  playlistScrollRaf = 0;
  fillInfiniteWheel();
  if (currentTrackIndex >= 0) {
    const kept = nearestItemForTrackIndex(currentTrackIndex);
    if (kept) {
      kept.classList.add("is-kept", "is-playing");
      centerWheelItem(kept);
    }
  }
  updateTrackFold();
  updateScrollbar();
  refreshTrackNodes();
  return true;
};

const bindFallbackTracks = () => {
  if (tracks.length || !playlistList) return;
  const randomizedItems = shuffle([...(playlistList.querySelectorAll(".track-item") || [])]);
  randomizedItems.forEach((item, index) => {
    item.dataset.trackIndex = String(index);
    item.dataset.number = String(index + 1).padStart(2, "0");
    const titleElement = item.querySelector(".track-title");
    if (titleElement) {
      titleElement.dataset.originalText = titleElement.textContent;
      titleElement.dataset.ink = titleElement.textContent;
    }
  });
  playlistList.replaceChildren(...randomizedItems);
  randomizedItems.forEach((item) => bindTrackItem(item, findTrackForItem(item)));
  refreshTrackNodes();
};

const pickItemAtPoint = (clientX, clientY) => {
  if (!playlistList || !trackViewport) return null;
  const box = trackViewport.getBoundingClientRect();
  if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
  const items = [...playlistList.querySelectorAll(".track-item")];
  let best = null;
  let bestDist = Infinity;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.classList.contains("track-empty")) continue;
    const rect = item.getBoundingClientRect();
    if (rect.height < 2) continue;
    const dist = Math.abs(clientY - (rect.top + rect.height / 2));
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
};

const pickTrackFromEvent = (event) => {
  if (event.button != null && event.button !== 0) return;
  if (event.target.closest?.(".auth-panel, .chat-panel, .theme-panel, .transport, .auth-hint, .chat-hint, .theme-hint")) return;
  const item = event.target.closest?.(".track-item") || pickItemAtPoint(event.clientX, event.clientY);
  if (!item || !playlistList?.contains(item) || item.classList.contains("track-empty")) return;
  const track = findTrackForItem(item);
  if (!track) return;
  event.preventDefault();
  playTrack(track, item);
};
window.inteonPlayTrack = playTrack;
window.inteonTrackForItem = findTrackForItem;
playlistList?.addEventListener("click", pickTrackFromEvent);

const restoreTrackStage = () => {
  [...(playlistList?.querySelectorAll(".track-item") || [])].forEach((item) => {
    item.classList.remove("is-departing", "is-kept", "is-playing");
    item.style.transform = "";
    item.style.opacity = "";
    item.style.filter = "";
    const card = item.querySelector(".track-select");
    const fold = item.querySelector(".track-fold");
    if (card) card.style.transform = "";
    if (fold) fold.style.transform = "";
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
  const artist = track?.artist || item?.querySelector(".track-artist")?.textContent.trim() || "inteonmteca";
  immersiveArtist.textContent = artist;
  if (activeTrackArtist) activeTrackArtist.textContent = artist;
  activePlayer?.setAttribute("aria-hidden", "false");
  activePlayer?.classList.add("is-visible");
  requestAnimationFrame(() => activePlayer?.classList.remove("is-swapping"));
  document.body.classList.remove("is-track-diving", "is-immersive");
  document.body.classList.add("is-inline-playing");
  document.body.classList.remove("is-player-arranging");
  immersiveMode?.classList.remove("is-active");
  immersiveMode?.setAttribute("aria-hidden", "true");
  syncTransport();
};

const exitImmersiveMode = () => {
  playbackRequestId += 1;
  if (pendingPlaybackSeek) {
    player?.removeEventListener("loadedmetadata", pendingPlaybackSeek.place);
    pendingPlaybackSeek = null;
  }
  immersiveState.active = false;
  player?.pause();
  immersiveState.audio?.pause();
  window.inteonPlayback?.clear?.();
  immersiveState.audio = null;
  immersiveMode?.classList.remove("is-active");
  immersiveMode?.setAttribute("aria-hidden", "true");
  activePlayer?.classList.remove("is-swapping");
  document.body.classList.remove("is-track-diving", "is-immersive", "is-inline-playing", "is-player-arranging", "is-signal");
  trackFlight?.remove();
  trackFlight = null;
  currentTrack = null;
  currentTrackIndex = -1;
  cancelAnimationFrame(immersiveState.raf);
  setPlaybackStatus();
  restoreTrackStage();
  syncTransport();
};

const formatTime = (value) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const syncTransport = () => {
  if (!player) return;
  const selected = Boolean(currentTrack);
  const loading = selected && !player.paused && player.readyState < 3;
  const playing = selected && !player.paused && !player.ended && !player.error && !loading;
  if (activePlayer) activePlayer.dataset.state = !selected ? "empty" : player.error ? "error" : loading ? "loading" : playing ? "playing" : "paused";
  if (immersivePlay) immersivePlay.disabled = !selected;
  if (previousTrack) previousTrack.disabled = !selected || tracks.length < 2;
  if (nextTrack) nextTrack.disabled = !selected || tracks.length < 2;
  if (trackProgress) trackProgress.disabled = !selected || !Number.isFinite(player.duration) || player.duration <= 0;
  if (trackVolume) trackVolume.disabled = !selected || !volumeSupported;
  const caption = activePlayer?.querySelector(".player-caption");
  if (caption) caption.textContent = !selected ? "Плеер" : loading ? "Загрузка" : playing ? "Сейчас играет" : "Пауза";
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
  trackProgress?.setAttribute("aria-valuetext", `${formatTime(player.currentTime)} из ${formatTime(duration)}`);
  if (immersivePlayIcon) immersivePlayIcon.dataset.state = playing ? "playing" : "paused";
  if (immersivePlay) immersivePlay.setAttribute("aria-label", player.paused ? "Воспроизвести" : "Пауза");
  const signal = playing;
  if (document.body.classList.contains("is-signal") !== signal) {
    document.body.classList.toggle("is-signal", signal);
  }
  if (nowPlayingTitle) {
    const title = currentTrack?.title || "Выберите трек";
    nowPlayingTitle.title = title;
    if (nowPlayingTitle.dataset.track !== title) {
      nowPlayingTitle.textContent = title;
      nowPlayingTitle.dataset.track = title;
    }
  }
  rememberPlayback();
};

let playbackStamp = "";
let playbackLeaving = false;
const rememberPlayback = () => {
  if (playbackLeaving || !window.inteonPlayback || !currentTrack || !player) return;
  if (pendingPlaybackSeek?.requestId === playbackRequestId) return;
  const stamp = `${currentTrack.audio || currentTrack.file}|${player.paused}|${player.currentTime || 0}`;
  if (stamp === playbackStamp) return;
  playbackStamp = stamp;
  window.inteonPlayback.save(player, currentTrack);
};

const restoreSharedPlayback = () => {
  const saved = window.inteonPlayback?.forPage?.("home") || window.inteonPlayback?.read?.();
  if (!saved?.audio || currentTrack) return;
  const wanted = saved.audio;
  const track = tracks.find((item) => String(item.audio || item.file || "").replace(/\\/g, "/") === wanted);
  if (!track) return;
  playTrack(track, null, { shared: { ...saved, paused: !(saved.playingIntent ?? !saved.paused) } });
};

const togglePlayback = () => {
  if (!player || !currentTrack) return;
  if (player.paused && !window.inteonPlayback?.read?.()?.playingIntent) window.inteonPlayback?.select?.(player, "home", { stopAtEnd: window.inteonPlayback?.stopsAtEnd?.(player) });
  window.inteonPlayback?.intent?.(player, player.paused);
  playbackStamp = "";
  if (player.paused) {
    setPlaybackStatus("", "");
    player.play()
      .then(() => {
        setPlaybackStatus();
        attachPlaybackAnalysis();
      })
      .catch(() => { setPlaybackStatus("Не удалось воспроизвести. Повторите попытку", "error"); syncTransport(); });
  } else {
    player.pause();
    rememberPlayback();
  }
};

const playRelativeTrack = (offset, automatic = false) => {
  if (!tracks.length) return;
  const start = currentTrackIndex >= 0 ? currentTrackIndex : 0;
  const nextIndex = (start + offset + tracks.length) % tracks.length;
  playTrack(tracks[nextIndex], nearestItemForTrackIndex(nextIndex), {
    origin: automatic ? window.inteonPlayback?.read?.()?.origin : "home",
  });
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
let volumeSupported = true;
if (player && trackVolume) {
  player.volume = Number(trackVolume.value);
  volumeSupported = Math.abs(player.volume - Number(trackVolume.value)) < .01;
  if (!volumeSupported) {
    trackVolume.hidden = true;
    const note = document.getElementById("volume-note");
    if (note) note.hidden = false;
  }
}
trackVolume?.addEventListener("input", () => {
  if (player) player.volume = Number(trackVolume.value);
});
player?.addEventListener("timeupdate", syncTransport);
player?.addEventListener("durationchange", syncTransport);
player?.addEventListener("play", syncTransport);
player?.addEventListener("pause", syncTransport);
player?.addEventListener("playing", () => { setPlaybackStatus(); syncTransport(); });
player?.addEventListener("waiting", () => { setPlaybackStatus("Загрузка аудио…", "loading"); syncTransport(); });
player?.addEventListener("loadedmetadata", syncTransport);
player?.addEventListener("emptied", syncTransport);
player?.addEventListener("stalled", () => setPlaybackStatus("соединение с media замедлилось", "error"));
player?.addEventListener("error", () => {
  const messages = {
    1: "воспроизведение остановлено",
    2: "не удалось загрузить аудиофайл",
    3: "ошибка декодирования аудио",
    4: "формат аудио не поддерживается",
  };
  setPlaybackStatus(messages[player.error?.code] || "не удалось открыть аудиофайл", "error");
  syncTransport();
});
player?.addEventListener("ended", () => {
  if (!currentTrack) return;
  if (window.inteonPlayback?.stopsAtEnd?.(player)) {
    window.inteonPlayback.intent(player, false);
    player.pause();
    playbackStamp = "";
    rememberPlayback();
    syncTransport();
    return;
  }
  if (tracks.length > 1) playRelativeTrack(1, true);
  else { player.pause(); syncTransport(); }
});
syncTransport();
window.addEventListener("keydown", (event) => {
  if (!immersiveState.active || openPanels.length || document.activeElement?.isContentEditable
      || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName || "")) return;
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
  balanceInfiniteWheel();
  const nudge = pointerPlaylistNudge();
  const max = Math.max(0, playlistList.scrollHeight - playlistList.clientHeight);
  if (nudge) {
    playlistPointerCarry += nudge;
    const step = playlistPointerCarry > 0 ? Math.floor(playlistPointerCarry) : Math.ceil(playlistPointerCarry);
    if (step) {
      playlistList.scrollTop = Math.max(0, Math.min(max, playlistList.scrollTop + step));
      playlistPointerCarry -= step;
      playlistScrollTarget = playlistList.scrollTop;
    }
  } else {
    playlistPointerCarry *= .8;
  }
  playlistScrollTarget = Math.max(0, Math.min(max, playlistScrollTarget));
  const distance = playlistScrollTarget - playlistList.scrollTop;
  playlistScrollVelocity = (playlistScrollVelocity + distance * .075) * .8;
  const nextPosition = Math.max(0, Math.min(max, playlistList.scrollTop + playlistScrollVelocity));
  playlistList.scrollTop = nextPosition;
  // scrollTop can be quantized to a CSS pixel. A sub-pixel spring must settle
  // instead of keeping an otherwise idle mobile page in an endless RAF loop.
  if (!nudge && Math.abs(distance) <= 1 && Math.abs(playlistScrollVelocity) < .5) {
    playlistList.scrollTop = playlistScrollTarget;
    playlistScrollVelocity = 0;
    playlistScrollRaf = 0;
    return;
  }
  playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
};

window.addEventListener("pointermove", () => {
  if (!playlistList || playlistScrollRaf || !pointerPlaylistNudge()) return;
  playlistScrollTarget = playlistList.scrollTop;
  playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
}, { passive: true });

trackViewport?.addEventListener("wheel", (event) => {
  if (!playlistList) return;
  if (playlistList.dataset.layout === "catalog") return;
  event.preventDefault();
  const lineScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20 : 1;
  const pageScale = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? playlistList.clientHeight : 1;
  const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  const delta = rawDelta * lineScale * pageScale;
  if (!playlistScrollRaf) playlistScrollTarget = playlistList.scrollTop;
  playlistScrollTarget += delta * .92;
  playlistScrollVelocity += Math.max(-18, Math.min(18, delta * .035));
  balanceInfiniteWheel();
  const max = Math.max(0, playlistList.scrollHeight - playlistList.clientHeight);
  playlistScrollTarget = Math.max(0, Math.min(max, playlistScrollTarget));
  if (!playlistScrollRaf) playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
}, { passive: false });

playlistList?.addEventListener("scroll", () => {
  if (!playlistScrollRaf) playlistScrollTarget = playlistList.scrollTop;
  if (!wheelBalancing) balanceInfiniteWheel();
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

const openPanels = [];
const panelOpeners = new WeakMap();
const setPanelOpen = (panel, open, { focus = true } = {}) => {
  if (!panel || panel.hidden === !open) return;
  if (open && panel !== chatPanel && compactChatViewport.matches && !chatPanel?.hidden) closeChat();
  const trigger = document.getElementById(panel.id.replace("-panel", "-hint"));
  if (open) panelOpeners.set(panel, document.activeElement);
  const index = openPanels.indexOf(panel);
  if (index !== -1) openPanels.splice(index, 1);
  panel.hidden = !open;
  if (panel === themePanel) {
    document.body.classList.toggle('is-theme-menu-open', open);
    if (open) {
      const bottom = panel.getBoundingClientRect().bottom;
      const shift = Math.max(0, bottom + 38 - (innerHeight * .14 + 44));
      document.body.style.setProperty('--theme-heading-shift', `${shift}px`);
      const heading = document.querySelector('.listening-intro h1');
      const logoHeight = logoWrap?.getBoundingClientRect().height || 0;
      const headingHeight = heading?.getBoundingClientRect().height || 0;
      document.body.style.setProperty('--theme-logo-top', `${innerHeight * .14 + 44 + shift + headingHeight + logoHeight / 2 + 20}px`);
    }
  }
  panel.setAttribute("aria-hidden", String(!open));
  trigger?.setAttribute("aria-expanded", String(open));
  if (open) {
    openPanels.push(panel);
    openPanels.forEach((entry, order) => { entry.style.zIndex = String(40 + order); });
    if (focus) panel.querySelector('input:not([hidden]), select, button')?.focus({ preventScroll: true });
  } else {
    panel.style.zIndex = "";
    const opener = panelOpeners.get(panel);
    if (panel.contains(document.activeElement)) {
      (opener?.isConnected ? opener : trigger)?.focus({ preventScroll: true });
    }
    panelOpeners.delete(panel);
  }
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
  const ruCount = (value, one, few, many) => {
    const n = Math.abs(value) % 100;
    const last = n % 10;
    const word = n > 10 && n < 20 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
    return `${value} ${word}`;
  };
  if (duration < 60000) return ruCount(Math.round(duration / 1000), "секунда", "секунды", "секунд");
  const minutes = Math.round(duration / 60000);
  if (minutes < 90) return ruCount(minutes, "минута", "минуты", "минут");
  const hours = Math.round(minutes / 60);
  if (hours < 36) return ruCount(hours, "час", "часа", "часов");
  const days = Math.max(2, Math.round(hours / 24));
  return days >= 7 ? "1 неделя" : ruCount(days, "день", "дня", "дней");
};

const currentThemeDuration = () => themeSliderToDuration(themeDuration?.value || themeDurationToSlider(THEME_DEFAULT_MS));

const updateThemeDurationLabel = () => {
  const duration = currentThemeDuration();
  if (themeDurationOutput) themeDurationOutput.textContent = formatThemeDuration(duration);
  return duration;
};

const setTheme = (name, { animate = true, persist = true } = {}) => {
  const nextTheme = themesById.has(name) ? name : "desert";
  const root = document.documentElement;
  const changed = root.dataset.theme !== nextTheme;
  const theme = themesById.get(nextTheme);
  if (window.inteonThemeMorph) window.inteonThemeMorph.apply(theme.tokens, theme.mood, changed && animate);
  else for (const [property, value] of Object.entries(theme.tokens)) root.style.setProperty(property, value);
  root.dataset.theme = nextTheme;
  root.dataset.themeMood = theme.mood;
  if (themeSelect) themeSelect.value = nextTheme;
  if (persist) storeValue(themeStorageKey, nextTheme);
  if (changed && themeStatus) {
    themeStatus.textContent = themesById.get(nextTheme).name;
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
  }, duration + (window.inteonThemeMorph?.active ? 15000 : 0));
};

const initializeThemeSystem = () => {
  populateThemeSelect();
  const storedTheme = readStoredValue(themeStorageKey);
  const storedDuration = Number(readStoredValue(themeDurationStorageKey)) || THEME_DEFAULT_MS;
  if (themeDuration) themeDuration.value = String(themeDurationToSlider(storedDuration));
  setTheme(storedTheme || document.documentElement.dataset.theme || "fern", { animate: false, persist: false });
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  perceptionLastFrame = performance.now();
  inkLastFrame = performance.now();
  logoLastFrame = performance.now();
  lastVisualTick = 0;
  windLastTick = 0;
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
  if (chatInput) {
    chatInput.readOnly = !sessionEmail;
    chatInput.placeholder = sessionEmail ? "написать в воздух" : "войди, чтобы написать";
  }
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
    throw new Error("сервер входа недоступен — попробуй позже");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("API входа не подключён к этому адресу сайта");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
};

const useLocalPass = () => isFileMode || passIsLocal;

const showLocalCode = () => {
  if (!emailFormat.test(pendingEmail)) throw new Error("нужна почта: имя@example.com");
  rememberLocalAccount(pendingEmail);
  localLoginCode = createLoginCode();
  passIsLocal = true;
  authCodeForm.hidden = false;
  if (authCodeLabel) authCodeLabel.textContent = "код с экрана";
  setAuthStatus(`код входа: ${localLoginCode}`);
  authCode?.focus();
};

const acceptLocalCode = () => {
  if (authCode?.value.trim() !== localLoginCode) throw new Error("код не подошёл");
  sessionEmail = pendingEmail;
  storeValue(localSessionStorageKey, sessionEmail);
  refreshAuthHint();
  setPanelOpen(authPanel, false);
  setAuthStatus("");
};

const apiMissing = (error) => /не подключён|недоступен|local-auth/.test(error?.message || "");

const loadSession = async () => {
  if (isFileMode) {
    sessionEmail = readStoredValue(localSessionStorageKey) || "";
    passIsLocal = true;
    refreshAuthHint();
    return;
  }
  try {
    const data = await requestJson("/api/auth/me");
    sessionEmail = data.email || "";
    passIsLocal = false;
  } catch (error) {
    if (apiMissing(error)) {
      passIsLocal = true;
      sessionEmail = readStoredValue(localSessionStorageKey) || "";
    } else {
      passIsLocal = false;
      sessionEmail = "";
    }
  }
  refreshAuthHint();
};

authHint?.addEventListener("click", () => {
  const opening = authPanel.hidden;
  setPanelOpen(authPanel, opening);
  if (!opening) return;
  if (sessionEmail) {
    setAuthStatus(sessionEmail);
    return;
  }
  authEmail?.focus();
});

authLogout?.addEventListener("click", async () => {
  if (useLocalPass()) {
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
  setAuthStatus("готовим код…");
  try {
    if (useLocalPass()) {
      showLocalCode();
      return;
    }
    const data = await requestJson("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail }),
    });
    authCodeForm.hidden = false;
    const directCode = data.login_code || data.dev_code;
    if (authCodeLabel) authCodeLabel.textContent = directCode ? "код с экрана" : "код из письма";
    setAuthStatus(directCode ? `код входа: ${directCode}` : `код отправлен на ${pendingEmail}`);
    authCode?.focus();
  } catch (error) {
    if (apiMissing(error)) {
      try {
        showLocalCode();
      } catch (localError) {
        setAuthStatus(localError.message);
      }
      return;
    }
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
    if (useLocalPass()) {
      acceptLocalCode();
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
  chatAnimationFrame = 0;
  if (chatPanel?.hidden || document.hidden || animationQuality === "low" || prefersReducedMotion) return;
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
  chatAnimationFrame = requestAnimationFrame(animateChatGlyphs);
};

let chatSnapshot = "";
let chatLoading = false;
const renderChatMessages = (messages) => {
  if (!chatStream) return;
  const all = Array.isArray(messages) ? messages : [];
  const animateGlyphs = !inlineChat && animationQuality !== "low" && !prefersReducedMotion && !compactChatViewport.matches;
  const snapshot = JSON.stringify([animateGlyphs, all]);
  if (snapshot === chatSnapshot) {
    if (chatGlyphs.length && !chatAnimationFrame && !chatPanel?.hidden && !document.hidden) chatAnimationFrame = requestAnimationFrame(animateChatGlyphs);
    return;
  }
  const scrollTop = chatStream.scrollTop;
  const atBottom = !chatStream.childElementCount || chatStream.scrollHeight - chatStream.clientHeight - scrollTop < 48;
  chatSnapshot = snapshot;
  cancelAnimationFrame(chatAnimationFrame);
  chatAnimationFrame = 0;
  chatStream.replaceChildren();
  chatGlyphs = [];

  all.forEach((message, index) => {
    const line = document.createElement("div");
    line.className = "chat-line";
    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = (message.email || "").split("@")[0] || "гость";
    line.append(meta);
    const recent = animateGlyphs && index >= all.length - 8 && chatGlyphs.length + String(message.text || "").length <= 320;
    if (recent) {
      [...String(message.text || "")].forEach((char) => {
        const glyph = document.createElement("span");
        glyph.className = "chat-glyph";
        glyph.textContent = char === " " ? "\u00a0" : char;
        line.append(glyph);
        chatGlyphs.push(glyph);
      });
    } else {
      const body = document.createElement("span");
      body.className = "chat-text";
      body.textContent = message.text || "";
      line.append(body);
    }
    chatStream.append(line);
  });
  chatStream.scrollTop = atBottom ? chatStream.scrollHeight : scrollTop;
  if (chatGlyphs.length) chatAnimationFrame = requestAnimationFrame(animateChatGlyphs);
};

const loadChat = async () => {
  if (chatLoading || chatPanel?.hidden || document.hidden) return;
  if (useLocalPass()) {
    renderChatMessages(readStoredJson(localChatStorageKey, []));
    return;
  }
  chatLoading = true;
  try {
    const data = await requestJson("/api/chat");
    renderChatMessages(data.messages || data);
  } catch (error) {
    if (apiMissing(error)) {
      passIsLocal = true;
      renderChatMessages(readStoredJson(localChatStorageKey, []));
    } else if (!chatStream.childElementCount) {
      renderChatMessages([{ email: "inteonmteca", text: "чат временно недоступен — нет связи с сервером" }]);
    }
  } finally {
    chatLoading = false;
  }
};

const openChat = async ({ focus = false } = {}) => {
  if (!inlineChat && compactChatViewport.matches) {
    setPanelOpen(authPanel, false);
    setPanelOpen(themePanel, false);
  }
  if (!inlineChat) {
    setPanelOpen(chatPanel, true, { focus: false });
    document.body.classList.add("is-chat-open");
  }
  syncChatViewport();
  if (chatInput) {
    chatInput.placeholder = sessionEmail ? "написать в воздух" : "войди, чтобы написать";
    chatInput.readOnly = !sessionEmail;
  }
  if (compactChatViewport.matches) chatClose?.focus({ preventScroll: true });
  else if (focus) chatInput?.focus({ preventScroll: true });
  await loadChat();
  if (chatPanel?.hidden) return;
  window.clearInterval(chatTimer);
  chatTimer = window.setInterval(loadChat, 2500);
};

const closeChat = () => {
  if (inlineChat) return;
  window.clearInterval(chatTimer);
  cancelAnimationFrame(chatAnimationFrame);
  chatAnimationFrame = 0;
  setPanelOpen(chatPanel, false);
  document.body.classList.remove("is-chat-open");
  syncChatViewport();
  chatHint?.focus();
};

const syncChatViewport = () => {
  if (inlineChat) {
    const dock = document.getElementById("active-player")?.getBoundingClientRect();
    if (dock) {
      chatPanel.style.setProperty("--inline-chat-left", `${dock.left + 10}px`);
      chatPanel.style.setProperty("--inline-chat-width", `${Math.max(0,dock.width - 20)}px`);
      chatPanel.style.setProperty("--inline-chat-bottom", `${innerHeight-dock.top+8}px`);
    }
    chatPanel.removeAttribute("aria-modal");
    return;
  }
  const modal = compactChatViewport.matches && !chatPanel?.hidden;
  chatPanel?.setAttribute("aria-modal", String(modal));
  document.querySelectorAll('.page, .street-return, .auth-hint, .theme-hint').forEach((element) => { element.inert = modal; });
  const viewport = window.visualViewport;
  if (chatPanel && viewport) {
    chatPanel.style.setProperty("--chat-height", `${viewport.height}px`);
    chatPanel.style.setProperty("--chat-top", `${viewport.offsetTop}px`);
  }
};
compactChatViewport.addEventListener("change", (event) => {
  if (event.matches && !chatPanel?.hidden) closeChat();
  syncChatViewport();
});
window.visualViewport?.addEventListener("resize", syncChatViewport, { passive: true });
window.visualViewport?.addEventListener("scroll", syncChatViewport, { passive: true });
chatHint?.addEventListener("click", () => openChat({ focus: !compactChatViewport.matches }));
chatClose?.addEventListener("click", closeChat);
// Keep a rolling draft that fits the actual input, including proportional letters and emoji.
const chatMeasureContext = document.createElement("canvas").getContext("2d");
const chatSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, {granularity:"grapheme"}) : null;
const fitChatDraft = () => {
  if (!chatInput || !chatMeasureContext || !chatInput.value) return;
  const style = getComputedStyle(chatInput);
  const available = chatInput.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 3;
  if (available <= 0) return;
  chatMeasureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spacing = parseFloat(style.letterSpacing) || 0;
  const original = chatInput.value;
  const chars = chatSegmenter ? [...chatSegmenter.segment(original)].map(part => part.segment) : Array.from(original);
  const fits = start => chatMeasureContext.measureText(chars.slice(start).join("")).width + Math.max(0,chars.length-start-1)*spacing <= available;
  if (fits(0)) { chatInput.scrollLeft = 0; return; }
  let low=0, high=chars.length;
  while (low<high) { const middle=(low+high)>>1; if (fits(middle)) high=middle; else low=middle+1; }
  const value=chars.slice(low).join("");
  const removed=original.length-value.length;
  const start=chatInput.selectionStart, end=chatInput.selectionEnd;
  chatInput.value=value;
  chatInput.setSelectionRange(Math.max(0,start-removed),Math.max(0,end-removed));
  chatInput.scrollLeft=0;
};
chatInput?.addEventListener("input", event => { if (!event.isComposing) fitChatDraft(); });
chatInput?.addEventListener("compositionend", fitChatDraft);
chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sessionEmail) {
    setPanelOpen(authPanel, true);
    setAuthStatus("сначала почта");
    return;
  }
  fitChatDraft();
  const text = chatInput?.value.trim();
  if (!text) return;
  try {
    if (useLocalPass()) {
      const messages = readStoredJson(localChatStorageKey, []);
      messages.push({
        id: Date.now(),
        email: sessionEmail,
        text,
        created_at: Math.floor(Date.now() / 1000),
      });
      storeValue(localChatStorageKey, JSON.stringify(messages));
      chatInput.value = "";
      renderChatMessages(messages);
      return;
    }
    await requestJson("/api/chat", { method: "POST", body: JSON.stringify({ text }) });
    chatInput.value = "";
    await loadChat();
  } catch (error) {
    if (apiMissing(error)) {
      passIsLocal = true;
      const messages = readStoredJson(localChatStorageKey, []);
      messages.push({
        id: Date.now(),
        email: sessionEmail,
        text,
        created_at: Math.floor(Date.now() / 1000),
      });
      storeValue(localChatStorageKey, JSON.stringify(messages));
      chatInput.value = "";
      renderChatMessages(messages);
      return;
    }
    renderChatMessages([{ email: "система", text: error.message === "request failed" ? "нет связи" : error.message }]);
  }
});

const handlePanelKeydown = (event) => {
  if (!inlineChat && event.key === "Tab" && compactChatViewport.matches && !chatPanel?.hidden) {
    const controls = [...chatPanel.querySelectorAll('input:not([disabled]), button:not([disabled])')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const topPanel = openPanels[openPanels.length - 1];
  if (topPanel) {
    event.preventDefault();
    if (topPanel === chatPanel) closeChat();
    else setPanelOpen(topPanel, false);
    return;
  }
};
window.addEventListener("keydown", handlePanelKeydown);

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
let logoFilamentSeeds = [];
const setupLogoFilaments = () => {
  if (isMobileViewport) return;
  logoFilamentSeeds = Array.from({ length: animationQuality === "low" ? 28 : 52 }, (_, index) => ({
    x: .08 + hashUnit(index + 101.3) * .84,
    y: .32 + hashUnit(index + 141.8) * .36,
    phase: hashUnit(index + 181.4) * Math.PI * 2,
    size: .35 + hashUnit(index + 221.9) * 1.45,
    band: index % 3,
  }));
};
setupLogoFilaments();

const setupLogoSlices = () => {
  if (isMobileViewport) return;
  if (!logoVector || !logoSliceContainer) return;
  const defs = logoVector.querySelector("defs");
  if (!defs) return;
  logoSlices = [];
  logoSliceContainer.replaceChildren();
  defs.querySelectorAll('clipPath[id^="logo-slice-clip-"]').forEach(node => node.remove());
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
  if (isMobileViewport) return;
  if (!logoReactiveCanvas || !logoReactiveContext) return;
  const bounds = logoReactiveCanvas.getBoundingClientRect();
  const scale = isListeningRoom ? .75 : Math.min(devicePixelRatio || 1, 1.5);
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
  // The low-quality stylesheet hides this canvas; do not measure/draw it.
  if (isMobileViewport && animationQuality === "low") return;
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
    const steps = 64;
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
    const tint = green ? '204,255,105' : '224,112,64';
    const alpha = .025 + (green ? profile.high * .18 : profile.mid * .14);
    const fade = ctx.createLinearGradient(width * .08, 0, width * .92, 0);
    fade.addColorStop(0, `rgba(${tint},0)`);
    fade.addColorStop(.22, `rgba(${tint},${alpha})`);
    fade.addColorStop(.78, `rgba(${tint},${alpha})`);
    fade.addColorStop(1, `rgba(${tint},0)`);
    ctx.strokeStyle = fade;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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

const logoAmbientUpdates = new Map();
const writeLogoVariable = (element, name, value) => {
  if (element && element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
};
const setLogoCssVariable = (name, value) => {
  if (!isListeningRoom) {
    writeLogoVariable(document.documentElement, name, value);
    writeLogoVariable(logoWrap, name, value);
    return;
  }
  // Fast motion belongs to the SVG subtree, not to all 108 scattered tiles.
  writeLogoVariable(reactiveLogo, name, value);
  if (name === "--logo-high" || name === "--logo-energy") {
    const now = performance.now();
    if (now - (logoAmbientUpdates.get(name) || 0) > 120) {
      writeLogoVariable(logoWrap, name, value);
      logoAmbientUpdates.set(name, now);
    }
  }
};

let roomMusicAccentAt = 0, roomMusicAccentUntil = 0;
const renderReactiveLogo = (now) => {
  if (now - logoLastFrame < renderInterval()) return;
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
  setLogoCssVariable("--logo-rx", `${(-y * 2.25).toFixed(2)}deg`);
  setLogoCssVariable("--logo-ry", `${(x * 3.25).toFixed(2)}deg`);
  const live = immersiveState.active ? 1.45 : 1;
  let musicAccent = 0;
  if (isListeningRoom && !player.paused && !player.ended) {
    if (!roomMusicAccentAt) roomMusicAccentAt = now + 3000;
    if (now >= roomMusicAccentAt) {
      roomMusicAccentUntil = now + 4200;
      roomMusicAccentAt = now + randomRange(17000,26000);
    }
    if (now < roomMusicAccentUntil) {
      const progress = 1 - (roomMusicAccentUntil-now)/4200;
      musicAccent = Math.sin(progress*Math.PI) * (.35 + bass*.65);
    }
  } else { roomMusicAccentAt = 0; roomMusicAccentUntil = 0; }
  setLogoCssVariable("--logo-scale", (1 + (bass * .075 + profile.flux * .025) * live + musicAccent*.018).toFixed(4));
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

  const sliceForce = high * 8 + profile.flux * 13 + musicAccent * 3 + (logoChaosActive ? 12 : 0) + (immersiveState.active ? 7 : 0);
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
  if (isMobileViewport) return;
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

const renderLogoMatrix = (readable = false) => {
  if (isMobileViewport) return;
  logoWrap?.classList.toggle("is-assembled", readable);
  logoWrap?.classList.toggle("is-charging", readable);
  if (logoChargeTimeout) window.clearTimeout(logoChargeTimeout);
  if (readable) {
    logoChargeTimeout = scheduleLogo(() => logoWrap?.classList.remove("is-charging"), 1350);
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
  if (isMobileViewport) return;
  if (window.inteonLogoAcid?.active) return;
  if (logoChaosActive) return;
  logoLocked = true;
  logoWrap?.classList.add("is-stable");
  renderLogoMatrix(true);
  if (!isListeningRoom) {
    scheduleLogo(() => setAllTextReadable(true), 520);
    scheduleLogo(() => setAllTextReadable(false), 4120);
  }
  scheduleLogo(() => {
    logoLocked = false;
    logoWrap?.classList.remove("is-stable");
  }, 5200);
};

const resetLogoChaosCountdown = () => {
  logoChaosCountdown = randomInteger(5, 10);
};

let logoCycleVariant = 0;
const runLogoCycle = () => {
  if (isMobileViewport) return;
  if (logoChaosActive) {
    logoCycleTimeout = scheduleLogo(runLogoCycle, 1200);
    return;
  }
  if (fullReadableMode || logoLocked) {
    renderLogoMatrix(true);
    logoCycleTimeout = scheduleLogo(runLogoCycle, 1200);
    return;
  }
  if (++logoCycleVariant % 3 === 0) {
    const acid = window.inteonLogoAcid?.run();
    if (acid) {
      acid.then(() => {
        renderLogoMatrix(true);
        logoCycleTimeout = scheduleLogo(runLogoCycle, randomRange(3000, 7000));
      });
      return;
    }
  }
  logoChaosCountdown -= 1;
  if (logoChaosCountdown <= 0) resetLogoChaosCountdown();
  renderLogoMatrix(false);
  const chaosDuration = randomRange(2000, 16000);
  scheduleLogo(() => {
    if (logoChaosActive) return;
    logoWrap?.classList.add("is-assembling");
    renderLogoMatrix(true);
    scheduleLogo(() => logoWrap?.classList.remove("is-assembling"), 320);
    logoCycleTimeout = scheduleLogo(runLogoCycle, randomRange(1000, 10000));
  }, chaosDuration);
};

matrixElements.forEach((element) => {
  element.dataset.originalText = element.textContent;
  element.classList.add("is-matrixing");
});

if (matrixElements.length && !prefersReducedMotion) window.setInterval(() => {
  if (!document.hidden) matrixElements.forEach(renderMatrixNoise);
}, prefersReducedMotion ? 360 : animationQuality === "low" ? 180 : 95);
window.setTimeout(runReadableWave, 1200);
window.setInterval(runReadableWave, 6200);
let logoReadableInterval = 0;
const logoTimers = new Set();
const scheduleLogo = (callback, delay) => {
  const id = window.setTimeout(() => {
    logoTimers.delete(id);
    if (!isMobileViewport) callback();
  }, delay);
  logoTimers.add(id);
  return id;
};
// Text is intentionally live, but never driven by the decorative frame loop.
if (!prefersReducedMotion) window.setInterval(() => {
  if (!isMobileViewport || document.hidden || (!inlineChat && !chatPanel?.hidden)) return;
  const now = performance.now();
  renderTitleMutation(now);
  renderPlayingLetters(now);
}, 150);

let roomLastRaf = 0, roomVisualCost = 0;
const tickVisuals = (now) => {
  sceneRaf = 0;
  if (isMobileViewport) return;
  sceneRaf = requestAnimationFrame(tickVisuals);
  if (document.hidden) return;
  // One sparse particle field; skip hidden ink/logo canvases and DOM-wide style writes.
  if (isListeningRoom) {
    if (roomLastRaf) recordFramePacing(now-roomLastRaf);
    roomLastRaf = now;
    const roomInterval = Math.max(renderInterval(), Math.min(100, roomVisualCost * 2.5));
    if (now - lastVisualTick < roomInterval) return;
    const roomFrameStart = performance.now();
    lastVisualTick = now;
    motionState.x += (motionTarget.x - motionState.x) * .025;
    motionState.y += (motionTarget.y - motionState.y) * .025;
    renderPerceptionField(now);
    renderReactiveLogo(now);
    renderTitleMutation(now);
    renderPlayingLetters(now);
    roomVisualCost += (performance.now()-roomFrameStart-roomVisualCost)*.12;
    return;
  }
  if (lastVisualTick) recordFramePacing(now - lastVisualTick);
  lastVisualTick = now;
  renderWeightedMotion(now);
  renderPerceptionField(now);
  if (immersiveState.active) drawImmersiveScene(now);
  renderInkField(now);
  renderTitleMutation(now);
  renderPlayingLetters(now);
  loopPlaylistMotion(now);
  renderReactiveLogo(now);
};

let backgroundInitialized = false;
const syncBackgroundRenderer = () => {
  isMobileViewport = backgroundViewport.matches;
  document.documentElement.dataset.backgroundMode = isMobileViewport ? "static" : "live";
  cancelAnimationFrame(sceneRaf);
  sceneRaf = 0;
  lastVisualTick = 0;
  roomLastRaf = 0;
  logoTimers.forEach(clearTimeout);
  logoTimers.clear();
  clearInterval(logoReadableInterval);
  logoReadableInterval = 0;
  window.removeEventListener("pointermove", setPointerMotion);
  window.removeEventListener("devicemotion", handleDeviceMotion);
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  if (isMobileViewport) return;
  if (isListeningRoom) {
    if (document.hidden || reducedMotionPreference.matches) return;
    perceptionContext ||= perceptionVisual?.getContext("2d");
    setupPerceptionField();
    setupWindField();
    if (!backgroundInitialized) {
      setupLogoSlices();
      setupLogoParticles();
      logoTurbulence?.setAttribute("numOctaves", "3");
      backgroundInitialized = true;
    }
    logoReactiveContext ||= logoReactiveCanvas?.getContext("2d");
    resizeLogoCanvas();
    logoLocked = false;
    fullReadableMode = false;
    logoWrap?.classList.remove("is-assembling", "is-stable");
    renderLogoMatrix(true);
    resetLogoChaosCountdown();
    scheduleLogo(runLongReadableMoment, 3200);
    logoReadableInterval = window.setInterval(runLongReadableMoment, 9500);
    logoCycleTimeout = scheduleLogo(runLogoCycle, randomRange(1000, 10000));
    window.addEventListener("pointermove", setPointerMotion, { passive: true });
    sceneRaf = requestAnimationFrame(tickVisuals);
    return;
  }
  perceptionContext ||= perceptionVisual?.getContext("2d");
  inkContext ||= inkField?.getContext("2d");
  logoReactiveContext ||= logoReactiveCanvas?.getContext("2d");
  if (!backgroundInitialized) {
    setupLogoSlices();
    setupLogoParticles();
    backgroundInitialized = true;
  }
  setupPerceptionField();
  setupWindField();
  resizeInkField();
  resizeLogoCanvas();
  logoLocked = false;
  setAllTextReadable(false);
  logoWrap?.classList.remove("is-assembling", "is-stable");
  renderLogoMatrix(true);
  resetLogoChaosCountdown();
  if (!prefersReducedMotion) {
    scheduleLogo(runLongReadableMoment, 3200);
    logoReadableInterval = window.setInterval(runLongReadableMoment, 9500);
    logoCycleTimeout = scheduleLogo(runLogoCycle, randomRange(1000, 10000));
  }
  window.addEventListener("pointermove", setPointerMotion, { passive: true });
  window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
  window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
  sceneRaf = requestAnimationFrame(tickVisuals);
};
backgroundViewport.addEventListener("change", syncBackgroundRenderer);
reducedMotionPreference.addEventListener("change", () => {
  if (isListeningRoom) syncBackgroundRenderer();
});
document.addEventListener("visibilitychange", () => {
  if (isListeningRoom) syncBackgroundRenderer();
});
syncBackgroundRenderer();
window.addEventListener("resize", resizeLogoCanvas, { passive: true });

try { initializeThemeSystem(); } catch {}
window.setTimeout(() => {
  try {
    bindFallbackTracks();
    if (Array.isArray(window.INTEONMTECA_PLAYLIST) && window.INTEONMTECA_PLAYLIST.length) {
      renderPlaylist(window.INTEONMTECA_PLAYLIST);
      // Restoration retains the original playback origin, including reload.
      restoreSharedPlayback();
    }
  } catch {}
}, 0);
loadSession();

streetLink?.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (window.inteonPortal?.busy) { event.preventDefault(); return; }
  rememberPlayback();
  if (window.inteonPlayback?.read?.()?.origin !== "yard") {
    window.inteonPlayback?.intent?.(player, false);
    player?.pause();
    playbackStamp = "";
    rememberPlayback();
  }
  window.inteonStreet?.noteExit();
  if (window.inteonPortal) { event.preventDefault(); window.inteonPortal.exit(streetLink.href); }
});
window.addEventListener("pagehide", () => { rememberPlayback(); playbackLeaving = true; });
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  // A restored document must not overwrite the newer document's session.
  const saved = window.inteonPlayback?.read?.();
  if (!saved) { exitImmersiveMode(); playbackLeaving = false; return; }
  player?.pause();
  currentTrack = null;
  playbackLeaving = false;
  restoreSharedPlayback();
});

window.addEventListener("DOMContentLoaded", () => {
  setupVisitCounter();
  updateScrollbar();
});

if (inlineChat) {
  openChat();
  window.addEventListener("resize", syncChatViewport, {passive:true});
  const inlineDock = document.getElementById("active-player");
  if (inlineDock) new ResizeObserver(syncChatViewport).observe(inlineDock);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadChat(); });
}
