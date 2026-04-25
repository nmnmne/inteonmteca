const player = document.getElementById("album-player");
const playButton = document.getElementById("play-random");
const nowPlaying = document.getElementById("now-playing");
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

matrixElements.forEach((element) => {
  element.dataset.originalText = element.textContent;
  element.classList.add("is-matrixing");
});

const isStaticChar = (char) => [" ", ".", "-", "—", "/"].includes(char);

const randomGlyph = () =>
  matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];

const renderMatrixNoise = (element) => {
  if (readableElements.has(element)) {
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

window.setInterval(() => {
  matrixElements.forEach(renderMatrixNoise);
}, 95);

window.setTimeout(runReadableWave, 1200);
window.setInterval(runReadableWave, 6200);
