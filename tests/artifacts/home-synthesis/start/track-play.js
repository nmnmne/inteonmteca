(function () {
  const lock = { at: 0 };

  const allTracks = () => (
    Array.isArray(window.INTEONMTECA_PLAYLIST)
      ? window.INTEONMTECA_PLAYLIST.filter((track) => track && track.audio)
      : []
  );

  const resolveTrack = (item) => {
    if (!item) return null;
    // The catalogue is shuffled; its indexes are not embedded playlist indexes.
    const resolved = window.inteonTrackForItem?.(item);
    if (resolved) return resolved;
    const title = (item.getAttribute("data-track-title") || item.querySelector(".track-title")?.textContent || "").trim();
    const index = Number(item.getAttribute("data-track-index"));
    const tracks = allTracks();
    if (Number.isInteger(index) && tracks[index]) return tracks[index];
    return tracks.find((track) => track.title === title)
      || tracks.find((track) => title && String(track.title || "").includes(title))
      || tracks.find((track) => title && title.includes(String(track.title || "")))
      || null;
  };

  const mediaUrl = (track) => {
    const raw = String(track.audio || "").replace(/\\/g, "/");
    try {
      return new URL(raw, document.baseURI).href;
    } catch {
      return encodeURI(raw);
    }
  };

  const startAudio = (track) => {
    const player = document.getElementById("album-player");
    if (!player || !track) return false;
    const src = mediaUrl(track);
    const assigned = player.getAttribute("src") || player.src || "";
    if (assigned !== src && player.src !== src) player.src = src;
    const start = player.play();
    if (start && typeof start.catch === "function") start.catch(() => {});
    return true;
  };

  const showFallback = (track, item) => {
    if (item) {
      item.classList.add("is-kept", "is-playing");
      item.style.opacity = "1";
    }
    document.body.classList.add("is-immersive", "is-track-diving");
    const mode = document.getElementById("immersive-mode");
    if (mode) {
      mode.classList.add("is-active");
      mode.setAttribute("aria-hidden", "false");
    }
    const nowPlaying = document.getElementById("now-playing-title");
    const immersiveTitle = document.getElementById("immersive-title");
    if (nowPlaying) nowPlaying.textContent = track.title || "";
    if (immersiveTitle) immersiveTitle.textContent = track.title || "";
  };

  const fromEvent = (event) => {
    // A touch/pen pointerdown may become a scroll gesture, not a tap.
    if (event.type === "pointerdown" && event.pointerType !== "mouse") return;
    if (event.button != null && event.button !== 0) return;
    let target = event.target;
    if (target && target.nodeType === 3) target = target.parentElement;
    if (target?.closest?.("a, input, select, textarea, .active-player, .transport, .auth-panel, .chat-panel, .theme-panel, .auth-hint, .chat-hint, .theme-hint, .immersive-back")) return;
    // Only an actual track hit may select music; nearby navigation/blank space
    // must not fall through to a row underneath or within a 220px radius.
    const item = target?.closest?.(".track-item");
    if (!item) return;
    const track = resolveTrack(item);
    if (!track) return;
    const now = Date.now();
    if (now - lock.at < 280) return;
    lock.at = now;
    if (typeof window.inteonPlayTrack === "function") window.inteonPlayTrack(track, item);
    else {
      const audio = document.getElementById("album-player");
      if (audio) window.inteonPlayback?.select?.(audio, "home");
      startAudio(track);
      showFallback(track, item);
    }
  };

  window.inteonPick = fromEvent;
  document.addEventListener("click", fromEvent, true);
  document.addEventListener("pointerdown", fromEvent, true);
})();
