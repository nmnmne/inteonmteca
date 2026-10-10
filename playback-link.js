(function () {
  const key = "inteonmteca-playback";
  // Documents own distinct media elements. This is a position/intent handoff,
  // not gapless audio: navigation destroys the old element and autoplay may fail.
  const sessions = new WeakMap();
  const fades = new WeakMap();
  const fadeOut = (audio, fade = {until: Date.now()+40000, volume: audio.volume}) => {
    if (fades.has(audio)) cancelAnimationFrame(fades.get(audio));
    const state = sessions.get(audio);
    if (!state) return;
    state.fade = fade;
    const tick = () => {
      if (sessions.get(audio) !== state) return;
      const remaining = Math.max(0, (fade.until-Date.now())/40000);
      if (state.fadeIn && state.fadeInStarted == null && !audio.paused && !audio.seeking) state.fadeInStarted = Date.now();
      const entry = state.fadeIn ? Math.min(1, Math.max(0, (Date.now() - (state.fadeInStarted ?? Date.now())) / 350)) : 1;
      audio.volume = fade.volume * Math.min(1, remaining) * entry;
      if (remaining > 0) fades.set(audio, requestAnimationFrame(tick));
      else { state.fade = null; state.playingIntent = false; audio.pause(); audio.volume = fade.volume; fades.delete(audio); }
    };
    tick();
  };
  const select = (audio, origin, { stopAtEnd = false } = {}) => {
    if (fades.has(audio)) cancelAnimationFrame(fades.get(audio));
    const previous = sessions.get(audio);
    if (previous?.fade) audio.volume = previous.fade.volume;
    fades.delete(audio);
    sessions.set(audio, { origin, playingIntent: true, stopAtEnd });
  };
  const stopsAtEnd = (audio) => sessions.get(audio)?.stopAtEnd === true;
  const restore = (audio, state) => { sessions.set(audio, {
    origin: state.origin === "yard" ? "yard" : "home",
    playingIntent: state.playingIntent ?? !state.paused,
    stopAtEnd: state.stopAtEnd === true,
    fadeIn: Boolean(state.fade),
  }); if (state.fade) fadeOut(audio, state.fade); };
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
        fade: Number.isFinite(state.fade?.until) && Number.isFinite(state.fade?.volume) ? {until: state.fade.until, volume: Math.max(0,Math.min(1,state.fade.volume))} : null,
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
        fade: sessions.get(audio)?.fade || null,
      }));
    } catch {}
  };

  const clear = () => {
    try { localStorage.removeItem(key); } catch {}
  };

  const forPage = (page) => {
    const state = read();
    if (state && page === "yard" && state.origin !== "yard") {
      const fading = state.fade?.until > Date.now();
      state.playingIntent = Boolean(fading);
      state.paused = !fading;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    }
    return state;
  };
  window.inteonPlayback = { read, save, clear, select, restore, intent, forPage, stopsAtEnd, fadeOut };
})();
