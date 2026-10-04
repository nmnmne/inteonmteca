(function () {
  const key = "inteonmteca-playback";

  const read = () => {
    try {
      const state = JSON.parse(localStorage.getItem(key) || "");
      const audio = String(state?.audio || "").replace(/\\/g, "/");
      if (!audio) return null;
      const time = Number(state.time);
      return {
        audio,
        title: String(state.title || ""),
        artist: String(state.artist || ""),
        time: Number.isFinite(time) && time > 0 ? time : 0,
        paused: state.paused !== false,
      };
    } catch {
      return null;
    }
  };

  const save = (audio, track) => {
    const path = String(track?.audio || track?.file || "").replace(/\\/g, "/");
    if (!audio || !path) return;
    const time = Number(audio.currentTime);
    try {
      localStorage.setItem(key, JSON.stringify({
        audio: path,
        title: track.title || "",
        artist: track.artist || "",
        time: Number.isFinite(time) && time > 0 ? time : 0,
        paused: Boolean(audio.paused),
      }));
    } catch {}
  };

  const clear = () => {
    try { localStorage.removeItem(key); } catch {}
  };

  window.inteonPlayback = { read, save, clear };
})();
