/** Separate document audio: position/intent handoff, not uninterrupted playback. */

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
  let boundaryRetry = null;
  let pendingBoundary = null;
  let selection = 0;
  let leaving = false;
  const boundaryDayKey = 'inteon-boundary-track-day';
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  let playedDay = '';
  const playedToday = () => { try { return (localStorage.getItem(boundaryDayKey) || playedDay) === localDay(); } catch { return playedDay === localDay(); } };
  const markBoundaryPlayed = () => { playedDay = localDay(); try { localStorage.setItem(boundaryDayKey, playedDay); } catch {} };

  const hideBoundaryRetry = () => { if (boundaryRetry) boundaryRetry.hidden = true; };
  const offerBoundaryRetry = () => {
    if (!boundaryRetry) {
      boundaryRetry = document.createElement("button");
      boundaryRetry.id = "yard-boundary-play";
      boundaryRetry.type = "button";
      boundaryRetry.textContent = "▶ Слушать God Is Dead";
      boundaryRetry.setAttribute("style", "position:fixed;bottom:calc(100px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:100;padding:12px 18px;max-width:90vw;background:#101914;color:#fff;border:1px solid #8aa795;border-radius:4px;cursor:pointer");
      boundaryRetry.addEventListener("click", () => {
        if (!audio.paused && !audio.ended) { hideBoundaryRetry(); return; }
        toggle();
      });
      document.body.appendChild(boundaryRetry);
    }
    boundaryRetry.textContent = `▶ Слушать ${tracks[currentIndex]?.title || "трек"}`;
    boundaryRetry.hidden = false;
  };

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
    if (leaving || !track || !window.inteonPlayback || pendingSeek) return;
    const next = `${pathOf(track)}|${audio.paused}|${audio.currentTime || 0}`;
    if (next === stamp) return;
    stamp = next;
    window.inteonPlayback.save(audio, track);
  };

  const playIndex = (index, { paused = false, time = 0, boundary = false, shared = null } = {}) => {
    const track = tracks[index];
    if (!track?.audio || !audio) return;
    const request = ++selection;
    pendingBoundary = boundary ? { request, visit: window.inteonStreet?.boundaryVisit?.(), src: rootUrl(pathOf(track)) } : null;
    hideBoundaryRetry();
    if (pendingSeek) {
      audio.removeEventListener("loadedmetadata", pendingSeek);
      audio.removeEventListener("seeked", pendingSeek);
    }
    currentIndex = index;
    if (shared) window.inteonPlayback?.restore?.(audio, shared);
    else window.inteonPlayback?.select?.(audio, "yard", { stopAtEnd: boundary });
    stamp = "";
    const src = rootUrl(pathOf(track));
    const startPlayback = () => {
      if (request !== selection || paused || (shared?.fade && shared.fade.until <= Date.now())) return;
      const failed = (error) => {
        paint();
        if (request === selection && audio.paused && error?.name === "NotAllowedError") offerBoundaryRetry();
      };
      try {
        const started = audio.play();
        if (started && typeof started.catch === "function") started.catch(failed);
      } catch (error) { failed(error); }
    };
    let seekRequested = false;
    const resumeAfterSeek = Boolean(shared && time > 0 && !paused);
    const place = () => {
      // A late event must neither seek a newer selection nor finish its restore.
      if (pendingSeek !== place || currentIndex !== index || audio.src !== src
          || audio.currentSrc !== src || audio.readyState < 1) return;
      if (!seekRequested && Number.isFinite(time) && time > 0) {
        seekRequested = true;
        if (resumeAfterSeek) audio.addEventListener("seeked", place);
        audio.currentTime = time;
      }
      if (resumeAfterSeek && audio.seeking) return;
      audio.removeEventListener("loadedmetadata", place);
      audio.removeEventListener("seeked", place);
      pendingSeek = null;
      remember();
      if (resumeAfterSeek) startPlayback();
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
    if (!resumeAfterSeek) startPlayback();
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
    if (audio.paused && !window.inteonPlayback?.read?.()?.playingIntent) window.inteonPlayback?.select?.(audio, "yard", { stopAtEnd: window.inteonPlayback?.stopsAtEnd?.(audio) });
    window.inteonPlayback?.intent?.(audio, audio.paused);
    stamp = "";
    if (audio.paused) {
      const started = audio.play();
      if (started && typeof started.catch === "function") started.catch(() => paint());
    } else {
      audio.pause();
      remember();
    }
  };

  const render = (nextTracks) => {
    tracks = nextTracks.filter((track) => track && track.audio);
    const saved = window.inteonPlayback?.forPage?.("yard") || window.inteonPlayback?.read?.();
    const savedIndex = saved ? tracks.findIndex((track) => pathOf(track) === saved.audio) : -1;
    if (savedIndex >= 0) playIndex(savedIndex, { paused: !(saved.playingIntent ?? !saved.paused), time: saved.time, shared: saved });
    else paint();
  };

  const load = async () => {
    // Prerender has no playback permission and can overwrite the live handoff.
    // Read the final position/fade only once the user actually enters the yard.
    if (document.prerendering) {
      await new Promise(resolve => document.addEventListener("prerenderingchange", resolve, {once: true}));
    }
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

  audio?.addEventListener("playing", () => {
    // A rejected play() is not a switch. Keep this token for the retry gesture,
    // discard on any different selection or departure, consume only on playback.
    const pending = pendingBoundary;
    if (!leaving && pending && pending.request === selection && !audio.paused && !audio.ended && audio.src === pending.src) {
      markBoundaryPlayed();
      pendingBoundary = null;
      window.inteonStreet?.boundaryPlaybackSucceeded?.(pending.visit);
    }
    hideBoundaryRetry(); paint(); remember();
  });
  audio?.addEventListener("pause", () => { paint(); remember(); });
  audio?.addEventListener("timeupdate", remember);
  audio?.addEventListener("ended", () => {
    if (!window.inteonPlayback?.stopsAtEnd?.(audio)) { step(1); return; }
    window.inteonPlayback.intent(audio, false);
    audio.pause();
    stamp = "";
    paint(); remember();
  });
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
  window.addEventListener("pagehide", () => { remember(); leaving = true; pendingBoundary = null; });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    audio.pause();
    leaving = false;
    if (window.inteonPlayback?.read?.()) render(tracks);
    else { currentIndex = -1; hideBoundaryRetry(); paint(); }
  });

  return {
    load,
    playBoundaryTrack() {
      // Check the media element itself, not UI or persisted playback state.
      if (!audio || playedToday()) return;
      const index = tracks.findIndex((track) => pathOf(track) === "media/God Is Dead/Матт - God Is Dead.flac");
      if (index < 0 || (!audio.paused && !audio.ended && audio.src === rootUrl(pathOf(tracks[index])))) return;
      playIndex(index, { boundary: true });
    },
    isOpen: () => open,
    playing: () => Boolean(audio && !audio.paused && currentIndex >= 0),
    setOpen(next) {
      open = next;
    },
  };
}
