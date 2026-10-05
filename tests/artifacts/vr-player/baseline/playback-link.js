(function () {
  const key = "inteonmteca-playback";
  // Documents own distinct media elements. This is a position/intent handoff,
  // not gapless audio: navigation destroys the old element and autoplay may fail.
  const sessions = new WeakMap();
  const select = (audio, origin, { stopAtEnd = false } = {}) => sessions.set(audio, { origin, playingIntent: true, stopAtEnd });
  const stopsAtEnd = (audio) => sessions.get(audio)?.stopAtEnd === true;
  const restore = (audio, state) => sessions.set(audio, {
    origin: state.origin === "yard" ? "yard" : "home",
    playingIntent: state.playingIntent ?? !state.paused,
    stopAtEnd: state.stopAtEnd === true,
  });
  const intent = (audio, playingIntent) => {
    const state = sessions.get(audio);
    if (state) state.playingIntent = playingIntent;
  };

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
        origin: state.origin === "yard" ? "yard" : "home",
        playingIntent: typeof state.playingIntent === "boolean" ? state.playingIntent : state.paused === false,
        stopAtEnd: state.stopAtEnd === true,
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
        origin: sessions.get(audio)?.origin || "home",
        playingIntent: sessions.get(audio)?.playingIntent ?? !audio.paused,
        stopAtEnd: stopsAtEnd(audio),
      }));
    } catch {}
  };

  const clear = () => {
    try { localStorage.removeItem(key); } catch {}
  };

  const forPage = (page) => {
    const state = read();
    if (state && page === "yard" && state.origin !== "yard") {
      state.playingIntent = false;
      state.paused = true;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    }
    return state;
  };
  window.inteonPlayback = { read, save, clear, select, restore, intent, forPage, stopsAtEnd };
})();
