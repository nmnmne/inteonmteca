(() => {
  'use strict';

  const trackId = 'media/Memphis/Матт - Memphis.flac';

  function find(tracks) {
    return tracks.find(track => track.id === trackId || track.audio === trackId);
  }

  // Keep one order for the visible rows, deck transport and listening room.
  // New imports receive a position without moving existing tracks past each other.
  const sequence = [];
  const ranks = new Map();
  const keyOf = track => track.audio || track.id || track.file || track;
  function order(items) {
    const initial = sequence.length === 0;
    const previousSize = sequence.length;
    for (const track of items) {
      const key = keyOf(track);
      if (ranks.has(key)) continue;
      const pos = Math.floor(Math.random() * (sequence.length + 1));
      sequence.splice(pos, 0, key);
      ranks.set(key, pos);
    }
    if (initial && sequence.length > 1) {
      try {
        const storageKey = 'inteonmteca.playlist.first';
        if (localStorage.getItem(storageKey) === sequence[0]) {
          const next = 1 + Math.floor(Math.random() * (sequence.length - 1));
          [sequence[0], sequence[next]] = [sequence[next], sequence[0]];
        }
        localStorage.setItem(storageKey, sequence[0]);
      } catch { /* Shuffling also works when storage is unavailable. */ }
    }
    if (sequence.length !== previousSize) sequence.forEach((key, index) => ranks.set(key, index));
    return items.slice().sort((a,b) => ranks.get(keyOf(a)) - ranks.get(keyOf(b)));
  }

  function watchDay(onChange) {
    let lastDay = new Date().toDateString();
    let timer;
    function check() {
      clearTimeout(timer);
      const now = new Date();
      const today = now.toDateString();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(check, midnight.getTime() - now.getTime() + 20);
      if (today !== lastDay) {
        lastDay = today;
        onChange();
      }
    }
    function suspend() { clearTimeout(timer); }
    function onVisibility() { if (!document.hidden) check(); }
    window.addEventListener('pageshow', check);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);
    check();
    return () => {
      suspend();
      window.removeEventListener('pageshow', check);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  window.CourtyardOpening = Object.freeze({trackId, find, order, watchDay});
})();
