(() => {
  'use strict';

  const engine = window.DJEngine;
  const library = window.DJStudioLibrary;
  if (!engine || !library || !window.DJCompactMix) return;
  const sides = ['A', 'B'];
  const scopes = Object.fromEntries(sides.map(id => [id, document.querySelector('#deck-' + id.toLowerCase() + ' .dd-scope')]));
  const browsers = Object.fromEntries(sides.map(id => [id, document.querySelector('#deck-' + id.toLowerCase() + ' .dd-browser')]));
  if (sides.some(id => !scopes[id])) return;
  const positions = Object.fromEntries(sides.map(id => {
    const mark = document.createComment('Deck ' + id + ' waveform');
    scopes[id].before(mark);
    return [id, mark];
  }));
  const icons = {
    sound: '<path d="M3 10h4l5-4v12l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    play: '<path fill="currentColor" stroke="none" d="M6 4.5 20 12 6 19.5z"/>',
    pause: '<path fill="currentColor" stroke="none" d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
    next: '<path d="m6 5 10 7-10 7zm12 0v14"/>',
    previous: '<path d="m18 5-10 7 10 7zM6 5v14"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    fullscreen: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
    exitFullscreen: '<path d="M4 8h4V4m8 0v4h4M4 16h4v4m8 0v-4h4"/>'
  };
  function icon(name) {
    return '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + icons[name] + '</svg>';
  }
  const root = document.createElement('section');
  root.id = 'yard-dj-compact';
  root.className = 'yard-dj-compact';
  root.setAttribute('aria-label', 'Компактный DJ-пульт');
  root.hidden = true;
  root.innerHTML = `
    <div class="compact-display" data-resident-obstacle>
      <div class="compact-decks" role="group" aria-label="Активная дека">
        <button type="button" data-compact-side="A" aria-label="Дека A">A</button>
        <button type="button" data-compact-side="B" aria-label="Дека B">B</button>
      </div>
      <button type="button" class="compact-track" id="compact-track-select" popovertarget="compact-picker">
        <span class="compact-song" aria-hidden="true"></span><span class="compact-artist" aria-hidden="true"></span>${icon('down')}
      </button>
      <div class="compact-transport">
        <button type="button" class="compact-previous" aria-label="Предыдущий трек">${icon('previous')}</button>
        <button type="button" class="compact-play" aria-label="Воспроизвести">${icon('play')}</button>
        <button type="button" class="compact-auto" aria-label="Автовоспроизведение" title="Сводить со случайным треком перед окончанием" aria-pressed="false">Авто</button>
        <button type="button" class="compact-next" aria-label="Следующий трек">${icon('next')}</button>
      </div>
      <div class="compact-wave"><div class="compact-mix-status" role="status" aria-live="polite"></div></div>
      <div class="compact-utilities">
        <img class="compact-brand" src="assets/logo-wordmark.svg" alt="inteonmteca">
        <time data-yard-clock></time>
        <button type="button" class="compact-credit" popovertarget="yard-map-sources" aria-label="Сведения о дворе и источники карты" title="Сведения о дворе">ⓘ</button>
        <button type="button" class="compact-sound" aria-label="Настройки звука" title="Настройки звука">${icon('sound')}</button>
        <button type="button" class="compact-fullscreen"></button>
        <div data-dj-window-tools></div>
      </div>
      <button type="button" class="compact-recall" aria-label="Развернуть плеер"><span></span>${icon('down')}</button>
      <input class="compact-import" type="file" accept="audio/*,.flac,.wav,.mp3,.m4a,.ogg,.wv" multiple hidden>
    </div>
    <div id="compact-picker" popover data-resident-obstacle aria-label="Плейлист активной деки">
      <div class="compact-picker-head"><strong></strong><button type="button" class="compact-add">Импорт</button>
        <button type="button" popovertarget="compact-picker" popovertargetaction="hide" aria-label="Закрыть плейлист">×</button>
      </div><div class="compact-library"></div>
    </div>`;
  document.body.append(root);
  const find = selector => root.querySelector(selector);
  const display = find('.compact-display'), wave = find('.compact-wave');
  const select = find('.compact-track'), title = find('.compact-song'), artist = find('.compact-artist');
  const picker = find('#compact-picker'), librarySlot = find('.compact-library');
  const play = find('.compact-play'), fileInput = find('.compact-import');
  const auto = find('.compact-auto');
  const mixStatus = find('.compact-mix-status');
  const sideButtons = [...root.querySelectorAll('[data-compact-side]')];
  const requests = { A: 0, B: 0 };
  const pausedSkips = new Map();
  let skipTarget = null;
  let side = 'A', importSide = 'A';
  const active = () => document.body.dataset.yardWindow === 'dj' && document.body.dataset.djMode === 'compact';

  const ultraAfter = 10_000, hiddenAfter = ultraAfter + 20_000;
  const recall = find('.compact-recall'), recallTitle = recall.querySelector('span');
  const settings = document.getElementById('dialog');
  let lastActivity = 0, idleTimer = 0, openPanel = null, heldPointer = null;

  function drawIdle() {
    clearTimeout(idleTimer);
    if (!active() || document.hidden) return;
    const held = openPanel || heldPointer !== null;
    const elapsed = held ? 0 : performance.now() - lastActivity;
    const ultra = elapsed >= ultraAfter, invisible = elapsed >= hiddenAfter;
    root.toggleAttribute('data-ultra', ultra);
    root.toggleAttribute('data-faded', invisible);
    display.toggleAttribute('data-resident-obstacle', !ultra);
    recall.toggleAttribute('data-resident-obstacle', ultra && !invisible);
    if (!held && !invisible) idleTimer = setTimeout(drawIdle, (ultra ? hiddenAfter : ultraAfter) - elapsed);
  }
  function wakeDisplay() {
    lastActivity = performance.now();
    drawIdle();
  }
  function holdFor(panel, opened) {
    if (opened && active()) openPanel = panel;
    else if (openPanel === panel) openPanel = null;
    else return;
    wakeDisplay();
  }
  root.addEventListener('pointerdown', event => {
    if (root.hasAttribute('data-ultra')) {
      // Keep the wake button under the pointer until the matching click.
      event.preventDefault();
      return;
    }
    heldPointer = event.pointerId;
    wakeDisplay();
  }, true);
  function releasePointer(event) {
    if (heldPointer !== event.pointerId) return;
    heldPointer = null;
    wakeDisplay();
  }
  window.addEventListener('pointerup', releasePointer, true);
  window.addEventListener('pointercancel', releasePointer, true);
  root.addEventListener('click', event => {
    if (root.hasAttribute('data-ultra') || event.target.closest('.compact-recall')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    wakeDisplay();
  }, true);
  root.addEventListener('focusin', event => {
    wakeDisplay();
    if (event.target === recall) select.focus({preventScroll:true});
  });
  for (const type of ['keydown', 'drop']) root.addEventListener(type, wakeDisplay, true);
  for (const type of ['pointermove', 'wheel']) root.addEventListener(type, () => {
    if (!root.hasAttribute('data-ultra')) wakeDisplay();
  }, {passive:true});
  for (const panel of [picker, document.getElementById('yard-map-sources')]) {
    panel?.addEventListener('toggle', () => holdFor(panel, panel.matches(':popover-open')));
  }
  settings?.addEventListener('close', () => holdFor(settings, false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) heldPointer = null;
    drawIdle();
  });

  const mix = window.DJCompactMix.create(engine, library, {
    onDeckChange: activate,
    onStatus(text) { mixStatus.textContent = text; }
  });

  function update() {
    if (!active()) return;
    const state = engine.snapshot()[side];
    const song = state.track?.title || 'Выбрать трек';
    const performer = state.track?.artist || '';
    if (title.textContent !== song) {
      title.textContent = song;
      recallTitle.textContent = state.track?.title || 'Плеер';
    }
    if (artist.textContent !== performer) artist.textContent = performer;
    select.setAttribute('aria-label', 'Выбрать трек для деки ' + side + '. ' + song);
    play.disabled = !state.track;
    const action = (state.playing ? 'Приостановить деку ' : 'Воспроизвести деку ') + side;
    if (play.getAttribute('aria-label') !== action) {
      play.setAttribute('aria-label', action);
      play.title = action;
      play.innerHTML = icon(state.playing ? 'pause' : 'play');
    }
  }
  function returnScope() {
    for (const id of sides) if (scopes[id].parentNode === wave) positions[id].after(scopes[id]);
  }
  function activate(id) {
    skipTarget = null;
    if (picker.matches(':popover-open')) picker.hidePopover();
    returnScope();
    side = id;
    auto.setAttribute('aria-pressed', String(mix.isAuto(id)));
    root.dataset.side = id;
    sideButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.compactSide === id)));
    document.querySelector('.controller-tabs [data-panel="' + id.toLowerCase() + '"]').click();
    wave.append(scopes[id]);
    update();
  }
  function choose(id, key) {
    skipTarget = null;
    ++requests[id];
    if (picker.matches(':popover-open')) picker.hidePopover();
    return mix.choose(id, key);
  }
  async function adjacent(step) {
    const id = side;
    const entries = library.list(id);
    if (!entries.length) return;
    const previous = skipTarget;
    const interrupted = mix.manual(id);
    const state = engine.snapshot()[id];
    const cursor = previous?.id === id && (previous.loading || interrupted) ? previous.key : state.track?.id;
    const index = entries.findIndex(t => t.id === cursor);
    const next = index < 0 ? (step > 0 ? 0 : entries.length - 1) : (index + step + entries.length) % entries.length;
    const key = entries[next].id, request = ++requests[id];
    skipTarget = null;
    if (state.playing && key === state.track?.id) return;
    const target = skipTarget = {id, key, loading: true};
    const isCurrent = () => request === requests[id];
    if (!state.playing) pausedSkips.set(id, request);
    try {
      const loaded = state.playing ? await mix.choose(id, key) : await library.load(id, key, isCurrent);
      target.loading = false;
      if (skipTarget === target && (!state.playing || !loaded)) skipTarget = null;
      if (loaded && isCurrent()) update();
    } finally {
      if (pausedSkips.get(id) === request) pausedSkips.delete(id);
    }
  }
  function importTo(id, files) {
    if (!files.length) return;
    return choose(id, async () => (await library.importFiles(id, files))?.id);
  }
  function toggle(id) {
    skipTarget = null;
    ++requests[id];
    const wasPlaying = engine.snapshot()[id].playing;
    if (mix.manual(id) && wasPlaying) {
      const state = engine.snapshot();
      for (const deck of sides) if (state[deck].playing) engine.toggle(deck);
    } else engine.toggle(id);
  }
  function stopMix() {
    skipTarget = null;
    for (const id of sides) {
      ++requests[id];
      mix.setAuto(id, false);
    }
    mix.cancel();
  }
  library.setCompactControls({ choose, toggle });
  sideButtons.forEach(button => button.onclick = () => activate(button.dataset.compactSide));
  auto.onclick = () => {
    mix.setAuto(side, !mix.isAuto(side));
    auto.setAttribute('aria-pressed', String(mix.isAuto(side)));
  };
  window.addEventListener('dj-ended', ({detail: {id, loadVersion}}) => {
    if (document.body.dataset.djMode === 'compact' && !pausedSkips.has(id)) void mix.ended(id, loadVersion);
  });
  play.onclick = () => toggle(side);
  wave.addEventListener('pointerdown', event => {
    if (event.button === 0 && event.target.matches('canvas.dd-wave')) mix.manual(side);
  }, true);
  wave.addEventListener('keydown', event => {
    if (event.target.matches('canvas.dd-wave') &&
        ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) mix.manual(side);
  }, true);
  find('.compact-previous').onclick = () => adjacent(-1);
  find('.compact-next').onclick = () => adjacent(1);
  find('.compact-sound').onclick = () => {
    library.openSettings();
    if (settings?.open) holdFor(settings, true);
  };
  const fullscreen = find('.compact-fullscreen');
  function updateFullscreen() {
    const expanded = Boolean(document.fullscreenElement);
    const label = expanded ? 'Выйти' : document.fullscreenEnabled ? 'На весь экран' : 'Весь двор';
    fullscreen.innerHTML = icon(expanded ? 'exitFullscreen' : 'fullscreen') + '<span>' + label + '</span>';
    fullscreen.title = expanded ? 'Выйти из полноэкранного режима' : document.fullscreenEnabled
      ? 'Развернуть сайт на весь экран' : 'Развернуть двор на всю область браузера';
    fullscreen.setAttribute('aria-label', fullscreen.title);
    if (document.fullscreenEnabled) fullscreen.setAttribute('aria-pressed', String(expanded));
  }
  fullscreen.onclick = () => {
    if (document.fullscreenEnabled || document.fullscreenElement) void library.toggleFullscreen();
    else find('[data-window-action=minimize]').click();
  };
  document.addEventListener('fullscreenchange', updateFullscreen);
  updateFullscreen();
  picker.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') {
      librarySlot.append(browsers[side]);
      find('.compact-picker-head strong').textContent = 'Треки · Дека ' + side;
      picker.style.setProperty('--dock-offset', (innerHeight - display.getBoundingClientRect().top + 5) + 'px');
    } else {
      positions[side].parentNode.append(browsers[side]);
    }
  });
  picker.addEventListener('toggle', () => {
    if (picker.matches(':popover-open')) {
      const list = librarySlot.querySelector('[role=listbox]');
      list.focus({preventScroll: true});
      library.revealSelection(side);
    }
  });
  find('.compact-add').onclick = () => {
    importSide = side;
    fileInput.click();
  };
  fileInput.onchange = () => { void importTo(importSide, [...fileInput.files]); fileInput.value = ''; };
  display.ondragover = picker.ondragover = event => {
    if (!Array.from(event.dataTransfer.types).some(type => ['Files','application/x-inteon-track'].includes(type))) return;
    if (!display.dataset.dragging) wakeDisplay();
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    display.dataset.dragging = 'true';
  };
  display.ondragleave = picker.ondragleave = event => {
    if (!event.currentTarget.contains(event.relatedTarget)) delete display.dataset.dragging;
  };
  display.ondrop = picker.ondrop = event => {
    delete display.dataset.dragging;
    const files = [...event.dataTransfer.files], track = event.dataTransfer.getData('application/x-inteon-track');
    if (!files.length && !track) return;
    event.preventDefault();
    if (files.length) void importTo(side, files);
    else void choose(side, track);
  };
  window.addEventListener('yard-dj-mode', () => {
    wakeDisplay();
    if (active()) activate(library.activeDeck);
    else {
      stopMix();
      returnScope();
    }
  });
  window.addEventListener('yard-app-visibility', ({detail}) => {
    if (detail.app !== 'dj') return;
    wakeDisplay();
    if (detail.action === 'close') stopMix();
    if (detail.visible && active()) activate(library.activeDeck);
  });
  window.addEventListener('dj-load', ({detail}) => {
    if (detail.id === side && picker.matches(':popover-open')) picker.hidePopover();
  });
  window.addEventListener('dj-change', update);
  window.dispatchEvent(new Event('yard-dj-compact-ready'));
})();
