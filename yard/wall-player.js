/** One audio element, shared with the home page. Approach never starts playback. */

const rootUrl = (relative) => new URL(relative, new URL("../", document.baseURI)).href;

const pathOf = (track) => String(track?.audio || track?.file || "").replace(/\\/g, "/");

export function createWallPlayer(root) {
  const audio = root.querySelector("#album-player");
  const title = root.querySelector("#yard-now");
  const playButton = root.querySelector("#yard-play");
  let tracks = [];
  let currentIndex = -1;
  let open = false;
  let stamp = "";
  let pendingSeek = null;

  const paint = () => {
    const track = tracks[currentIndex];
    if (title) {
      title.textContent = track ? `${track.title || "трек"}${track.artist ? ` — ${track.artist}` : ""}` : "";
    }
    if (!playButton) return;
    playButton.textContent = audio.paused ? "▶" : "Ⅱ";
    playButton.setAttribute("aria-label", audio.paused ? "Воспроизвести" : "Пауза");
  };

  const remember = () => {
    const track = tracks[currentIndex];
    if (!track || !window.inteonPlayback || pendingSeek) return;
    const next = `${pathOf(track)}|${audio.paused}|${Math.floor(audio.currentTime || 0)}`;
    if (next === stamp) return;
    stamp = next;
    window.inteonPlayback.save(audio, track);
  };

  const playIndex = (index, { paused = false, time = 0 } = {}) => {
    const track = tracks[index];
    if (!track?.audio || !audio) return;
    if (pendingSeek) audio.removeEventListener("loadedmetadata", pendingSeek);
    currentIndex = index;
    const src = rootUrl(pathOf(track));
    const place = () => {
      // A late event must neither seek a newer selection nor finish its restore.
      if (pendingSeek !== place || currentIndex !== index || audio.src !== src
          || audio.currentSrc !== src || audio.readyState < 1) return;
      if (Number.isFinite(time) && time > 0) audio.currentTime = time;
      audio.removeEventListener("loadedmetadata", place);
      pendingSeek = null;
      remember();
    };
    // Suppress saves before src/load can emit reset-time or pause events.
    pendingSeek = place;
    audio.preload = "metadata";
    const changedSource = audio.src !== src;
    if (changedSource) audio.src = src;
    audio.addEventListener("loadedmetadata", place);
    if (changedSource || audio.readyState < 1) audio.load();
    else place();
    paint();
    if (paused) {
      audio.pause();
      remember();
      return;
    }
    const started = audio.play();
    if (started && typeof started.catch === "function") started.catch(() => paint());
  };

  const step = (offset) => {
    if (!tracks.length) return;
    const start = currentIndex >= 0 ? currentIndex : 0;
    playIndex((start + offset + tracks.length) % tracks.length);
  };

  const toggle = () => {
    if (currentIndex < 0) {
      if (tracks.length) playIndex(0);
      return;
    }
    if (audio.paused) {
      const started = audio.play();
      if (started && typeof started.catch === "function") started.catch(() => paint());
    } else {
      audio.pause();
    }
  };

  const render = (nextTracks) => {
    tracks = nextTracks.filter((track) => track && track.audio);
    const saved = window.inteonPlayback?.read?.();
    const savedIndex = saved ? tracks.findIndex((track) => pathOf(track) === saved.audio) : -1;
    if (savedIndex >= 0) playIndex(savedIndex, { paused: saved.paused, time: saved.time });
    else paint();
  };

  const load = async () => {
    if (location.protocol === "http:" || location.protocol === "https:") {
      try {
        const response = await fetch(rootUrl("playlist.json"), { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length) {
            render(data);
            return;
          }
        }
      } catch {}
    }
    const bundled = Array.isArray(window.INTEONMTECA_PLAYLIST) ? window.INTEONMTECA_PLAYLIST : [];
    render(bundled);
  };

  audio?.addEventListener("playing", () => { paint(); remember(); });
  audio?.addEventListener("pause", () => { paint(); remember(); });
  audio?.addEventListener("timeupdate", remember);
  audio?.addEventListener("ended", () => step(1));
  playButton?.addEventListener("click", toggle);
  root.querySelector("#yard-next")?.addEventListener("click", () => step(1));
  root.querySelector("#yard-prev")?.addEventListener("click", () => step(-1));
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.code === "Space") {
      event.preventDefault();
      toggle();
    } else if (event.code === "BracketLeft") {
      step(-1);
    } else if (event.code === "BracketRight") {
      step(1);
    }
  });
  root.querySelector(".home-link")?.addEventListener("click", remember);
  window.addEventListener("pagehide", remember);

  return {
    load,
    isOpen: () => open,
    playing: () => Boolean(audio && !audio.paused && currentIndex >= 0),
    setOpen(next) {
      open = next;
    },
  };
}
