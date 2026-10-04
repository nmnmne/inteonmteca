/** One audio element. Approach never starts playback. */

const rootUrl = (relative) => new URL(relative, new URL("../", document.baseURI)).href;

const formatTime = (value) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export function createWallPlayer(root) {
  const audio = root.querySelector("#album-player");
  const list = root.querySelector("#yard-tracks");
  const status = root.querySelector("#yard-status");
  const title = root.querySelector("#yard-now");
  const playButton = root.querySelector("#yard-play");
  const panel = root.querySelector("#player-panel");
  let tracks = [];
  let currentIndex = -1;
  let open = false;

  const setStatus = (text, state) => {
    status.textContent = text;
    status.dataset.state = state;
    panel.dataset.state = state;
  };

  const paintCurrent = () => {
    [...list.children].forEach((item) => {
      const active = Number(item.dataset.index) === currentIndex;
      item.classList.toggle("is-current", active);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
    title.textContent = currentIndex >= 0 ? tracks[currentIndex].title : "";
    playButton.textContent = audio.paused ? "▶" : "Ⅱ";
    playButton.setAttribute("aria-label", audio.paused ? "Воспроизвести" : "Пауза");
  };

  const playIndex = (index) => {
    const track = tracks[index];
    if (!track?.audio || !audio) {
      setStatus("в списке нет аудио", "error");
      return;
    }
    currentIndex = index;
    const src = rootUrl(String(track.audio).replace(/\\/g, "/"));
    if (audio.src !== src) audio.src = src;
    setStatus("сигнал буферизуется…", "loading");
    paintCurrent();
    const started = audio.play();
    if (started && typeof started.catch === "function") {
      started.catch(() => setStatus("нажми ▶ ещё раз", "error"));
    }
  };

  const render = (nextTracks) => {
    tracks = nextTracks.filter((track) => track && track.audio);
    list.replaceChildren();
    tracks.forEach((track, index) => {
      const item = document.createElement("li");
      item.className = "yard-track";
      item.dataset.index = String(index);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "yard-track-button";
      button.innerHTML = `<span class="yard-track-title"></span><span class="yard-track-artist"></span>`;
      button.querySelector(".yard-track-title").textContent = track.title || "трек";
      button.querySelector(".yard-track-artist").textContent = track.artist || "";
      button.addEventListener("click", () => playIndex(index));
      item.append(button);
      list.append(item);
    });
    if (!tracks.length) setStatus("список треков пуст", "error");
    else setStatus("", "idle");
  };

  const load = async () => {
    if (location.protocol === "http:" || location.protocol === "https:") {
      try {
        const response = await fetch(rootUrl("playlist.json"), { cache: "no-store" });
        if (!response.ok) throw new Error(`playlist ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data) && data.length) {
          render(data);
          return;
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "не удалось прочитать playlist.json", "error");
      }
    }
    const bundled = Array.isArray(window.INTEONMTECA_PLAYLIST) ? window.INTEONMTECA_PLAYLIST : [];
    render(bundled);
  };

  audio.addEventListener("playing", () => {
    setStatus("", "playing");
    paintCurrent();
  });
  audio.addEventListener("pause", () => {
    if (currentIndex < 0) return;
    setStatus("", "paused");
    paintCurrent();
  });
  audio.addEventListener("waiting", () => setStatus("сигнал буферизуется…", "loading"));
  audio.addEventListener("error", () => setStatus("не удалось открыть аудиофайл", "error"));
  audio.addEventListener("ended", () => {
    if (tracks.length > 1) playIndex((currentIndex + 1) % tracks.length);
  });
  audio.addEventListener("timeupdate", () => {
    const clock = root.querySelector("#yard-clock");
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    clock.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
  });
  playButton.addEventListener("click", () => {
    if (currentIndex < 0) return;
    if (audio.paused) {
      const started = audio.play();
      if (started && typeof started.catch === "function") {
        started.catch(() => setStatus("нажми ▶ ещё раз", "error"));
      }
    } else {
      audio.pause();
    }
  });
  root.querySelector("#yard-next").addEventListener("click", () => {
    if (tracks.length) playIndex((Math.max(currentIndex, 0) + 1) % tracks.length);
  });
  root.querySelector("#yard-prev").addEventListener("click", () => {
    if (tracks.length) playIndex((Math.max(currentIndex, 0) - 1 + tracks.length) % tracks.length);
  });

  return {
    load,
    isOpen: () => open,
    playing: () => !audio.paused && currentIndex >= 0,
    setOpen(next) {
      open = next;
      panel.hidden = !next;
      panel.setAttribute("aria-hidden", String(!next));
      if (next) {
        const current = list.querySelector(".is-current .yard-track-button") || list.querySelector(".yard-track-button");
        current?.focus();
      }
    },
  };
}
