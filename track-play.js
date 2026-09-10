(function () {
  const lock = { at: 0 };

  const allTracks = () => (
    Array.isArray(window.INTEONMTECA_PLAYLIST)
      ? window.INTEONMTECA_PLAYLIST.filter((track) => track && track.audio)
      : []
  );

  const resolveTrack = (item) => {
    if (!item) return null;
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

  const itemFromStack = (clientX, clientY) => {
    const stack = document.elementsFromPoint(clientX, clientY) || [];
    for (let index = 0; index < stack.length; index += 1) {
      const item = stack[index].closest?.(".track-item");
      if (item && !item.classList.contains("track-empty")) return item;
    }
    const nodes = document.querySelectorAll("#track-list .track-item");
    let best = null;
    let bestDist = 1e9;
    for (let index = 0; index < nodes.length; index += 1) {
      const rect = nodes[index].getBoundingClientRect();
      if (rect.height < 2 || rect.width < 2) continue;
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        best = nodes[index];
        bestDist = dist;
      }
    }
    return bestDist < 220 ? best : null;
  };

  const fromEvent = (event) => {
    if (event.button != null && event.button !== 0) return;
    let target = event.target;
    if (target && target.nodeType === 3) target = target.parentElement;
    if (target?.closest?.(".transport, .auth-panel, .chat-panel, .theme-panel, .auth-hint, .chat-hint, .theme-hint, .immersive-back")) return;
    const item = target?.closest?.(".track-item") || itemFromStack(event.clientX, event.clientY);
    if (!item) return;
    const track = resolveTrack(item);
    if (!track) return;
    const now = Date.now();
    if (now - lock.at < 280) return;
    lock.at = now;
    startAudio(track);
    if (typeof window.inteonPlayTrack === "function") window.inteonPlayTrack(track, item, { audioStarted: true });
    else showFallback(track, item);
  };

  window.inteonPick = fromEvent;
  document.addEventListener("click", fromEvent, true);
  document.addEventListener("pointerdown", fromEvent, true);
})();
