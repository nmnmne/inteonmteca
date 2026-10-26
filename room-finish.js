(() => {
  const list = document.querySelector('.track-list');
  const shell = document.querySelector('.playlist-shell');
  if (!list || !shell) return;
  let fitFrame = 0;
  const fit = () => {
    if (fitFrame) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      const first = list.querySelector('.track-item');
      const fill = getComputedStyle(shell);
      if (fill.getPropertyValue('--catalog-fill').trim() === '1' && first && shell.clientHeight) {
        const desktop = matchMedia('(min-width: 801px), (min-width: 501px) and (max-height: 500px)').matches;
        const override = fill.getPropertyValue('--catalog-bottom-space').trim();
        const bottomSpace = override ? Number(override) : desktop ? Math.min(96, Math.max(32, innerHeight * .07)) : 8;
        const catalogHeight = Math.max(1, Math.floor(shell.clientHeight - bottomSpace));
        // Explicit desktop/mobile stages keep their row count. Compact windows
        // fit as many rows as needed without stretching tiles when height drops.
        const requestedSlots = Number(fill.getPropertyValue('--catalog-slots'));
        const slots = Math.min(list.children.length, requestedSlots || Math.max(1, Math.ceil(catalogHeight / 48)));
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
  // Slot changes need not resize the shell. The layout owner explicitly asks
  // for a refit after committing its geometry; all requests share one frame.
  shell.addEventListener('inteon-catalog-refit', fit);
  window.addEventListener('resize', fit);
  document.fonts?.ready.then(fit);
  new ResizeObserver(fit).observe(shell);
  new MutationObserver(fit).observe(list, {childList: true});
  fit();
  const volume = document.querySelector('#track-volume');
  const rail = document.querySelector('.volume-rail');
  const music = document.querySelector('#album-player');
  const syncVolumeRail = () => {
    const value = music ? (music.muted ? 0 : music.volume) : Number(volume?.value ?? .8);
    rail?.style.setProperty('--seek', `${Math.max(0, Math.min(1, value)) * 100}%`);
  };
  volume?.addEventListener('input', syncVolumeRail);
  music?.addEventListener('volumechange', syncVolumeRail);
  syncVolumeRail();

})();
