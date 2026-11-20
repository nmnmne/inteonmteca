(() => {
  'use strict';

  const engine = window.DJEngine;
  const library = window.DJStudioLibrary;
  if (!engine || !library) return;
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
        <button type="button" class="compact-next" aria-label="Следующий трек">${icon('next')}</button>
      </div>
      <div class="compact-wave"></div>
      <div class="compact-utilities">
        <img class="compact-brand" src="assets/logo-wordmark.svg" alt="inteonmteca">
        <time data-yard-clock></time>
        <button type="button" class="compact-credit" popovertarget="yard-map-sources" aria-label="Сведения о дворе и источники карты" title="Сведения о дворе">ⓘ</button>
        <button type="button" class="compact-sound" aria-label="Настройки звука" title="Настройки звука">${icon('sound')}</button>
        <button type="button" class="compact-fullscreen"></button>
        <div data-dj-window-tools></div>
      </div>
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
  const sideButtons = [...root.querySelectorAll('[data-compact-side]')];
  const requests = { A: 0, B: 0 };
  let side = 'A', importSide = 'A';
  const active = () => document.body.dataset.yardWindow === 'dj' && document.body.dataset.djMode === 'compact';

  function update() {
    if (!active()) return;
    const state = engine.snapshot()[side];
    const song = state.track?.title || 'Выбрать трек';
    const performer = state.track?.artist || '';
    if (title.textContent !== song) title.textContent = song;
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
    if (picker.matches(':popover-open')) picker.hidePopover();
    returnScope();
    side = id;
    root.dataset.side = id;
    sideButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.compactSide === id)));
    document.querySelector('.controller-tabs [data-panel="' + id.toLowerCase() + '"]').click();
    wave.append(scopes[id]);
    update();
  }
  async function load(id, key) {
    const request = ++requests[id];
    const wasPlaying = engine.snapshot()[id].playing;
    if (!await library.load(id, key) || request !== requests[id]) return;
    const loaded = engine.snapshot()[id];
    if (wasPlaying && !loaded.playing && loaded.track?.id === key) engine.toggle(id);
    update();
  }
  function adjacent(step) {
    const entries = library.list();
    if (!entries.length) return;
    const index = entries.findIndex(t => t.id === engine.snapshot()[side].track?.id);
    const next = index < 0 ? 0 : (index + step + entries.length) % entries.length;
    void load(side, entries[next].id);
  }
  async function importTo(id, files) {
    if (!files.length) return;
    const request = ++requests[id], version = engine.snapshot()[id].loadVersion;
    const first = await library.importFiles(id, files);
    if (first && requests[id] === request && engine.snapshot()[id].loadVersion === version) await load(id, first.id);
  }
  sideButtons.forEach(button => button.onclick = () => activate(button.dataset.compactSide));
  play.onclick = () => { ++requests[side]; engine.toggle(side); };
  find('.compact-previous').onclick = () => adjacent(-1);
  find('.compact-next').onclick = () => adjacent(1);
  find('.compact-sound').onclick = () => library.openSettings();
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
    else void load(side, track);
  };
  window.addEventListener('yard-dj-mode', () => {
    if (active()) activate(library.activeDeck);
    else returnScope();
  });
  window.addEventListener('yard-app-visibility', ({detail}) => {
    if (detail.app !== 'dj') return;
    if (detail.action === 'close') { ++requests.A; ++requests.B; }
    if (detail.visible && active()) activate(library.activeDeck);
  });
  window.addEventListener('dj-load', ({detail}) => {
    if (detail.id === side && picker.matches(':popover-open')) picker.hidePopover();
  });
  window.addEventListener('dj-change', update);
  window.dispatchEvent(new Event('yard-dj-compact-ready'));
})();
