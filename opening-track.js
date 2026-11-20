(() => {
  'use strict';

  const trackId = 'media/Memphis/Матт - Memphis.flac';

  function find(tracks) {
    return tracks.find(track => track.id === trackId || track.audio === trackId);
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

  window.CourtyardOpening = Object.freeze({trackId, find, watchDay});
})();
