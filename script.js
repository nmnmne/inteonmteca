const player = document.getElementById("album-player");
const playButton = document.getElementById("play-random");
const playIcon = playButton?.querySelector(".play-icon");
const previousButton = document.getElementById("previous-track");
const nextButton = document.getElementById("next-track");
const nowPlaying = document.getElementById("now-playing");
const logoMatrix = document.getElementById("logo-matrix");
const logoWrap = document.querySelector(".logo-wrap");
const logoParticles = document.getElementById("logo-particles");
const releaseCover = document.getElementById("release-cover");
const coverPreview = document.getElementById("cover-preview");
const matrixElements = document.querySelectorAll(".matrix-text");
const uniqueCount = document.getElementById("unique-count");
const visitCount = document.getElementById("visit-count");
const presaveTitle = document.querySelector(".presave-title");

const albumPath = "media/wave-phonk/";
const tracks = [
  { file: "01-trancented.flac", title: "Матт - Trancented" },
  { file: "02-memphis.flac", title: "Матт - Memphis" },
  { file: "03-cassette-bruise.flac", title: "Матт - Cassette Bruise" },
  { file: "04-wave-phonk.flac", title: "Матт - Wave Phonk" },
  { file: "05-telephone-bricks.flac", title: "Матт - Telephone Bricks" },
  { file: "06-basement-dialtone.flac", title: "Матт - Basement Dialtone" },
  { file: "07-douep.flac", title: "Матт - Douep" },
];

let playOrder = [];
let playOrderIndex = 0;
let currentTrack = "";
let previousTracks = [];
let isBlocked = false;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const counterNamespace = "inteonmteca.online";
const uniqueStorageKey = "inteonmteca-unique-visit";
const assetVersion = "20260430-1702";

const setupPresaveTitleWave = () => {
  if (!presaveTitle || prefersReducedMotion) {
    return;
  }

  const text = presaveTitle.textContent || "";
  presaveTitle.textContent = "";

  [...text].forEach((letter, index) => {
    const span = document.createElement("span");
    span.textContent = letter === " " ? "\u00a0" : letter;
    span.style.animationDelay = `${index * 45}ms`;
    presaveTitle.append(span);
  });
};

const updateCounterText = (element, value) => {
  if (!element || value === null || value === undefined) {
    return;
  }

  element.textContent = String(value);
};

const counterBaseUrl = "https://abacus.jasoncameron.dev";

const readCounterValue = async (url) => {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("counter unavailable");
  }

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
  if (!uniqueCount && !visitCount) {
    return;
  }

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

const shuffle = (items) => {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }

  return result;
};

const createPlaybackOrder = () => {
  const order = shuffle(tracks);
  const forbiddenFirstTracks = new Set([tracks[0], tracks[3]]);

  if (forbiddenFirstTracks.has(order[0])) {
    const swapIndex = order.findIndex((track) => !forbiddenFirstTracks.has(track));

    if (swapIndex > 0) {
      [order[0], order[swapIndex]] = [order[swapIndex], order[0]];
    }
  }

  return order;
};

const setNowPlaying = (text) => {
  if (!nowPlaying) {
    return;
  }

  nowPlaying.textContent = text;
  nowPlaying.dataset.originalText = text;
};

const updateTransportButtons = () => {
  if (!previousButton) {
    return;
  }

  const hasPreviousTrack = previousTracks.length > 0;
  previousButton.disabled = !hasPreviousTrack;
  previousButton.classList.toggle("is-disabled", !hasPreviousTrack);
};

const setPlaybackActive = () => {
  isBlocked = false;
  document.body.classList.add("is-playback-active");
  playButton?.classList.add("is-playing");
  playButton?.setAttribute("aria-hidden", "true");
  if (playIcon) {
    playIcon.textContent = "▶";
  }

  if (currentTrack) {
    setNowPlaying(`сейчас: ${currentTrack.title}`);
  }

  updateTransportButtons();
};

const setPlaybackBlocked = () => {
  isBlocked = true;
  document.body.classList.remove("is-playback-active");
  playButton?.classList.remove("is-playing");
  playButton?.removeAttribute("aria-hidden");
  playButton?.setAttribute("aria-label", "Включить альбом");
  if (playIcon) {
    playIcon.textContent = "▶";
  }
  setNowPlaying("нажми в любое место, чтобы включить звук");
  updateTransportButtons();
};

const startCurrentTrack = async () => {
  if (!player) {
    return;
  }

  try {
    await player.play();
    setPlaybackActive();
  } catch {
    setPlaybackBlocked();
    return;
  }
};

const setNextTrack = () => {
  if (!player) {
    return;
  }

  if (currentTrack) {
    previousTracks.push(currentTrack);
  }

  if (playOrder.length === 0) {
    playOrder = createPlaybackOrder();
    playOrderIndex = 0;
  }

  currentTrack = playOrder[playOrderIndex];
  playOrderIndex = (playOrderIndex + 1) % playOrder.length;
  player.src = `${albumPath}${currentTrack.file}?v=${assetVersion}`;
  player.load();

  setNowPlaying(`сейчас: ${currentTrack.title}`);
  updateTransportButtons();
};

const playNext = async () => {
  setNextTrack();
  await startCurrentTrack();
};

const playPrevious = async () => {
  if (!player || previousTracks.length === 0) {
    return;
  }

  if (currentTrack && playOrder.length > 0) {
    const currentIndex = playOrder.indexOf(currentTrack);

    if (currentIndex >= 0) {
      playOrderIndex = currentIndex;
    }
  }

  currentTrack = previousTracks.pop();
  player.src = `${albumPath}${currentTrack.file}?v=${assetVersion}`;
  player.load();
  setNowPlaying(`сейчас: ${currentTrack.title}`);
  updateTransportButtons();
  await startCurrentTrack();
};

const unlockAudio = () => {
  if (isBlocked && currentTrack) {
    startCurrentTrack();
  }
};

if (playButton && player) {
  player.playbackRate = 1;
  player.addEventListener("ratechange", () => {
    if (player.playbackRate !== 1) {
      player.playbackRate = 1;
    }
  });

  playButton.addEventListener("click", () => {
    if (isBlocked && currentTrack) {
      startCurrentTrack();
      return;
    }

    playNext();
  });
  player.addEventListener("ended", playNext);
  player.addEventListener("playing", setPlaybackActive);
  player.addEventListener("play", setPlaybackActive);
}

previousButton?.addEventListener("click", playPrevious);
nextButton?.addEventListener("click", playNext);

window.addEventListener("DOMContentLoaded", () => {
  setupVisitCounter();
  updateTransportButtons();
  playNext();
});

window.addEventListener("pointerdown", unlockAudio, { once: false });
window.addEventListener("touchend", unlockAudio, { once: false });
window.addEventListener("click", unlockAudio, { once: false });
window.addEventListener("keydown", unlockAudio, { once: false });

const toggleCoverPreview = () => {
  if (!coverPreview) {
    return;
  }

  const isOpen = coverPreview.classList.toggle("is-open");
  coverPreview.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("cover-open", isOpen);
};

releaseCover?.addEventListener("click", toggleCoverPreview);
coverPreview?.addEventListener("click", toggleCoverPreview);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && coverPreview?.classList.contains("is-open")) {
    toggleCoverPreview();
  }
});

const matrixGlyphs = "01/\\|<>[]{}#$%&*+-=abcdefghijklmnopqrstuvwxyz";
const readableElements = new Set();
const matrixHoldStates = new WeakMap();
const matrixHoldRatio = 0.15;
const matrixHoldDuration = 1000;
const logoText = "inteonmteca";
const logoLetters = [];
const particleGrid = { cols: 18, rows: 6 };
let fullReadableMode = false;
let logoLocked = false;
let logoChaosActive = false;
let logoChargeTimeout;
let logoCycleTimeout;
let logoChaosCountdown = 0;

matrixElements.forEach((element) => {
  element.dataset.originalText = element.textContent;
  element.classList.add("is-matrixing");
});

const isStaticChar = (char) => [" ", ".", "-", "—", "/"].includes(char);

const randomGlyph = () =>
  matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];

const getMatrixHoldState = (element, original) => {
  let state = matrixHoldStates.get(element);

  if (!state || state.length !== original.length) {
    state = {
      heldIndexes: new Set(),
      length: original.length,
      nextShuffleAt: 0,
      rendered: "",
    };
    matrixHoldStates.set(element, state);
  }

  return state;
};

const shuffleMatrixHoldIndexes = (state, original, now) => {
  if (now < state.nextShuffleAt) {
    return;
  }

  const indexes = [...original]
    .map((char, index) => (isStaticChar(char) ? null : index))
    .filter((index) => index !== null);
  const holdCount = Math.max(1, Math.round(indexes.length * matrixHoldRatio));

  state.heldIndexes = new Set(shuffle(indexes).slice(0, holdCount));
  state.nextShuffleAt = now + matrixHoldDuration;
};

const setupLogoLetters = () => {
  if (!logoMatrix) {
    return;
  }

  logoMatrix.textContent = "";

  [...logoText].forEach((char) => {
    const letter = document.createElement("span");
    letter.className = "logo-letter";
    letter.dataset.originalChar = char;
    letter.textContent = char;
    logoMatrix.appendChild(letter);
    logoLetters.push(letter);
  });
};

const randomRange = (min, max) => Math.random() * (max - min) + min;
const randomInteger = (min, max) => Math.floor(randomRange(min, max + 1));

const scatterLogoParticles = () => {
  if (!logoParticles) {
    return;
  }

  const particles = [...logoParticles.querySelectorAll(".logo-particle")];
  const shuffledCells = shuffle(
    particles.map((_, index) => ({
      col: index % particleGrid.cols,
      row: Math.floor(index / particleGrid.cols),
    }))
  );

  particles.forEach((particle, index) => {
    const cell = shuffledCells[index];
    const bgX =
      particleGrid.cols === 1 ? "0%" : `${((cell.col / (particleGrid.cols - 1)) * 100).toFixed(4)}%`;
    const bgY =
      particleGrid.rows === 1 ? "0%" : `${((cell.row / (particleGrid.rows - 1)) * 100).toFixed(4)}%`;

    particle.style.setProperty("--bg-x", bgX);
    particle.style.setProperty("--bg-y", bgY);
    particle.style.setProperty("--scatter-x", `${randomRange(-110, 110).toFixed(1)}px`);
    particle.style.setProperty("--scatter-y", `${randomRange(-64, 64).toFixed(1)}px`);
    particle.style.setProperty("--scatter-z", `${randomRange(-160, 160).toFixed(1)}px`);
    particle.style.setProperty("--scatter-r", `${randomRange(-34, 34).toFixed(1)}deg`);
    particle.style.setProperty("--scatter-scale", randomRange(0.62, 1.28).toFixed(2));
  });
};

const setupLogoParticles = () => {
  if (!logoParticles) {
    return;
  }

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
      particle.dataset.col = String(col);
      particle.dataset.row = String(row);
      particle.dataset.bgX = cols === 1 ? "0%" : `${((col / (cols - 1)) * 100).toFixed(4)}%`;
      particle.dataset.bgY = rows === 1 ? "0%" : `${((row / (rows - 1)) * 100).toFixed(4)}%`;
      particle.style.setProperty("--bg-x", particle.dataset.bgX);
      particle.style.setProperty("--bg-y", particle.dataset.bgY);
      particle.style.setProperty("--tile-x", "0%");
      particle.style.setProperty("--tile-y", "0%");

      logoParticles.appendChild(particle);
    }
  }

  scatterLogoParticles();
};

const restoreLogoTileOrder = () => {
  logoParticles?.querySelectorAll(".logo-particle").forEach((particle) => {
    particle.style.setProperty("--bg-x", particle.dataset.bgX || "0%");
    particle.style.setProperty("--bg-y", particle.dataset.bgY || "0%");
    particle.style.setProperty("--tile-x", "0%");
    particle.style.setProperty("--tile-y", "0%");
  });
};

const shuffleLogoTiles = () => {
  const particles = [...(logoParticles?.querySelectorAll(".logo-particle") || [])];
  const shuffledTiles = shuffle(
    particles.map((particle) => ({
      bgX: particle.dataset.bgX || "0%",
      bgY: particle.dataset.bgY || "0%",
    }))
  );

  particles.forEach((particle, index) => {
    const tile = shuffledTiles[index];

    particle.style.setProperty("--bg-x", tile.bgX);
    particle.style.setProperty("--bg-y", tile.bgY);
    particle.style.setProperty("--tile-x", "0%");
    particle.style.setProperty("--tile-y", "0%");
  });
};

const renderLogoMatrix = (readable = false) => {
  if (!logoLetters.length) {
    return;
  }

  logoWrap?.classList.toggle("is-assembled", readable);
  logoWrap?.classList.toggle("is-charging", readable);
  if (logoChargeTimeout) {
    window.clearTimeout(logoChargeTimeout);
  }
  if (readable) {
    logoChargeTimeout = window.setTimeout(() => {
      logoWrap?.classList.remove("is-charging");
    }, 1350);
  }

  if (!readable) {
    scatterLogoParticles();
  } else {
    restoreLogoTileOrder();
  }

  const shuffledIndexes = shuffle([...logoLetters.keys()]);

  logoLetters.forEach((letter, index) => {
    const originalChar = letter.dataset.originalChar || "";
    const sourceIndex = readable ? index : shuffledIndexes[index];
    const sourceChar = logoText[sourceIndex] || originalChar;
    const x = readable ? 0 : (sourceIndex - index) * 1.25 + (Math.random() - 0.5) * 0.8;
    const y = readable ? 0 : (Math.random() - 0.5) * 1.15;
    const rotation = readable ? 0 : (Math.random() - 0.5) * 18;

    letter.textContent = readable || Math.random() < 0.42 ? sourceChar : randomGlyph();
    letter.classList.toggle("is-shuffled", !readable);
    letter.style.transform = `translate3d(${x}em, ${y}em, 0) rotate(${rotation}deg)`;
  });
};

const renderMatrixNoise = (element) => {
  if (fullReadableMode || readableElements.has(element)) {
    return;
  }

  const original = element.dataset.originalText || element.textContent;
  const state = getMatrixHoldState(element, original);
  const now = Date.now();

  shuffleMatrixHoldIndexes(state, original, now);

  const nextText = [...original]
    .map((char, index) => {
      if (isStaticChar(char)) {
        return char;
      }

      if (state.heldIndexes.has(index) && state.rendered[index]) {
        return state.rendered[index];
      }

      // Leave rare real letters so the phrase ghosts through the noise.
      return Math.random() < 0.16 ? char : randomGlyph();
    })
    .join("");

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

const setAllTextReadable = (isReadable) => {
  fullReadableMode = isReadable;
  logoWrap?.classList.toggle("is-stable", isReadable);
  if (isReadable) {
    renderLogoMatrix(true);
  }

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
  if (logoChaosActive) {
    return;
  }

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

window.setInterval(() => {
  matrixElements.forEach(renderMatrixNoise);
}, prefersReducedMotion ? 360 : 95);

window.setTimeout(runReadableWave, 1200);
window.setInterval(runReadableWave, 6200);
window.setTimeout(runLongReadableMoment, 3200);
window.setInterval(runLongReadableMoment, 9500);

setupLogoLetters();
setupLogoParticles();
renderLogoMatrix(true);

const resetLogoChaosCountdown = () => {
  logoChaosCountdown = randomInteger(5, 10);
};

resetLogoChaosCountdown();

const runLongLogoChaos = () => {
  if (logoChaosActive) {
    return;
  }

  if (logoCycleTimeout) {
    window.clearTimeout(logoCycleTimeout);
  }

  logoLocked = false;
  fullReadableMode = false;
  logoChaosActive = true;
  logoWrap?.classList.remove("is-stable", "is-assembled", "is-charging", "is-assembling");
  restoreLogoTileOrder();
  logoWrap?.classList.add("is-long-chaos");
  shuffleLogoTiles();

  const chaosDuration = randomRange(20000, 30000);
  const jitterInterval = window.setInterval(() => {
    shuffleLogoTiles();
  }, 90);

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

logoWrap?.addEventListener("click", runLongLogoChaos);
logoWrap?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    runLongLogoChaos();
  }
});

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
  const assemblyLeadTime = Math.min(randomRange(10, 300), chaosDuration - 20);
  window.setTimeout(() => {
    if (logoChaosActive) {
      return;
    }

    logoWrap?.classList.add("is-charging");
  }, Math.max(0, chaosDuration - assemblyLeadTime));
  window.setTimeout(() => {
    if (logoChaosActive) {
      return;
    }

    logoWrap?.classList.add("is-assembling");
    renderLogoMatrix(true);
    window.setTimeout(() => {
      logoWrap?.classList.remove("is-assembling");
    }, 320);
    logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
  }, chaosDuration);
};

setupPresaveTitleWave();
logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
