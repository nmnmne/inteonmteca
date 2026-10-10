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
        const desktop = matchMedia('(min-width: 801px), (min-width: 501px) and (max-height: 500px)').matches;
        const override = fill.getPropertyValue('--catalog-bottom-space').trim();
        const bottomSpace = override ? Number(override) : desktop ? Math.min(96, Math.max(32, innerHeight * .07)) : 8;
        const catalogHeight = Math.max(1, Math.floor(shell.clientHeight - bottomSpace));
        // Seven generous tiles; keep five readable rows when vertical space is tight.
        const slots = Math.min(list.children.length, catalogHeight >= 7 * 56 ? 7 : 5);
        const oldRow = first.getBoundingClientRect().height;
        const rowPosition = oldRow ? list.scrollTop / oldRow : 0;
        // Equal fractional rows make each repeated catalogue cycle identical.
        const rowHeight = catalogHeight / Math.max(1, slots);
        shell.style.setProperty('--tile-height', `${rowHeight}px`);
        [...list.children].forEach(item => item.style.removeProperty('--tile-height'));
        shell.style.setProperty('--catalog-height', `${catalogHeight}px`);
        const actualRow = first.getBoundingClientRect().height;
        list.scrollTop = Math.round(rowPosition) * actualRow;
        list.dispatchEvent(new Event('inteon-catalog-fit'));
        return;
      }
      const tile = first?.querySelector('.track-select')?.getBoundingClientRect().height;
      const row = first?.getBoundingClientRect().height;
      if (!row || !shell.clientHeight) return;
      const gap = row - tile;
      const slots = Math.max(1, Math.floor((shell.clientHeight + gap) / row));
      const height = Math.min(Math.max(1, slots - 1), list.children.length) * row - gap;
      shell.style.setProperty('--catalog-height', `${height}px`);
      list.scrollTop = Math.round(list.scrollTop / row) * row;
      list.dispatchEvent(new Event('inteon-catalog-fit'));
    });
  };
  new ResizeObserver(fit).observe(shell);
  new MutationObserver(fit).observe(list, {childList: true});
  fit();

  const music = document.querySelector('#album-player');
  const progress = document.querySelector('#track-progress');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, level = 0, floor = 0;
  const blocked = () => document.hidden || reduced.matches || window.inteonHomeEffects?.ambientBlocked;
  const animate = now => {
    window.inteonHomeEffects?.beat('seek');
    if (!music || music.paused || blocked()) { stop(); return; }
    {
      const elapsed = Math.min(80, last ? now - last : 16.67); last = now;
      const blend = rate => 1 - Math.pow(1 - rate, elapsed / 40);
      const energy = typeof audioEnergy === 'function' ? audioEnergy(now) : {bass: 0};
      const data = typeof activeAudioNode !== 'undefined' && activeAudioNode?.data;
      const bass = data ? (data[0] * .5 + data[1] * .35 + data[2] * .15) / 255 : energy.bass;
      floor += (bass - floor) * blend(.055);
      // Follow bass attacks, not the mastered track's overall loudness.
      const target = Math.min(1, Math.max(0, bass - floor) * 5 + Math.pow(bass, 3) * .22);
      level += (target - level) * blend(target > level ? .7 : .25);
      const value = level.toFixed(3);
      if (progress && progress.style.getPropertyValue('--seek-bass') !== value) progress.style.setProperty('--seek-bass', value);
    }
    frame = requestAnimationFrame(animate);
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; level = 0; floor = 0; progress?.style.setProperty('--seek-bass', '0'); };
  const start = () => { stop(); if (!music?.paused && !blocked()) frame = requestAnimationFrame(animate); };
  window.inteonHomeEffects?.watch('seek', {blocked: () => !music || music.paused || blocked(), restart: start});
  music?.addEventListener('playing', start);
  music?.addEventListener('pause', stop);
  music?.addEventListener('ended', stop);
  document.addEventListener('visibilitychange', start);
  reduced.addEventListener('change', start);
  window.addEventListener('inteon-effects-change', start);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
})();
