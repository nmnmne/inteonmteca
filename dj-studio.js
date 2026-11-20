(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const engine = window.DJEngine;
  const icons = {
    decks:
      '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7.5" cy="12" r="2.4"/><circle cx="16.5" cy="12" r="2.4"/><path d="M11.8 8v8"/>',
    library: '<path d="M4 4v16m4-15v15m3-15 3 15m2-14 4 13"/>',
    door: '<path d="M4 21h16M6 20V4l10-1v17M16 5h3v15M12 12h.2"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5.5 9h.4m3.6 0h.4m3.6 0h.4m3.6 0h.4M5.5 12h.4m3.6 0h.4m3.6 0h.4m3.6 0h.4M8 15h8"/>',
    settings:
      '<path d="m9.5 3-.6 2.2-2 .9-2.1-.7-2 3.4 1.7 1.5-.1 2.8-1.5 1.4 2 3.5 2.1-.6 2 .9.6 2.1h4l.6-2.1 2-.9 2.1.6 2-3.5-1.5-1.4-.1-2.8 1.7-1.5-2-3.4-2.1.7-2-.9-.6-2.2z"/><circle cx="11.5" cy="11.8" r="3"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    sliders:
      '<path d="M5 3v8m0 5v5M12 3v3m0 5v10m7-18v10m0 5v3"/><path d="M2 12h6v3H2zm7-5h6v3H9zm7 7h6v3h-6z"/>',
    volume: '<path d="M3 9h4l5-4v14l-5-4H3zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    crossfade: '<path d="M2 6h3c5 0 9 12 14 12h3M2 18h3c2.5 0 4-2 5.5-4M14 9c1.5-2 3-3 5-3h3"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    star: '<path d="m12 3 2.7 5.9 6.4.8-4.7 4.6 1.2 6.4-5.6-3.1-5.6 3.1 1.2-6.4L3 9.7l6.3-.8z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    discs:
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M6.5 11A6 6 0 0 1 11 6.5M17.5 13a6 6 0 0 1-4.5 4.5"/>',
    phones:
      '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5V12l3.6 2"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 14h10l1-14M10 10v6m4-6v6"/>',
  };
  const icon = (name, size = 17) =>
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="' +
    size +
    '" height="' +
    size +
    '" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    icons[name] +
    '</svg>';
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const fmt = (s) =>
    Number.isFinite(s) && s >= 0
      ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
      : '—';
  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem('dj.studio.' + key)) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem('dj.studio.' + key, JSON.stringify(value));
    } catch {}
  }
  $$('[data-i]').forEach((el) => (el.innerHTML = icon(el.dataset.i)));
  const favorites = new Set(read('favorites', []));
  const gridEdits = read('grids', {});
  const covers = new Map([
    ['media/Deadsouls/Матт - Deadsouls.flac', 'Матт - Deadsouls.webp'],
    ['media/N01Dentity/Матт - N01Dentity.flac', 'Матт - N01Dentity.webp'],
  ]);
  const tracks = (window.INTEONMTECA_PLAYLIST || []).map((t) => ({
    ...t,
    ...window.DJ_ANALYSIS?.[t.audio],
    ...gridEdits[t.id],
    src: window.DJ_LOUDNESS?.[t.audio]?.src || t.audio,
    masterInfo: window.DJ_LOUDNESS?.[t.audio],
    spatialInfo: window.DJ_SPATIAL_TRACKS?.[t.audio],
    cover: covers.has(t.audio) ? 'assets/dj-sleeves/' + covers.get(t.audio) : null,
  }));
  const channels = ['A', 'B'];
  const loadRequests = { A: 0, B: 0 };
  const retiredURLs = new Set();
  const mixerDisplays = [];
  const deckBrowsers = [];
  const knobSpecs = [
    { name: 'low', label: 'LOW', min: -24, max: 12, unit: 'dB', desc: 'Низкие частоты' },
    { name: 'mid', label: 'MID', min: -24, max: 12, unit: 'dB', desc: 'Средние частоты' },
    { name: 'high', label: 'HIGH', min: -24, max: 12, unit: 'dB', desc: 'Высокие частоты' },
    {
      name: 'filter',
      label: 'FILTER',
      min: -100,
      max: 100,
      unit: '%',
      desc: 'Фильтр. Влево — ФНЧ, вправо — ФВЧ',
    },
    { name: 'echo', label: 'ECHO', min: 0, max: 100, unit: '%', desc: 'Посыл на эхо' },
  ];
  let crate = 'all',
    sortKey = '',
    sortDir = 1,
    tableStamp,
    toastTimer,
    paintTimer,
    lastRecording = false;
  const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
  function notice(msg) {
    const el = $('#notice');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3600);
  }
  function inCrate(track, choice) {
    return (choice !== 'starred' || favorites.has(track.id)) && (choice !== 'imports' || track.imported);
  }
  function visibleTracks() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    const rows = tracks.filter(
      (t) =>
        inCrate(t, crate) &&
        (!query || (t.title + ' ' + t.artist).toLocaleLowerCase().includes(query)),
    );
    if (sortKey)
      rows.sort((a, b) => {
        const av = a[sortKey],
          bv = b[sortKey];
        if (av == null || bv == null) return Number(av == null) - Number(bv == null);
        return (
          sortDir *
          (typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : collator.compare(String(av), String(bv)))
        );
      });
    return rows;
  }
  function drawTable(s = engine.snapshot()) {
    const rows = visibleTracks();
    deckBrowsers.forEach(refresh => refresh(s));
    const count = {
      all: tracks.length,
      starred: tracks.filter((t) => favorites.has(t.id)).length,
      imports: tracks.filter((t) => t.imported).length,
    };
    $('#track-count').textContent = String(rows.length);
    $$('[data-crate]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.crate === crate));
      btn.querySelector('.crate-total').textContent = count[btn.dataset.crate];
    });
    $$('[data-sort]').forEach((b) =>
      b.parentElement.setAttribute(
        'aria-sort',
        b.dataset.sort === sortKey ? (sortDir === 1 ? 'ascending' : 'descending') : 'none',
      ),
    );
    const focus = document.activeElement;
    const focusRow = focus?.closest('#track-list tr');
    const focusData = focusRow ? { index: focusRow.dataset.index, action: focus.dataset.action } : null;
    $('#track-list').innerHTML = rows
      .map((t, n) => {
        const idx = tracks.indexOf(t),
          a = t.id === s.A.track?.id,
          b = t.id === s.B.track?.id;
        const badge = (id) => '<span class="on-deck ' + id.toLowerCase() + '-color">' + id + '</span>';
        const load = (id) =>
          '<button class="load-key tone-' +
          id.toLowerCase() +
          ((id === 'A' ? a : b) ? ' active' : '') +
          '" style="--ch:var(--' +
          id.toLowerCase() +
          ')" data-action="' +
          id +
          '" title="Загрузить в деку ' +
          id +
          '" aria-label="' +
          esc(t.title) +
          ' — загрузить в деку ' +
          id +
          '">' +
          id +
          '</button>';
        const art = t.cover
          ? '<img class="thumb" loading="lazy" alt="" src="' + esc(t.cover) + '">'
          : '<span class="vinyl-thumb" aria-hidden="true"></span>';
        const removeButton = t.imported
          ? '<button class="remove-track" data-action="remove" aria-label="Удалить из фонотеки — ' +
            esc(t.title) +
            '" title="Удалить из фонотеки">' +
            icon('trash', 13) +
            '</button>'
          : '';
        return (
          '<tr draggable="true" data-index="' +
          idx +
          '" class="' +
          (a ? 'loaded-a' : b ? 'loaded-b' : '') +
          '"><td class="index-cell">' +
          (a || b ? (a ? badge('A') : '') + (b ? badge('B') : '') : String(n + 1).padStart(2, '0')) +
          '</td><td><div class="track-name">' +
          art +
          '<strong title="' +
          esc(t.title) +
          '">' +
          esc(t.title) +
          '</strong>' +
          removeButton +
          '</div></td><td class="artist-cell">' +
          esc(t.artist || '—') +
          '</td><td class="numeric">' +
          (t.bpm ? Number(t.bpm.toFixed(1)) : '—') +
          '</td><td class="numeric key-cell">' +
          esc(t.key || '—') +
          '</td><td class="numeric">' +
          fmt(t.duration) +
          '</td><td class="load-cell">' +
          load('A') +
          load('B') +
          '</td><td class="fav-cell"><button class="fav-button" data-action="star" aria-pressed="' +
          favorites.has(t.id) +
          '" aria-label="Избранное — ' +
          esc(t.title) +
          '">' +
          icon('star', 14) +
          '</button></td></tr>'
        );
      })
      .join('');
    if (focusData)
      $(
        '#track-list tr[data-index="' + focusData.index + '"] [data-action="' + focusData.action + '"]',
      )?.focus({ preventScroll: true });
    const empty = $('#empty-state');
    empty.hidden = rows.length > 0;
    empty.textContent = $('#search').value.trim()
      ? 'По этому запросу треков нет.'
      : crate === 'starred'
        ? 'Отметьте трек звёздочкой, чтобы добавить его сюда.'
        : crate === 'imports'
          ? 'Импортируйте аудиофайл с устройства.'
          : 'Фонотека пуста.';
    tableStamp = channels.map((id) => s[id].track?.id).join('|');
  }
  async function loadDeck(id, track) {
    if (!track) return false;
    const request = ++loadRequests[id];
    if (track.imported && !track.src) {
      const version = engine.snapshot()[id].loadVersion;
      await window.DJStorage.hydrate(track);
      if (request !== loadRequests[id] || version !== engine.snapshot()[id].loadVersion || !tracks.includes(track)) return false;
      if (!track.src) {
        notice('Аудиофайл недоступен. Импортируйте его снова.');
        return false;
      }
    }
    engine.load(id, track);
    const state = engine.snapshot();
    if (state[id].track !== track) return false;
    for (const url of retiredURLs) {
      if (channels.every((side) => state[side].track?.src !== url)) {
        URL.revokeObjectURL(url);
        retiredURLs.delete(url);
      }
    }
    let level = '';
    if (track.imported) {
      const measured = track.normalization;
      if (measured?.mode === 'adaptive') level = ' · автовыравнивание при воспроизведении';
      else if (Number.isFinite(measured?.integrated))
        level = ' · ' + ((measured.playbackIntegrated ?? measured.integrated) + measured.gainDb).toFixed(1) + ' LUFS';
    }
    notice(track.title + ' · Дека ' + id + level);
    return true;
  }
  function mountDeckBrowser(root, id) {
    const find = selector => root.querySelector(selector);
    const panel = find('.dd-browser'), toggle = find('.dd-browse-toggle');
    const list = find('.dd-browse-list'), count = find('.dd-browse-count'), filter = find('.dd-browse-filter');
    const up = find('.dd-browse-up'), down = find('.dd-browse-down'), load = find('.dd-browse-load');
    let rows = [], selected = -1, viewVersion = 0;

    function select(index) {
      list.children[selected]?.setAttribute('aria-selected', 'false');
      selected = Math.min(rows.length - 1, Math.max(0, index));
      const option = list.children[selected];
      up.disabled = selected <= 0;
      down.disabled = selected >= rows.length - 1;
      load.disabled = !option;
      count.textContent = (selected + 1) + ' / ' + rows.length;
      if (!option) {
        list.removeAttribute('aria-activedescendant');
        return;
      }
      option.setAttribute('aria-selected', 'true');
      list.setAttribute('aria-activedescendant', option.id);
      const bounds = list.getBoundingClientRect(), row = option.getBoundingClientRect();
      if (row.top < bounds.top) list.scrollTop += row.top - bounds.top;
      else if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
    }

    function refresh(snapshot) {
      if (panel.hidden) return;
      const loaded = snapshot[id].track?.id;
      const wanted = rows[selected]?.id ?? loaded;
      rows = tracks.filter(track => inCrate(track, filter.value));
      list.innerHTML = rows.map((track, index) => {
        const current = track.id === loaded;
        const bpm = Number(track.bpm);
        return `<div role="option" class="dd-browse-row" id="dd-option-${id}-${index}" data-index="${index}" aria-selected="false"${current ? ' aria-current="true"' : ''}>
          <span class="dd-browse-copy"><strong class="dd-browse-title">${esc(track.title)}</strong><small class="dd-browse-artist">${esc(track.artist)}</small></span>
          <span class="dd-browse-bpm">${bpm > 0 ? Number(bpm.toFixed(1)) + ' BPM' : '—'}</span>
          ${current ? '<span class="dd-browse-loaded" aria-label="Загружен в деку ' + id + '">' + id + '</span>' : ''}
        </div>`;
      }).join('');
      find('.dd-browse-empty').hidden = rows.length > 0;
      const wantedIndex = rows.findIndex(track => track.id === wanted);
      select(wantedIndex >= 0 ? wantedIndex : selected);
    }

    function show(open) {
      viewVersion++;
      panel.hidden = !open;
      find('.dd-track').hidden = open;
      find('.dd-scope').hidden = open;
      root.classList.toggle('dd-browsing', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', (open ? 'Вернуться к экрану деки ' : 'Выбрать трек для деки ') + id);
      toggle.querySelector('span').textContent = open ? 'Назад' : 'Треки';
      if (open) {
        rows = [];
        selected = -1;
        refresh(engine.snapshot());
        list.focus({preventScroll: true});
      }
    }

    function close(focusToggle = true) {
      show(false);
      if (focusToggle) toggle.focus({preventScroll: true});
    }

    async function loadSelected() {
      const track = rows[selected], version = viewVersion;
      if (!track) return;
      const ok = await loadDeck(id, track);
      if (ok && version === viewVersion && rows[selected] === track)
        close(panel.contains(document.activeElement));
    }

    toggle.hidden = false;
    toggle.onclick = () => panel.hidden ? show(true) : close();
    filter.onchange = () => {
      selected = -1;
      refresh(engine.snapshot());
    };
    up.onclick = () => select(selected - 1);
    down.onclick = () => select(selected + 1);
    load.onclick = loadSelected;
    list.onclick = event => {
      const row = event.target.closest('[role="option"]');
      if (row) {
        select(Number(row.dataset.index));
        list.focus({preventScroll: true});
      }
    };
    panel.onkeydown = event => {
      if (event.target === filter || event.ctrlKey || event.metaKey || event.altKey) return;
      switch (event.key) {
        case 'ArrowUp': select(selected - 1); break;
        case 'ArrowDown': select(selected + 1); break;
        case 'Home': select(0); break;
        case 'End': select(rows.length - 1); break;
        case 'Escape': close(); break;
        case 'Enter':
          if (event.target !== list) return;
          if (!event.repeat) void loadSelected();
          break;
        default: return;
      }
      event.preventDefault();
    };
    deckBrowsers.push(refresh);
  }
  function confirmRemoval(track) {
    openDialog(
      'Удалить трек из фонотеки?',
      '<p class="hint">' +
        esc(track.title) +
        '</p><div class="dialog-actions"><button class="action-button" id="remove-cancel">Отмена</button><button class="action-button" id="remove-confirm">Удалить</button></div>',
    );
    $('#remove-cancel').onclick = () => $('#dialog').close();
    $('#remove-confirm').onclick = async (e) => {
      e.currentTarget.disabled = true;
      if (track.stored && !(await window.DJStorage.remove(track.id))) {
        notice('Не удалось удалить сохранённый трек.');
        $('#dialog').close();
        return;
      }
      const index = tracks.indexOf(track);
      if (index >= 0) tracks.splice(index, 1);
      if (track.src) {
        const state = engine.snapshot();
        if (channels.some((side) => state[side].track?.src === track.src)) retiredURLs.add(track.src);
        else URL.revokeObjectURL(track.src);
      }
      drawTable();
      $('#dialog').close();
    };
  }
  function useView() {
    const library = location.hash === '#library';
    document.body.classList.toggle('library-only', library);
    $('#performance').hidden = library;
    $$('[data-view]').forEach((a) => {
      if (a.dataset.view === (library ? 'library' : 'studio')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    schedulePaint();
  }
  function mountChannel(id) {
    const panel = $('#channel-' + id.toLowerCase());
    panel.innerHTML =
      '<div class="strip-head"><span class="strip-tag">CHANNEL ' +
      id +
      '</span><button class="monitor-btn" aria-label="Предпрослушивание ' +
      id +
      '" title="Предпрослушивание ' +
      id +
      ' в наушниках" aria-pressed="false">' +
      icon('phones', 14) +
      '</button></div><div class="dial-bank"></div>';
    const bank = panel.querySelector('.dial-bank');
    knobSpecs.forEach((spec) => {
      const label = document.createElement('label');
      label.className = 'dial-control';
      label.dataset.knob = spec.name;
      label.innerHTML =
        '<span class="dial-face"><span class="dial-marker"></span><input type="range" min="' +
        spec.min +
        '" max="' +
        spec.max +
        '" value="0" step="1" aria-label="' +
        spec.desc +
        ' — канал ' +
        id +
        '"></span><span class="dial-name">' +
        spec.label +
        '</span>';
      bank.append(label);
      const face = label.firstElementChild,
        input = face.querySelector('input');
      const update = () => {
        const v = Number(input.value);
        const frac =
          spec.min < 0
            ? v < 0
              ? 0.5 + (0.5 * v) / Math.abs(spec.min)
              : 0.5 + (0.5 * v) / spec.max
            : v / spec.max;
        face.style.setProperty('--angle', frac * 280 - 140 + 'deg');
        face.style.setProperty('--fill-arc', frac * 280 + 'deg');
        face.title = spec.desc + ' · ' + v + ' ' + spec.unit;
        input.setAttribute('aria-valuetext', v + ' ' + spec.unit);
      };
      const apply = () => {
        const v = Number(input.value);
        update();
        if (spec.name === 'filter') engine.setFilter(id, v / 100);
        else if (spec.name === 'echo') engine.setEcho(id, v / 100);
        else engine.setEQ(id, spec.name, v);
      };
      mixerDisplays.push((state) => {
        const value = spec.name in state[id].eq ? state[id].eq[spec.name] : state[id][spec.name] * 100;
        if (Math.round(value) !== Number(input.value)) {
          input.value = String(Math.round(value));
          update();
          if (document.activeElement === input) feedback();
        }
      });
      input.addEventListener('input', apply);
      let drag;
      window.addEventListener('dj-load', ({ detail }) => {
        if (detail.id !== id || !drag) return;
        if (input.hasPointerCapture(drag.pointer)) input.releasePointerCapture(drag.pointer);
        drag = null;
      });
      input.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        input.focus({ preventScroll: true });
        input.setPointerCapture(e.pointerId);
        drag = { y: e.clientY, x: e.clientX, start: Number(input.value), pointer: e.pointerId };
      });
      input.addEventListener('pointermove', (e) => {
        if (!drag || drag.pointer !== e.pointerId) return;
        input.value = String(
          Math.round(
            drag.start +
              ((drag.y - e.clientY + (e.clientX - drag.x) * 0.5) * (spec.max - spec.min)) /
                (e.shiftKey ? 380 : 95),
          ),
        );
        apply();
      });
      input.addEventListener('lostpointercapture', () => (drag = null));
      input.addEventListener('dblclick', () => {
        input.value = '0';
        apply();
      });
      const caption = label.querySelector('.dial-name');
      const feedback = () => {
        caption.textContent = input.value + spec.unit;
      };
      input.addEventListener('focus', feedback);
      input.addEventListener('input', feedback);
      input.addEventListener('pointermove', () => {
        if (drag) feedback();
      });
      input.addEventListener('blur', () => {
        caption.textContent = spec.label;
      });
      update();
    });
    const level = document.createElement('label');
    level.className = 'gain-control';
    level.innerHTML =
      '<span class="gain-fader"><span class="channel-meter" aria-hidden="true"><b></b></span><input class="gain-input" type="range" min="0" max="100" value="80" aria-label="Громкость канала ' +
      id +
      '"></span><span class="vol-label">LEVEL</span>';
    bank.append(level);
    const input = level.querySelector('input');
    const meter = level.querySelector('.channel-meter b');
    input.title = 'Громкость канала ' + id + ' · 80%';
    input.addEventListener('input', () => {
      input.title = 'Громкость канала ' + id + ' · ' + input.value + '%';
      engine.setChannel(id, Number(input.value) / 100);
    });
    mixerDisplays.push((state) => {
      const db = 20 * Math.log10(Math.max(0.00001, state[id].level));
      meter.style.height = Math.max(0, Math.min(100, (db + 48) * 100 / 48)) + '%';
      const value = String(Math.round(state[id].channel * 100));
      if (input.value !== value) {
        input.value = value;
        input.title = 'Громкость канала ' + id + ' · ' + value + '%';
      }
    });
    panel.querySelector('.monitor-btn').addEventListener('click', () => {
      const s = engine.snapshot();
      if (!s.monitorDevice) {
        openSettings();
        return;
      }
      engine.setMonitor(id, !s[id].monitor);
    });
  }
  function schedulePaint() {
    if (!paintTimer && !document.hidden) paintTimer = requestAnimationFrame(render);
  }
  function render() {
    paintTimer = 0;
    const s = engine.snapshot();
    mixerDisplays.forEach((update) => update(s));
    if (!$('#performance').hidden) channels.forEach((id) => window.DJDecks.render(id, s[id]));
    if (channels.map((id) => s[id].track?.id).join('|') !== tableStamp) drawTable(s);
    channels.forEach((id) =>
      $('#channel-' + id.toLowerCase() + ' .monitor-btn').setAttribute('aria-pressed', String(s[id].monitor)),
    );
    let max = 0;
    for (const side of ['left', 'right']) {
      const peak = s.meters[side];
      max = Math.max(max, peak);
      const db = 20 * Math.log10(Math.max(0.000001, peak));
      const n = Math.max(0, Math.min(24, Math.round(((db + 54) * 24) / 54)));
      document
        .querySelectorAll('#' + side + '-meter b')
        .forEach((led, i) => led.classList.toggle('lit', i < n));
    }
    $('#master-db').textContent = max > 0.002 ? (20 * Math.log10(max)).toFixed(1) + ' dB' : '−∞ dB';
    $('#cross').value = String(Math.round(s.cross * 100));
    $('#mobile-cross').value = $('#cross').value;
    $('#curve-cross').setAttribute('aria-pressed', String(s.sharpCross));
    $('#master').value = String(Math.round(s.master * 100));
    $('#master').style.setProperty('--fill', $('#master').value + '%');
    $('#master-value').textContent = $('#master').value + '%';
    $('#record').classList.toggle('recording', s.recording);
    $('#record').setAttribute('aria-pressed', String(s.recording));
    $('#record-text').textContent = s.recording ? 'Стоп · ' + fmt(s.recordingSeconds) : 'Запись микса';
    $('#audio-status').textContent = s.sampleRate
      ? ({stereo: 'Стерео', headphones: 'Наушники · объём', '7.1.4': '7.1.4'}[s.outputLayout] || 'Стерео') + ' · ' + Number((s.sampleRate / 1000).toFixed(1)) + ' kHz'
      : 'Студия готова';
    if (s.recording && !lastRecording) notice('Запись мастер-выхода началась');
    lastRecording = s.recording;
    if (s.A.playing || s.B.playing || s.A.scratching || s.B.scratching || s.recording)
      paintTimer = setTimeout(() => {
        paintTimer = 0;
        schedulePaint();
      }, 30);
  }
  function openDialog(title, html) {
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = html;
    if (!$('#dialog').open) $('#dialog').showModal();
  }
  function openKeys() {
    const rows = [
      ['Дека A · пуск / пауза', 'Q'],
      ['Дека B · пуск / пауза', 'P'],
      ['Cue · A / B', 'W / O'],
      ['Hot cues · A', '1 – 4'],
      ['Hot cues · B', '7 – 0'],
      ['Стереть hot cue', 'Shift + цифра'],
      ['Кроссфейдер', '← / →'],
      ['Удерживать срез звука · дека A / B', 'Z / M'],
      ['Вернуть в центр', 'C'],
      ['Полный экран', 'F'],
      ['Поиск трека', '/'],
      ['Горячие клавиши', '?'],
    ];
    openDialog(
      'Горячие клавиши',
      rows.map(([a, b]) => '<div class="key-row"><span>' + a + '</span><kbd>' + b + '</kbd></div>').join(''),
    );
  }
  function openMasters(initial) {
    const catalogue = tracks.filter(track => track.masterInfo);
    openDialog('Обработанные треки', '<div class="settings-block"><label for="master-track">Трек</label><select id="master-track"></select><div id="master-files" class="master-files"></div></div>');
    const select = $('#master-track');
    for (const track of catalogue) select.add(new Option(track.artist + ' — ' + track.title, track.id));
    if (catalogue.includes(initial)) select.value = initial.id;
    const show = () => {
      const track = catalogue.find(item => item.id === select.value);
      const list = $('#master-files');
      list.replaceChildren();
      if (!track) { list.textContent = 'Готовых мастеров пока нет.'; return; }
      for (const [label, meta, href, ext] of [
        ['Стерео · FLAC', track.masterInfo, track.masterInfo.src, 'flac'],
        ['7.1.4 · WavPack', track.spatialInfo, track.spatialInfo?.spatialSrc, 'wv']
      ]) {
        if (!href) continue;
        const link = document.createElement('a');
        link.className = 'action-button';
        link.href = href;
        link.download = track.artist + ' - ' + track.title + (ext === 'wv' ? ' (7.1.4)' : '') + '.' + ext;
        link.textContent = 'Скачать ' + label;
        const details = document.createElement('small');
        details.textContent = '24 бит · ' + meta.sampleRate / 1000 + ' kHz · ' + meta.integrated + ' LUFS · ' + meta.truePeak + ' dBTP' +
          (meta.bytes ? ' · ' + Math.round(meta.bytes / 1048576) + ' МиБ' : '');
        list.append(link, details);
      }
    };
    select.onchange = show;
    show();
  }
  let settingsRun = 0;
  function openSettings() {
    const s = engine.snapshot(),
      run = ++settingsRun;
    openDialog(
      'Настройки звука',
      '<div class="settings-block"><label for="sink-select">Выход наушников</label><select id="sink-select"><option value="">Выключен</option></select><button class="action-button" id="sink-pick" type="button">Выбрать устройство</button><p id="sink-hint"></p></div><div class="settings-block"><label for="grid-deck">Сетка долей</label><select id="grid-deck"><option value="A">Deck A</option><option value="B">Deck B</option></select><div class="grid-edit"><label>BPM <input id="grid-bpm" type="number" min="30" max="300" step="0.1" aria-label="Исходный BPM"></label><button class="action-button" id="grid-save">Применить</button><button class="action-button" id="tap-tempo">Tap BPM</button></div><button class="action-button" id="grid-anchor">Привязать долю к позиции деки</button></div>',
    );
    $('#dialog-body').insertAdjacentHTML(
      'beforeend',
      '<div class="settings-block"><button class="action-button" id="midi-open" type="button">Настроить MIDI-контроллер</button></div>',
    );
    $('#midi-open').onclick = () => window.DJMidi.open();
    $('#dialog-body').insertAdjacentHTML('afterbegin', '<div class="settings-block"><label for="speaker-layout">Основной выход</label><div class="output-row"><select id="speaker-layout"><option value="7.1.4">Акустика 7.1.4 · 12 каналов</option><option value="stereo">Стерео</option><option value="headphones">Наушники · виртуальный 7.1.4</option></select><button type="button" class="action-button" id="apply-layout">Включить</button></div><p id="layout-status" role="status"></p><div id="speaker-test" hidden></div></div>');
    if (window.InteonSoundControls) {
      $('#dialog-body').prepend(window.InteonSoundControls.editor());
    }
    const layouts = $('#speaker-layout');
    layouts.value = s.preferredLayout;
    function showOutput() {
      if (!layouts.isConnected) return;
      const state = engine.snapshot();
      let message = 'Нажмите «Включить» или запустите деку, чтобы проверить аудиовыход.';
      if (state.maxOutputChannels) {
        if (state.outputLayout === '7.1.4') message = 'Работает акустика 7.1.4. Нажмите на колонку для проверки.';
        else if (state.outputLayout === 'headphones') message = 'Работает виртуальный 7.1.4 в наушниках. Нажмите на канал для проверки.';
        else {
          message = state.maxOutputChannels === 1 ? 'Работает моно.' : 'Работает стерео.';
          if (state.preferredLayout === '7.1.4' && state.maxOutputChannels < 12)
            message += ' Для 7.1.4 выберите в системе выход с 12 каналами. Пульт переключится автоматически.';
        }
        message += ' Доступно каналов в браузере: ' + state.maxOutputChannels + '.';
      }
      const status = $('#layout-status');
      if (message !== status.textContent) status.textContent = message;
      const tests = $('#speaker-test');
      tests.hidden = !['7.1.4', 'headphones'].includes(state.outputLayout);
      if (!tests.hidden && !tests.childElementCount) {
        const labels = ['Фронт слева', 'Фронт справа', 'Центр', 'Сабвуфер', 'Сзади слева', 'Сзади справа', 'Сбоку слева', 'Сбоку справа', 'Сверху спереди слева', 'Сверху спереди справа', 'Сверху сзади слева', 'Сверху сзади справа'];
        window.DJSpatial.channels.forEach((name, index) => {
          const button = document.createElement('button');
          button.className = 'action-button';
          button.textContent = name;
          const label = document.createElement('small');
          label.textContent = labels[index];
          button.append(label);
          button.setAttribute('aria-label', labels[index]);
          button.onclick = () => engine.testOutputChannel(index);
          tests.append(button);
        });
      }
    }
    window.addEventListener('dj-change', showOutput);
    $('#dialog').addEventListener('close', () => window.removeEventListener('dj-change', showOutput), { once: true });
    $('#apply-layout').onclick = async () => {
      await engine.setOutputLayout(layouts.value);
      if (layouts.isConnected) showOutput();
    };
    showOutput();
    const list = $('#sink-select'),
      pick = $('#sink-pick'),
      hint = $('#sink-hint');
    const media = navigator.mediaDevices;
    const nativeOutputPicker = typeof media?.selectAudioOutput === 'function';
    async function listOutputs(extra) {
      try {
        const devices = ((await media?.enumerateDevices()) || []).filter(
          (d) =>
            d.kind === 'audiooutput' && d.deviceId && !['default', 'communications'].includes(d.deviceId),
        );
        if (run !== settingsRun || !list.isConnected) return;
        if (extra && !devices.some((d) => d.deviceId === extra.deviceId)) devices.push(extra);
        list.replaceChildren(new Option('Выключен', ''));
        devices.forEach((d, i) => list.add(new Option(d.label || 'Аудиовыход ' + (i + 1), d.deviceId)));
        list.value = engine.snapshot().monitorDevice;
        hint.textContent = devices.length
          ? 'Назначьте отдельный выход и включите наушники на нужном канале.'
          : 'Для предпрослушивания нужен доступный отдельный аудиовыход.';
        if (!nativeOutputPicker && devices.length < 2 && media?.getUserMedia) {
          hint.textContent += ' Чтобы показать устройства, браузер может запросить доступ к микрофону. Студия сразу закроет вход.';
        }
      } catch {
        hint.textContent = 'Браузер не предоставил список аудиовыходов.';
      }
    }
    if (s.canMonitor) {
      listOutputs();
      pick.hidden = !nativeOutputPicker && !media?.getUserMedia;
      if (!nativeOutputPicker) pick.textContent = 'Разрешить показ аудиоустройств';
      pick.addEventListener('click', async () => {
        try {
          if (!nativeOutputPicker) {
            const stream = await media.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            await listOutputs();
            return;
          }
          const device = await media.selectAudioOutput();
          if (run !== settingsRun || !list.isConnected) return;
          await engine.setMonitorDevice(device.deviceId);
          await listOutputs(device);
        } catch (err) {
          notice(err.name === 'NotAllowedError' ? 'Доступ к аудиоустройствам не предоставлен' : 'Не удалось выбрать аудиовыход');
        }
      });
      list.addEventListener('change', async () => {
        await engine.setMonitorDevice(list.value);
        list.value = engine.snapshot().monitorDevice;
      });
    } else {
      list.disabled = true;
      pick.hidden = true;
      hint.textContent = 'В этом браузере недоступен выбор отдельного аудиовыхода.';
    }
    const deck = $('#grid-deck'),
      bpm = $('#grid-bpm');
    let taps = [];
    const refresh = () => {
      taps = [];
      bpm.value = engine.snapshot()[deck.value].track?.bpm || '';
    };
    deck.addEventListener('change', refresh);
    refresh();
    const editGrid = (anchor) => {
      const id = deck.value,
        st = engine.snapshot()[id],
        track = st.track;
      const value = Number(bpm.value);
      if (!track || !Number.isFinite(value) || value < 30 || value > 300) {
        notice('Введите BPM от 30 до 300');
        return;
      }
      track.bpm = value;
      if (anchor) track.offset = st.time % (60 / value);
      gridEdits[track.id] = { bpm: value, offset: track.offset || 0 };
      save('grids', gridEdits);
      for (const side of channels)
        if (engine.snapshot()[side].track?.id === track.id) engine.setBPM(side, value);
      drawTable();
      schedulePaint();
      notice('Сетка Deck ' + id + ' сохранена');
    };
    $('#grid-save').onclick = () => editGrid(false);
    $('#grid-anchor').onclick = () => editGrid(true);
    $('#tap-tempo').onclick = () => {
      const now = performance.now();
      if (now - (taps.at(-1) || 0) > 2000) taps = [];
      taps.push(now);
      if (taps.length > 8) taps.shift();
      if (taps.length > 1) bpm.value = ((60000 * (taps.length - 1)) / (now - taps[0])).toFixed(1);
    };
  }
  let importing = false;
  async function importFiles(files) {
    if (importing || !files.length) return;
    importing = true;
    const button = $('#import');
    button.disabled = true;
    let added = 0,
      duplicates = 0;
    const problems = [];
    for (const [i, file] of Array.from(files).entries()) {
      button.textContent = 'Импорт ' + (i + 1) + '/' + files.length;
      try {
        const t = await window.DJImport.read(file);
        const duplicate = tracks.find((x) => x.id === t.id);
        if (duplicate) {
          if (!duplicate.src) duplicate.src = t.src;
          else URL.revokeObjectURL(t.src);
          if (duplicate.normalization?.version !== t.normalization?.version) {
            duplicate.normalization = t.normalization;
            duplicate.stored = await window.DJStorage.put(duplicate, file);
          }
          duplicates++;
          continue;
        }
        t.stored = await window.DJStorage.put(t, file);
        if (!t.stored)
          problems.push(t.title + ' · Трек доступен до закрытия вкладки. Браузер не сохранил файл.');
        Object.assign(t, gridEdits[t.id]);
        tracks.push(t);
        added++;
        if (t.analysisMessage) problems.push(t.title + ' · ' + t.analysisMessage);
      } catch (e) {
        problems.push(file.name + ' · ' + e.message);
      }
    }
    importing = false;
    button.disabled = false;
    button.innerHTML = icon('plus', 14) + 'Импорт';
    if (added || duplicates) {
      crate = 'imports';
      $('#search').value = '';
      drawTable();
    }
    if (problems.length)
      openDialog(
        'Импорт аудио',
        '<p class="hint">Добавлено треков: ' +
          added +
          '</p>' +
          problems.map((m) => '<p class="import-note">' + esc(m) + '</p>').join(''),
      );
    else notice(added ? 'Добавлено треков: ' + added : 'Эти треки уже в фонотеке');
  }
  for (const id of channels) {
    const host = $('#deck-' + id.toLowerCase());
    const deck = window.DJDecks.mount(host, id);
    mountDeckBrowser(deck, id);
    mountChannel(id);
    host.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-inteon-track')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    host.addEventListener('drop', (e) => {
      const key = e.dataTransfer.getData('application/x-inteon-track');
      if (key) {
        e.preventDefault();
        loadDeck(
          id,
          tracks.find((t) => t.id === key),
        );
      }
    });
  }
  for (const side of ['left', 'right']) $('#' + side + '-meter').innerHTML = '<b></b>'.repeat(24);
  window.addEventListener('dj-load', ({detail: {id}}) => {
    window.DJDecks.render(id, engine.snapshot()[id]);
  });
  window.addEventListener('dj-change', schedulePaint);
  window.addEventListener('dj-error', (e) => notice(e.detail.message));
  window.addEventListener('dj-recorded', (e) => notice('Микс сохранён · ' + e.detail.filename));
  window.addEventListener('hashchange', useView);
  document.addEventListener('visibilitychange', schedulePaint);
  $('#record').onclick = () => engine.toggleRecording();
  $('#master').oninput = (e) => engine.setMaster(e.target.value / 100);
  $('#cross').oninput = (e) => engine.setCross(e.target.value / 100);
  $('#mobile-cross').oninput = (e) => engine.setCross(e.target.value / 100);
  for (const tab of $$('.controller-tabs button')) {
    tab.onclick = () => {
      $('.deck-bank').dataset.panel = tab.dataset.panel;
      for (const other of $$('.controller-tabs button')) {
        other.setAttribute('aria-pressed', String(other === tab));
      }
      schedulePaint();
    };
  }
  $('#center-cross').onclick = () => engine.setCross(0);
  $('#curve-cross').onclick = () => {
    const sharp = !engine.snapshot().sharpCross;
    engine.setCrossCurve(sharp);
    save('sharp-cross', sharp);
  };
  engine.setCrossCurve(read('sharp-cross', false));
  $('#cross').ondblclick = () => engine.setCross(0);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notice('Браузер не разрешил полноэкранный режим');
    }
  }
  $('#expand').onclick = toggleFullscreen;
  if (!document.fullscreenEnabled) $('#expand').hidden = true;
  document.addEventListener('fullscreenchange', () => {
    const text = document.fullscreenElement ? 'Выйти из полного экрана' : 'Во весь экран';
    $('#expand').title = text;
    $('#expand').setAttribute('aria-label', text);
    $('#expand').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  });
  $('#keys-open').onclick = $('#keys-footer').onclick = openKeys;
  $('#settings-open').onclick = openSettings;
  $('#dialog-close').onclick = () => $('#dialog').close();
  $('#dialog').addEventListener('click', (e) => {
    if (e.target === $('#dialog')) {
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        e.target.close();
    }
  });
  $('#search').oninput = () => drawTable();
  $$('[data-crate]').forEach(
    (b) =>
      (b.onclick = () => {
        crate = b.dataset.crate;
        drawTable();
      }),
  );
  $$('[data-sort]').forEach(
    (b) =>
      (b.onclick = () => {
        sortDir = sortKey === b.dataset.sort ? -sortDir : 1;
        sortKey = b.dataset.sort;
        drawTable();
      }),
  );
  $('#track-list').addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const track = tracks[Number(button.closest('tr').dataset.index)];
    if (button.dataset.action === 'star') {
      if (favorites.has(track.id)) favorites.delete(track.id);
      else favorites.add(track.id);
      save('favorites', [...favorites]);
      drawTable();
    } else if (button.dataset.action === 'remove') confirmRemoval(track);
    else loadDeck(button.dataset.action, track);
  });
  $('#track-list').addEventListener('dragstart', (e) => {
    const row = e.target.closest('tr[data-index]');
    if (!row) return;
    e.dataTransfer.setData('application/x-inteon-track', tracks[Number(row.dataset.index)].id);
    e.dataTransfer.effectAllowed = 'copy';
  });
  $('#import').onclick = () => $('#import-files').click();
  $('#masters').onclick = () => openMasters(engine.snapshot().A.track);
  $('#import-files').onchange = (e) => {
    importFiles(Array.from(e.target.files));
    e.target.value = '';
  };
  const lib = $('#collection');
  lib.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      lib.classList.add('dragover');
    }
  });
  lib.addEventListener('dragleave', (e) => {
    if (!lib.contains(e.relatedTarget)) lib.classList.remove('dragover');
  });
  lib.addEventListener('drop', (e) => {
    lib.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      importFiles(Array.from(e.dataTransfer.files));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.defaultPrevented ||
      document.querySelector('dialog[open], #theme-panel:not([hidden]), #auth-panel:not([hidden])') ||
      e.target.closest('input,textarea,select,[contenteditable="true"],[popover],.dd-browser')
    )
      return;
    const code = e.code;
    if (code === 'KeyQ' || code === 'KeyP') engine.toggle(code === 'KeyQ' ? 'A' : 'B');
    else if (code === 'KeyW' || code === 'KeyO') engine.cue(code === 'KeyW' ? 'A' : 'B');
    else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code))
      engine.hotCue('A', Number(code.slice(-1)), e.shiftKey);
    else if (['Digit7', 'Digit8', 'Digit9', 'Digit0'].includes(code))
      engine.hotCue('B', ((Number(code.slice(-1)) + 3) % 10) + 1, e.shiftKey);
    else if (code === 'ArrowLeft' || code === 'ArrowRight')
      engine.setCross(
        Math.max(-1, Math.min(1, engine.snapshot().cross + (code === 'ArrowLeft' ? -0.05 : 0.05))),
      );
    else if (code === 'KeyC') engine.setCross(0);
    else if (code === 'KeyZ' || code === 'KeyM') engine.setCut(code === 'KeyZ' ? 'A' : 'B', true);
    else if (code === 'KeyF' && document.fullscreenEnabled) toggleFullscreen();
    else if (code === 'Slash' && e.shiftKey) openKeys();
    else if (code === 'Slash') $('#search').focus();
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyZ' || event.code === 'KeyM') engine.setCut(event.code === 'KeyZ' ? 'A' : 'B', false);
  });
  function releaseCuts() { channels.forEach(id => engine.setCut(id, false)); }
  window.addEventListener('blur', releaseCuts);
  window.addEventListener('pagehide', releaseCuts);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseCuts(); });
  window.addEventListener('beforeunload', (e) => {
    if (engine.snapshot().recording) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const preferredB = tracks.find(track => track.title === 'High Stage Of Reality');
  const openingA = tracks.find(track => track.title === 'Echoes Resurface') || tracks.find(track => track !== preferredB);
  const openingB = preferredB || tracks.find(track => track !== openingA);
  if (openingA) engine.load('A', openingA);
  if (openingB) engine.load('B', openingB);
  useView();
  drawTable();
  schedulePaint();
  window.DJStorage.list().then((saved) => {
    for (const track of saved) {
      if (!tracks.some((t) => t.id === track.id))
        tracks.push(Object.assign(track, { stored: true }, gridEdits[track.id]));
    }
    if (saved.length) drawTable();
  });
})();
