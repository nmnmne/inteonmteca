const player = document.getElementById("album-player");
const playButton = document.getElementById("play-random");
const nowPlaying = document.getElementById("now-playing");
const logoMatrix = document.getElementById("logo-matrix");
const logoWrap = document.querySelector(".logo-wrap");
const logoParticles = document.getElementById("logo-particles");
const matrixElements = document.querySelectorAll(".matrix-text");

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

let queue = [];
let currentTrack = "";
let isBlocked = false;

const shuffle = (items) => {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }

  return result;
};

const setNowPlaying = (text) => {
  if (!nowPlaying) {
    return;
  }

  nowPlaying.textContent = text;
  nowPlaying.dataset.originalText = text;
};

const startCurrentTrack = async () => {
  if (!player) {
    return;
  }

  try {
    await player.play();
    isBlocked = false;
    playButton?.classList.add("is-playing");

    playButton?.setAttribute("aria-label", "Следующий трек");
  } catch {
    isBlocked = true;
    playButton?.classList.remove("is-playing");
    playButton?.setAttribute("aria-label", "Включить альбом");

    setNowPlaying("нажми в любое место, чтобы включить звук");
    return;
  }
};

const setNextTrack = () => {
  if (!player) {
    return;
  }

  if (queue.length === 0) {
    queue = shuffle(tracks);
  }

  currentTrack = queue.shift();
  player.src = `${albumPath}${currentTrack.file}`;
  player.load();

  setNowPlaying(`сейчас: ${currentTrack.title}`);
};

const playNext = async () => {
  setNextTrack();
  await startCurrentTrack();
};

const unlockAudio = () => {
  if (isBlocked && currentTrack) {
    startCurrentTrack();
  }
};

if (playButton && player) {
  playButton.addEventListener("click", () => {
    if (isBlocked && currentTrack) {
      startCurrentTrack();
      return;
    }

    playNext();
  });
  player.addEventListener("ended", playNext);
}

window.addEventListener("DOMContentLoaded", () => {
  playNext();
});

window.addEventListener("pointerdown", unlockAudio, { once: false });
window.addEventListener("keydown", unlockAudio, { once: false });

const matrixGlyphs = "01/\\|<>[]{}#$%&*+-=ЖИФНТМ";
const readableElements = new Set();
const logoText = "inteonmteca";
const logoLetters = [];
const particleGrid = { cols: 18, rows: 6 };
let fullReadableMode = false;
let logoLocked = false;
let logoChargeTimeout;
let logoCycleTimeout;

matrixElements.forEach((element) => {
  element.dataset.originalText = element.textContent;
  element.classList.add("is-matrixing");
});

const isStaticChar = (char) => [" ", ".", "-", "—", "/"].includes(char);

const randomGlyph = () =>
  matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];

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
      particle.dataset.bgX = cols === 1 ? "0%" : `${((col / (cols - 1)) * 100).toFixed(4)}%`;
      particle.dataset.bgY = rows === 1 ? "0%" : `${((row / (rows - 1)) * 100).toFixed(4)}%`;
      particle.style.setProperty("--bg-x", particle.dataset.bgX);
      particle.style.setProperty("--bg-y", particle.dataset.bgY);

      logoParticles.appendChild(particle);
    }
  }

  scatterLogoParticles();
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
    logoParticles?.querySelectorAll(".logo-particle").forEach((particle) => {
      particle.style.setProperty("--bg-x", particle.dataset.bgX || "0%");
      particle.style.setProperty("--bg-y", particle.dataset.bgY || "0%");
    });
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

  element.textContent = [...original]
    .map((char) => {
      if (isStaticChar(char)) {
        return char;
      }

      // Leave rare real letters so the phrase ghosts through the noise.
      return Math.random() < 0.16 ? char : randomGlyph();
    })
    .join("");
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
}, 95);

window.setTimeout(runReadableWave, 1200);
window.setInterval(runReadableWave, 6200);
window.setTimeout(runLongReadableMoment, 3200);
window.setInterval(runLongReadableMoment, 9500);

setupLogoLetters();
setupLogoParticles();
renderLogoMatrix(true);

const runLogoCycle = () => {
  if (fullReadableMode || logoLocked) {
    renderLogoMatrix(true);
    logoCycleTimeout = window.setTimeout(runLogoCycle, 1200);
    return;
  }

  renderLogoMatrix(false);
  const chaosDuration = randomRange(2000, 16000);
  const assemblyLeadTime = Math.min(randomRange(10, 300), chaosDuration - 20);
  window.setTimeout(() => {
    logoWrap?.classList.add("is-charging");
  }, Math.max(0, chaosDuration - assemblyLeadTime));
  window.setTimeout(() => {
    logoWrap?.classList.add("is-assembling");
    renderLogoMatrix(true);
    window.setTimeout(() => {
      logoWrap?.classList.remove("is-assembling");
    }, 320);
    logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
  }, chaosDuration);
};

logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
