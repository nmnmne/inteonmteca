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

const scrambleText = (element) => {
  const original = element.dataset.originalText || element.textContent;

  element.dataset.originalText = original;
  element.classList.add("is-scrambling");

  let frame = 0;
  const maxFrames = 10;
  const interval = window.setInterval(() => {
    element.textContent = [...original]
      .map((char, index) => {
        if (char === " " || char === "." || char === "-") {
          return char;
        }

        const shouldKeep = index / original.length < frame / maxFrames;
        if (shouldKeep) {
          return char;
        }

        return matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
      })
      .join("");

    frame += 1;

    if (frame > maxFrames) {
      window.clearInterval(interval);
      element.textContent = original;
      element.classList.remove("is-scrambling");
    }
  }, 42);
};

const runMatrixPass = () => {
  matrixElements.forEach((element, index) => {
    window.setTimeout(() => scrambleText(element), index * 90);
  });
};

window.setTimeout(runMatrixPass, 900);
window.setInterval(runMatrixPass, 5200);
