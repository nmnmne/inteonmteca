(() => {
  const list = document.querySelector('.track-list');
  const shell = document.querySelector('.playlist-shell');
  if (!list || !shell) return;
  let fitFrame = 0;
  const fit = () => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      const first = list.querySelector('.track-item');
      const fill = getComputedStyle(shell);
      if (fill.getPropertyValue('--catalog-fill').trim() === '1' && first && shell.clientHeight) {
        const minimum = Number(fill.getPropertyValue('--catalog-row-min')) || 66;
        const slots = Math.max(1, Math.floor(shell.clientHeight / minimum));
        // Repeat an integer-pixel pattern: any complete group fills the viewport exactly.
        const rowHeight = Math.floor(shell.clientHeight / slots);
        const extra = shell.clientHeight - rowHeight * slots;
        shell.style.setProperty('--tile-height', `${rowHeight}px`);
        [...list.children].forEach((item, index) => item.style.setProperty('--tile-height', `${rowHeight + (index % slots < extra ? 1 : 0)}px`));
        shell.style.setProperty('--catalog-height', `${shell.clientHeight}px`);
        const top = list.getBoundingClientRect().top, scroll = list.scrollTop;
        const offsets = [...list.children].map(item => item.getBoundingClientRect().top - top + scroll);
        list.scrollTop = offsets.reduce((nearest, offset) => Math.abs(offset-scroll)<Math.abs(nearest-scroll)?offset:nearest, 0);
        return;
      }
      const tile = first?.querySelector('.track-select')?.getBoundingClientRect().height;
      const row = first?.getBoundingClientRect().height;
      if (!row || !shell.clientHeight) return;
      const gap = row - tile;
      const slots = Math.max(1, Math.floor((shell.clientHeight + gap) / row));
      const height = Math.min(slots, list.children.length) * row - gap;
      shell.style.setProperty('--catalog-height', `${height}px`);
      list.scrollTop = Math.round(list.scrollTop / row) * row;
    });
  };
  new ResizeObserver(fit).observe(shell);
  new MutationObserver(fit).observe(list, {childList: true});
  fit();

  const music = document.querySelector('#album-player');
  const progress = document.querySelector('#track-progress');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, level = 0, floor = 0;
  const animate = now => {
    if (!music || music.paused || document.hidden || reduced.matches) { stop(); return; }
    if (now - last >= 40) {
      last = now;
      const energy = typeof audioEnergy === 'function' ? audioEnergy(now) : {bass: 0};
      const data = typeof activeAudioNode !== 'undefined' && activeAudioNode?.data;
      const bass = data ? (data[0] * .5 + data[1] * .35 + data[2] * .15) / 255 : energy.bass;
      floor += (bass - floor) * .055;
      // Follow bass attacks, not the mastered track's overall loudness.
      const target = Math.min(1, Math.max(0, bass - floor) * 5 + Math.pow(bass, 3) * .22);
      level += (target - level) * (target > level ? .7 : .25);
      progress?.style.setProperty('--seek-bass', level.toFixed(3));
    }
    frame = requestAnimationFrame(animate);
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; level = 0; floor = 0; progress?.style.setProperty('--seek-bass', '0'); };
  const start = () => { stop(); if (!music?.paused && !document.hidden && !reduced.matches) frame = requestAnimationFrame(animate); };
  music?.addEventListener('playing', start);
  music?.addEventListener('pause', stop);
  music?.addEventListener('ended', stop);
  document.addEventListener('visibilitychange', start);
  reduced.addEventListener('change', start);
})();
