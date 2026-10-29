(function () {
  // Use the same transport as the page so remote controls preserve playback intent.
  window.inteonMediaSession = {
    bind({ audio, getTrack, play, pause, previous, next, onSeek = () => {} }) {
      const session = navigator.mediaSession;
      if (!session || !audio) return { sync() {} };
      let metadataKey = null;
      let enabled = null;
      const seek = (time, fast = false) => {
        if (!getTrack() || !Number.isFinite(time) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const position = Math.max(0, Math.min(time, audio.duration));
        if (fast && typeof audio.fastSeek === "function") audio.fastSeek(position);
        else audio.currentTime = position;
        onSeek();
        sync();
      };
      const handlers = {
        play: () => { if (getTrack() && (audio.paused || audio.ended)) play(); },
        pause: () => { if (getTrack()) pause(); },
        previoustrack: () => { if (getTrack()) previous(); },
        nexttrack: () => { if (getTrack()) next(); },
        seekbackward: (details) => seek(audio.currentTime - (details.seekOffset ?? 10)),
        seekforward: (details) => seek(audio.currentTime + (details.seekOffset ?? 10)),
        seekto: (details) => seek(details.seekTime, details.fastSeek),
        stop: () => { if (getTrack()) { pause(); seek(0); } },
      };
      const sync = () => {
        const track = getTrack();
        const selected = Boolean(track);
        if (enabled !== selected) {
          for (const [action, handler] of Object.entries(handlers)) {
            // Some browsers implement only a subset of the actions.
            try { session.setActionHandler(action, selected ? handler : null); } catch {}
          }
          enabled = selected;
        }
        const key = track ? JSON.stringify([track.audio || track.file, track.title, track.artist, track.album]) : "";
        if (metadataKey !== key) {
          try {
            session.metadata = track && typeof window.MediaMetadata === "function"
              ? new window.MediaMetadata({
                title: track.title || "Трек",
                artist: track.artist || "",
                album: track.album || "",
                artwork: [],
              })
              : null;
            metadataKey = key;
          } catch {}
        }
        try {
          session.playbackState = !selected ? "none"
            : audio.paused || audio.ended || audio.error ? "paused" : "playing";
        } catch {}
        if (typeof session.setPositionState === "function") {
          try {
            if (selected && Number.isFinite(audio.duration) && audio.duration > 0
                && Number.isFinite(audio.currentTime) && audio.playbackRate > 0) {
              session.setPositionState({
                duration: audio.duration,
                position: Math.max(0, Math.min(audio.currentTime, audio.duration)),
                playbackRate: audio.playbackRate,
              });
            } else session.setPositionState();
          } catch {}
        }
      };
      for (const event of ["play", "playing", "pause", "ended", "error", "emptied",
        "loadedmetadata", "durationchange", "timeupdate", "seeked", "ratechange"]) {
        audio.addEventListener(event, sync);
      }
      window.addEventListener("pageshow", sync);
      sync();
      return { sync };
    },
  };
})();
