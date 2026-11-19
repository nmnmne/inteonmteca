(() => {
  'use strict';

  const decks = new Map();
  const loopLengths = [1, 2, 4, 8, 16, 32];
  const zoomLevels = [1, 2, 4, 8];
  const revolution = 1.8; // Seconds of track per turn at 33⅓ RPM.
  const fullTurn = 2 * Math.PI;
  const jogHints = {
    scratch: 'Ведите винил вперёд и назад для скретча. За ребристый обод можно подогнать скорость. Стрелки двигают винил с клавиатуры.',
    bend: 'Вращайте диск по часовой стрелке для ускорения, против — для замедления. Можно использовать стрелки.',
    tempo: 'Вращайте диск, чтобы изменить постоянный темп. Можно использовать стрелки.'
  };
  const glyphs = {
    lock: '<rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    play: '<path d="M7 4.5 20 12 7 19.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor" stroke="none"/>',
    sync: '<path d="M4 8h15m-3-3 3 3-3 3M20 16H5m3 3-3-3 3-3"/>',
    loop: '<path d="M6 7h12l-3-3m3 3-3 3M18 17H6l3 3m-3-3 3-3M20 11v2m-16 0v-2"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    tempo: '<path d="M4 7h16M4 17h16"/><path d="M9 4v6m7 4v6" stroke-width="3"/>',
    zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    grooves: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.3"/><path d="M6.3 11a6 6 0 0 1 4.8-4.7M17.6 13a6 6 0 0 1-4.6 4.6"/>',
    pads: '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><rect x="14.5" y="14.5" width="6" height="6" rx="1"/>'
  };

  function icon(name, size = 14) {
    return '<svg aria-hidden="true" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + glyphs[name] + '</svg>';
  }

  function clock(value) {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function percent(value) {
    return (value < 0 ? '−' : '+') + Math.abs(value).toFixed(1) + '%';
  }

  function write(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function pressed(button, value) {
    const attr = String(Boolean(value));
    if (button.getAttribute('aria-pressed') !== attr) button.setAttribute('aria-pressed', attr);
  }

  function mount(container, id) {
    if (!['A', 'B'].includes(id) || !container) return;
    decks.get(id)?.destroy();
    const root = document.createElement('section');
    root.className = 'dj-deck dj-deck--' + id.toLowerCase();
    root.setAttribute('aria-label', 'Deck ' + id);
    root.innerHTML = `
      <header class="dd-head">
        <div class="dd-heading"><span class="dd-ident">${id}</span><span>DECK ${id}</span></div>
        <div class="dd-head-controls">
          <button type="button" class="dd-chip dd-lock" title="Сохранять тональность при изменении темпа" aria-pressed="true">${icon('lock', 12)}<span>Key lock</span></button>
        </div>
      </header>
      <div class="dd-track">
        <div class="dd-track-text"><h2>Дека свободна</h2><div class="dd-artist-line"><span class="dd-artist">Загрузите трек</span><span class="dd-key" hidden></span></div></div>
        <div class="dd-bpm-box"><span class="dd-bpm">—</span><span class="dd-bpm-unit">BPM</span></div>
      </div>
      <div class="dd-scope">
        <div class="dd-wave-controls"><span class="dd-current">00:00</span><div class="dd-wave-tools"><span class="dd-remaining">−00:00</span><button type="button" class="dd-zoom" title="Изменить масштаб волны" aria-label="Масштаб волны 1×">${icon('zoom',12)}<span>1×</span></button></div></div>
        <canvas class="dd-wave" tabindex="0" role="slider" aria-label="Позиция на волне деки ${id}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"></canvas>
      </div>
      <div class="dd-hardware">
        <div class="dd-wheel-column">
          <div class="dd-wheel-mount">
            <div class="dd-jog" tabindex="0" role="slider" aria-label="Скретч на деке ${id}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" title="${jogHints.scratch}">
              <div class="dd-platter"><div class="dd-vinyl"><span class="dd-art">${icon('grooves', 22)}<img alt="" draggable="false" hidden></span></div><i class="dd-strobe"></i></div>
            </div>
            <div class="dd-scrub" tabindex="0" role="slider" aria-label="Перемотка пластинки деки ${id}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" title="Тяните этикетку для перемотки. Shift — точнее, стрелки — по одной доле." hidden></div>
            <span class="dd-scratch-status" role="status" hidden>Загрузка звука…</span>
          </div>
          <div class="dd-wheel-modes" role="group" aria-label="Режим диска деки ${id}">
            <button type="button" data-jog="scratch" aria-pressed="true" title="${jogHints.scratch}">Скретч</button>
            <button type="button" data-jog="bend" aria-pressed="false" title="Подгонять скорость, пока удерживаете диск">Подгонка</button>
            <button type="button" data-jog="tempo" aria-pressed="false" title="Изменять постоянный темп вращением диска">Темп</button>
          </div>
        </div>
        <div class="dd-pitch">
          <label class="dd-pitch-title" for="dj-rate-${id}">Pitch</label>
          <select class="dd-pitch-range" aria-label="Диапазон фейдера темпа деки ${id}" title="Диапазон фейдера"><option value="8">±8%</option><option value="16">±16%</option><option value="50">±50%</option></select>
          <div class="dd-rail"><div class="dd-scale" aria-hidden="true"><span>−</span><span>0</span><span>+</span></div><input type="range" id="dj-rate-${id}" min="-8" max="8" value="0" step="0.1" aria-label="Фейдер темпа деки ${id}"></div>
          <output class="dd-pitch-value" for="dj-rate-${id}">+0.0%</output>
          <div class="dd-tempo-steps"><button type="button" data-rate="-0.1" title="Замедлить на 0,1%">−</button><button type="button" data-rate="reset" title="Исходный темп" aria-label="Сбросить темп">0</button><button type="button" data-rate="0.1" title="Ускорить на 0,1%">+</button></div>
        </div>
      </div>
      <div class="dd-transport">
        <div class="dd-transport-group">
          <button type="button" class="dd-btn dd-cue" title="Поставить точку на паузе или вернуться к ней при воспроизведении">Cue</button>
          <button type="button" class="dd-btn dd-play" title="Воспроизвести деку ${id}" aria-label="Воспроизвести деку ${id}">${icon('play',20)}</button>
          <button type="button" class="dd-btn dd-sync" title="Совместить темп и долю со второй декой">${icon('sync',13)}<span>Sync</span></button>
        </div>
        <div class="dd-loop-group">
          <button type="button" class="dd-btn dd-loop" aria-pressed="false" title="Включить или выключить петлю">${icon('loop',16)}<span>Loop</span></button>
          <label class="dd-loop-select"><select aria-label="Длина петли в долях на деке ${id}">${loopLengths.map(n => '<option value="' + n + '"' + (n === 4 ? ' selected' : '') + '>' + n + '</option>').join('')}</select>${icon('chevron',12)}</label>
        </div>
      </div>
      <div class="dd-pads"><span class="dd-pad-label">${icon('pads',13)}Hot cues</span>
        ${[1, 2, 3, 4].map(n => '<button type="button" class="dd-pad" data-pad="' + n + '" aria-label="Set hot cue ' + n + ' on deck ' + id + '">' + n + '</button>').join('')}
      </div>`;
    container.replaceChildren(root);
    const find = selector => root.querySelector(selector);
    const refs = {
      art: find('.dd-art img'), jog: find('.dd-jog'), platter: find('.dd-platter'), vinyl: find('.dd-vinyl'), title: find('h2'), artist: find('.dd-artist'), key: find('.dd-key'),
      bpm: find('.dd-bpm'), time: find('.dd-current'), remaining: find('.dd-remaining'),
      wave: find('canvas'), zoom: find('.dd-zoom'), lock: find('.dd-lock'), scrub: find('.dd-scrub'), scratchStatus: find('.dd-scratch-status'),
      range: find('.dd-pitch-range'), steps: find('.dd-tempo-steps'), modes: find('.dd-wheel-modes'),
      rate: find('input[type="range"]'), rateText: find('.dd-pitch-value'),
      play: find('.dd-play'), cue: find('.dd-cue'), sync: find('.dd-sync'), loop: find('.dd-loop'),
      length: find('.dd-loop-select select'), pads: Array.from(root.querySelectorAll('[data-pad]'))
    };
    const deck = {
      id, root, refs, state: {}, mode: 'scratch', spin: 0, zoom: 1, lastTrack: undefined, lastPlaying: false, renderKey: '',
      ctx: refs.wave.getContext('2d'), size: { width: 0, height: 0 }, timer: null, span: 0, from: 0
    };
    decks.set(id, deck);
    const engine = () => window.DJEngine;
    const currentState = () => engine().snapshot()[id];
    const available = () => Boolean(deck.state.track);
    const bound = (value, min, max) => Math.max(min, Math.min(max, value));
    function useRange(limit) {
      refs.range.value = limit;
      refs.rate.min = -limit;
      refs.rate.max = limit;
    }
    refs.range.addEventListener('change', () => {
      const limit = Number(refs.range.value);
      useRange(limit);
      engine().setTempo(id, bound(currentState().tempo, -limit, limit));
    });
    refs.rate.addEventListener('input', () => engine().setTempo(id, Number(refs.rate.value)));
    refs.steps.addEventListener('click', event => {
      const step = event.target.closest('button')?.dataset.rate;
      if (step) {
        const limit = Number(refs.range.value);
        engine().setTempo(id, step === 'reset' ? 0 : bound(currentState().tempo + Number(step), -limit, limit));
      }
    });
    refs.lock.addEventListener('click', () => engine().setKeyLock(id, !currentState().keyLock));
    refs.play.addEventListener('click', () => engine().toggle(id));
    refs.cue.addEventListener('click', () => engine().cue(id));
    refs.sync.addEventListener('click', () => engine().sync(id));
    refs.loop.addEventListener('click', () => engine().loop(id, currentState().loopBeats ? 0 : Number(refs.length.value)));
    refs.length.addEventListener('change', () => {
      if (currentState().loopBeats) engine().loop(id, Number(refs.length.value));
    });
    refs.zoom.addEventListener('click', () => {
      deck.zoom = zoomLevels[(zoomLevels.indexOf(deck.zoom) + 1) % zoomLevels.length];
      write(refs.zoom.querySelector('span'), deck.zoom + '×');
      refs.zoom.setAttribute('aria-label', 'Масштаб волны ' + deck.zoom + '×');
      draw(deck, true);
    });
    refs.art.addEventListener('error', () => { refs.art.hidden = true; });
    refs.art.addEventListener('load', () => { refs.art.hidden = false; });
    let gesture = null;
    let keyFrame = 0;
    function releaseWheel() {
      const active = gesture;
      if (!active) return;
      gesture = null;
      cancelAnimationFrame(keyFrame);
      if (active.pointer != null && active.control.hasPointerCapture(active.pointer))
        active.control.releasePointerCapture(active.pointer);
      root.classList.remove('dd-dragging', 'dd-scratching');
      if (currentState().track !== active.track) return;
      if (active.mode === 'scratch') engine().endScratch(id);
      if (active.mode === 'bend') engine().setBend(id, 0);
    }
    deck.releaseWheel = releaseWheel;
    function grab(input) {
      if (input.mode === 'scratch' && !engine().beginScratch(id)) return false;
      gesture = input;
      root.classList.add('dd-dragging');
      root.classList.toggle('dd-scratching', input.mode === 'scratch');
      return true;
    }
    refs.modes.addEventListener('click', event => {
      const chosen = event.target.closest('[data-jog]')?.dataset.jog;
      if (!chosen || deck.mode === chosen) return;
      releaseWheel();
      deck.mode = chosen;
      Array.from(refs.modes.children).forEach(button => pressed(button, button.dataset.jog === chosen));
      refs.jog.setAttribute('aria-label', ({ scratch: 'Скретч на деке ', bend: 'Подгонка скорости диском деки ', tempo: 'Темп диском деки ' })[chosen] + id);
      refs.jog.title = jogHints[chosen];
      refs.scrub.hidden = chosen === 'scratch';
      render(id, currentState());
    });
    function wheelStep(g, point) {
      const x = point.clientX - g.cx, y = point.clientY - g.cy;
      const dx = x - g.x, dy = y - g.y;
      const distance = Math.hypot(dx, dy);
      if (!distance) return 0;
      const r = Math.hypot(g.x, g.y);
      const tangential = (g.x * dy - g.y * dx) / Math.max(r, 1);
      if (!g.axis) {
        if (distance < 1) return 0;
        // Angle is undefined at the spindle. Straight radial strokes also work
        // like a jog strip; lock their axis so pulling back retraces the sound.
        g.axis = r < g.radius * .28 || Math.abs(tangential) < distance * .38
          ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : 'angle';
      }
      let radians;
      if (g.axis === 'x') radians = dx / (g.radius * .72);
      else if (g.axis === 'y') radians = -dy / (g.radius * .72);
      else if (Math.min(r, Math.hypot(x, y)) < g.radius * .22)
        radians = tangential / (g.radius * .35);
      else {
        // atan2(cross,dot) stays continuous as the finger crosses twelve o'clock.
        radians = Math.atan2(g.x * y - g.y * x, g.x * x + g.y * y);
      }
      g.x = x; g.y = y;
      return radians;
    }
    function trackPointer(control) {
      control.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !available() || gesture?.pointer != null) return;
        event.preventDefault();
        releaseWheel();
        const bounds = refs.jog.getBoundingClientRect();
        const cx = bounds.left + bounds.width / 2, cy = bounds.top + bounds.height / 2;
        const radius = bounds.width / 2;
        const x = event.clientX - cx, y = event.clientY - cy;
        let mode = control === refs.scrub ? 'scrub' : deck.mode;
        // The visible black vinyl and the ribbed sidewall have distinct jobs.
        const vinylRadius = radius * refs.vinyl.offsetWidth / refs.jog.offsetWidth;
        if (mode === 'scratch' && Math.hypot(x, y) > vinylRadius) mode = 'bend';
        control.focus({ preventScroll: true });
        const input = { control, track: currentState().track, pointer: event.pointerId, mode,
          cx, cy, x, y, radius, axis: mode === 'scrub' ? 'x' : '', total: 0 };
        if (!grab(input)) return;
        control.setPointerCapture(event.pointerId);
      });
      function moveWheel(event) {
        const g = gesture;
        if (!g || event.pointerId !== g.pointer || g.control !== control) return;
        const state = currentState();
        if (state.track !== g.track || (g.mode === 'scratch' && !state.scratching)) { releaseWheel(); return; }
        let step = 0;
        for (const point of event.getCoalescedEvents?.() || []) step += wheelStep(g, point);
        step += wheelStep(g, event);
        if (!step) return;
        if (event.shiftKey) step /= 8;
        const seconds = step * revolution / fullTurn;
        if (g.mode === 'scratch') engine().moveScratch(id, seconds);
        else if (g.mode === 'scrub') {
          engine().seek(id, state.time + seconds);
        } else {
          g.total += step;
          deck.spin = (deck.spin + step * 180 / Math.PI) % 360;
          if (g.mode === 'bend') engine().setBend(id, bound(g.total * 7, -12, 12));
          else {
            const limit = Number(refs.range.value);
            engine().setTempo(id, bound(state.tempo + step * limit / Math.PI, -limit, limit));
          }
        }
        render(id, currentState());
      }
      control.addEventListener('pointermove', moveWheel);
      control.addEventListener('contextmenu', event => event.preventDefault());
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        control.addEventListener(type, event => {
          if (gesture?.pointer !== event.pointerId || gesture.control !== control) return;
          if (type === 'pointerup') moveWheel(event);
          releaseWheel();
        });
      }
    }
    trackPointer(refs.jog);
    trackPointer(refs.scrub);
    refs.jog.addEventListener('keydown', event => {
      const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
      if (!direction || !available()) return;
      event.preventDefault();
      event.stopPropagation();
      if (gesture?.pointer != null) return;
      if (deck.mode === 'tempo') {
        const limit = Number(refs.range.value);
        engine().setTempo(id, bound(currentState().tempo + direction * (event.shiftKey ? 0.01 : 0.1), -limit, limit));
        return;
      }
      if (!gesture && !grab({ key: event.key, track: currentState().track, mode: deck.mode, last: performance.now() })) return;
      gesture.key = event.key;
      gesture.speed = direction * (event.shiftKey ? .25 : 1.5);
      if (deck.mode === 'bend') engine().setBend(id, direction * (event.shiftKey ? .25 : 2));
      else if (!event.repeat) {
        engine().moveScratch(id, gesture.speed * .025);
        cancelAnimationFrame(keyFrame);
        gesture.last = performance.now();
        keyFrame = requestAnimationFrame(function moveKey(now) {
          if (!gesture?.key || gesture.mode !== 'scratch') return;
          const state = currentState();
          if (state.track !== gesture.track || !state.scratching) { releaseWheel(); return; }
          engine().moveScratch(id, gesture.speed * bound(now - gesture.last, 0, 50) / 1000);
          gesture.last = now;
          render(id, currentState());
          keyFrame = requestAnimationFrame(moveKey);
        });
      }
    });
    refs.jog.addEventListener('keyup', event => { if (gesture?.key === event.key) releaseWheel(); });
    // A second finger can operate the crossfader while the record stays held.
    refs.jog.addEventListener('blur', () => { if (gesture?.key) releaseWheel(); });
    const onVisibility = () => { if (document.hidden) releaseWheel(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', releaseWheel);
    window.addEventListener('pagehide', releaseWheel);
    for (const button of refs.pads) {
      const number = Number(button.dataset.pad);
      let consumed = false;
      const stop = () => clearTimeout(deck.timer);
      button.addEventListener('pointerdown', event => {
        consumed = false;
        stop();
        if (event.pointerType !== 'mouse') {
          deck.timer = setTimeout(() => {
            if (deck.state.hotCues?.[number - 1] == null) return;
            engine().hotCue(id, number, true);
            consumed = true;
          }, 580);
        }
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, stop);
      button.addEventListener('click', event => {
        if (!consumed) engine().hotCue(id, number, event.shiftKey);
        consumed = false;
      });
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        stop();
        engine().hotCue(id, number, true);
      });
      button.addEventListener('keydown', event => {
        if (['Delete', 'Backspace'].includes(event.key)) {
          event.preventDefault();
          engine().hotCue(id, number, true);
        }
      });
    }
    function seekAt(event) {
      const bounds = refs.wave.getBoundingClientRect();
      if (!available() || !bounds.width) return;
      const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      engine().seek(id, deck.from + fraction * deck.span);
    }
    refs.wave.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !available()) return;
      refs.wave.setPointerCapture(event.pointerId);
      // Keep the viewport stable while scrubbing a zoomed waveform.
      deck.dragStart = deck.from;
      seekAt(event);
    });
    refs.wave.addEventListener('pointermove', event => {
      if (refs.wave.hasPointerCapture(event.pointerId)) seekAt(event);
    });
    refs.wave.addEventListener('lostpointercapture', () => { delete deck.dragStart; });
    const keyboardSeek = event => {
      if (!available()) return;
      const current = currentState();
      const beat = 60 / (baseTempo(current) || 120);
      const time = current.time || 0;
      const positions = {ArrowLeft: time - beat, ArrowRight: time + beat, PageDown: time - beat * 16, PageUp: time + beat * 16, Home: 0, End: current.duration};
      if (Object.hasOwn(positions, event.key)) {
        event.preventDefault();
        event.stopPropagation();
        engine().seek(id, positions[event.key]);
      }
    };
    refs.wave.addEventListener('keydown', keyboardSeek);
    refs.scrub.addEventListener('keydown', keyboardSeek);
    refs.jog.addEventListener('keydown', event => {
      if (deck.mode === 'scratch' && ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) keyboardSeek(event);
    });
    const resize = new ResizeObserver(entries => {
      const box = entries[0].contentRect;
      deck.size = { width: box.width, height: box.height };
      draw(deck, true);
    });
    resize.observe(refs.wave);
    deck.destroy = () => {
      resize.disconnect();
      clearTimeout(deck.timer);
      releaseWheel();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', releaseWheel);
      window.removeEventListener('pagehide', releaseWheel);
    };
    render(id, {});
    return root;
  }

  function baseTempo(state) {
    return Number(state.baseBPM || state.track?.bpm) || 0;
  }

  function draw(deck, force = false) {
    const { ctx, refs, state, size } = deck;
    const { width, height } = size;
    if (!ctx || width < 1 || height < 1) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.round(height * scale);
    if (refs.wave.width !== pixelWidth || refs.wave.height !== pixelHeight) {
      refs.wave.width = pixelWidth;
      refs.wave.height = pixelHeight;
      force = true;
    }
    const duration = Number(state.duration || state.track?.duration) || 0;
    const time = Math.max(0, Math.min(duration, Number(state.time) || 0));
    const span = duration / deck.zoom;
    const from = deck.dragStart ?? Math.min(Math.max(0, time - span / 2), duration - span);
    deck.span = span;
    deck.from = from;
    const playX = span ? (time - from) / span * width : 0;
    const bpm = baseTempo(state);
    const key = [Math.round(from / (span || 1) * width), Math.round(playX * scale), Math.round(bpm * 100), state.loopBeats, state.loopStart, state.cue, state.hotCues?.join(','), state.track?.peaks?.length].join('|');
    if (!force && key === deck.renderKey) return;
    deck.renderKey = key;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const teal = deck.id === 'A';
    const outer = teal ? '#208f81' : '#bc5a48';
    const mid = teal ? '#44cbb1' : '#ee8b73';
    const inner = teal ? '#9af1ce' : '#ffcd9c';
    const cursor = teal ? '#a4fce5' : '#ffe2cf';
    const center = Math.floor(height / 2) + 0.5;
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    for (const row of [.2, .8]) ctx.fillRect(0, Math.round(row * height), width, 1);
    const beat = bpm > 0 ? 60 / bpm : 1;
    // Thin beat grid while zoomed in; fall back to evenly spaced divisions on an empty deck.
    if (span) {
      let step = beat;
      let beatsPerLine = 1;
      while (step * width / span < 23) { step *= 2; beatsPerLine *= 2; }
      const offset = Number(state.track?.offset) || 0;
      const first = Math.ceil((from - offset) / step);
      for (let i = first; (i * step + offset - from) < span; i++) {
        const x = Math.round((i * step + offset - from) / span * width);
        ctx.fillStyle = i % 4 ? 'rgba(255,255,255,.062)' : 'rgba(255,255,255,.135)';
        ctx.fillRect(x, 0, 1, height);
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,.33)';
          ctx.fillRect(x, height - (i % 4 ? 3 : 5), 1, 5);
          if (beatsPerLine >= 4 && x > 4 && x < width - 25 && i % 4 === 0) {
            ctx.font = '9px monospace';
            ctx.fillText(String(1 + Math.floor(i * beatsPerLine / 4)), x + 3, height - 2);
          }
        }
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      for (let i = 1; i < 12; i++) ctx.fillRect(Math.round(width * i / 12), 0, 1, height);
    }
    const peaks = state.track?.peaks;
    const bass = state.track?.bass;
    if (peaks?.length && span) {
      const pxPerBar = 2;
      const start = from / duration * peaks.length;
      const bins = span / duration * peaks.length / width;
      const half = Math.max(1, (height - 12) / 2);
      for (let x = 0; x < width; x += pxPerBar) {
        const i = Math.max(0, Math.min(peaks.length - 1, Math.floor(start + bins * x)));
        const j = Math.min(peaks.length, Math.max(i + 1, Math.floor(start + bins * (x + pxPerBar))));
        let max = 0, low = 0, sum = 0;
        for (let n = i; n < j; n++) {
          const sample = Number(peaks[n]) || 0;
          max = Math.max(max, sample);
          sum += sample;
          low = Math.max(low, Number(bass?.[n]) || 0);
        }
        if (max <= 0) continue;
        const envelope = .64 * max + .36 * sum / (j - i);
        const high = Math.max(1, Math.min(1, envelope) * half);
        const core = high * (.26 + .45 * Math.min(1, bass?.length ? low : sum / (j - i)));
        ctx.fillStyle = outer;
        ctx.fillRect(x, center - high, pxPerBar, high * 2);
        ctx.fillStyle = mid;
        ctx.fillRect(x, center - high * .86, pxPerBar - .45, high * 1.72);
        ctx.fillStyle = inner;
        ctx.fillRect(x, center - core, pxPerBar - .45, core * 2);
      }
    }
    ctx.fillStyle = teal ? '#59cdb66b' : '#faab846b';
    ctx.fillRect(0, center, width, 1);
    if (!span) return;
    if (state.loopBeats > 0 && Number.isFinite(state.loopStart)) {
      const startX = (state.loopStart - from) / span * width;
      const loopWidth = beat * state.loopBeats / span * width;
      ctx.fillStyle = teal ? '#69eace22' : '#ff9d8325';
      ctx.fillRect(startX, 0, loopWidth, height);
      ctx.fillStyle = mid;
      ctx.fillRect(startX, height - 2, loopWidth, 2);
    }
    state.hotCues?.forEach((at, index) => {
      if (!Number.isFinite(at) || at < from || at > from + span) return;
      const x = Math.round((at - from) / span * width);
      ctx.fillStyle = cursor;
      ctx.fillRect(x, 0, 1, height);
      ctx.fillRect(x, 0, 12, 12);
      ctx.fillStyle = '#111816';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(String(index + 1), x + 3, 9);
    });
    const x = Math.min(width - 1, Math.max(1, Math.round(playX)));
    ctx.fillStyle = '#0009';
    ctx.fillRect(x - 2, 0, 4, height);
    ctx.fillStyle = cursor;
    ctx.fillRect(x, 0, 1.5, height);
    ctx.beginPath();
    ctx.moveTo(x - 4, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x + .5, 6); ctx.closePath();
    ctx.fill();
  }

  function render(id, state) {
    const deck = decks.get(id);
    if (!deck || !state) return;
    const { refs } = deck;
    deck.state = state;
    const track = state.track;
    const trackChanged = deck.lastTrack !== track;
    if (trackChanged) {
      deck.lastTrack = track;
      deck.releaseWheel?.();
      deck.spin = 0;
      write(refs.title, track?.title || 'Дека свободна');
      refs.title.title = track?.title || '';
      write(refs.artist, track?.artist || (track ? '—' : 'Загрузите трек'));
      write(refs.key, track?.key || '');
      refs.key.hidden = !track?.key;
      if (track?.cover) {
        refs.art.hidden = true;
        refs.art.src = track.cover;
      } else {
        refs.art.removeAttribute('src');
        refs.art.hidden = true;
      }
    }
    if (!state.scratching && deck.root.classList.contains('dd-scratching')) deck.releaseWheel();
    const loaded = Boolean(track);
    refs.scratchStatus.hidden = !(state.scratching && state.scratchStatus === 'loading');
    if (deck.loaded !== loaded) {
      deck.loaded = loaded;
      for (const control of [refs.play, refs.cue, refs.sync, refs.loop, refs.length, refs.zoom, refs.rate, refs.range, refs.lock, ...refs.steps.children, ...refs.modes.children, ...refs.pads]) control.disabled = !loaded;
      refs.wave.setAttribute('aria-disabled', String(!loaded));
      refs.jog.setAttribute('aria-disabled', String(!loaded));
      refs.scrub.setAttribute('aria-disabled', String(!loaded));
    }
    const bpm = Number(state.bpm || track?.bpm);
    write(refs.bpm, Number.isFinite(bpm) && bpm > 0 ? bpm.toFixed(1) : '—');
    const tempo = Math.round((+state.tempo || 0) * 1000) / 1000;
    if (Math.abs(tempo) > Number(refs.range.value) + 0.001) {
      const limit = Math.abs(tempo) <= 16 ? 16 : 50;
      refs.range.value = limit; refs.rate.min = -limit; refs.rate.max = limit;
    }
    const duration = Number(state.duration || track?.duration) || 0;
    const time = Number(state.time) || 0;
    const scratchMode = deck.mode === 'scratch';
    const jogLimit = scratchMode ? Math.ceil(duration) : deck.mode === 'bend' ? 12 : Number(refs.range.value);
    const jogValue = scratchMode ? Math.floor(time * 10) / 10 : deck.mode === 'bend' ? Number(state.bend || 0) : tempo;
    const jogText = scratchMode ? clock(time) + '.' + Math.floor(time * 10) % 10 : percent(jogValue);
    if (deck.jogReadout !== jogText || deck.jogLimit !== jogLimit || deck.jogMode !== deck.mode) {
      deck.jogReadout = jogText; deck.jogLimit = jogLimit; deck.jogMode = deck.mode;
      refs.jog.setAttribute('aria-valuemin', scratchMode ? 0 : -jogLimit);
      refs.jog.setAttribute('aria-valuemax', jogLimit);
      refs.jog.setAttribute('aria-valuenow', jogValue.toFixed(2));
      refs.jog.setAttribute('aria-valuetext', jogText);
    }
    write(refs.rateText, percent(tempo));
    if (+refs.rate.value !== tempo) refs.rate.value = tempo;
    pressed(refs.lock, state.keyLock);
    if (deck.lastPlaying !== Boolean(state.playing)) {
      deck.lastPlaying = Boolean(state.playing);
      deck.root.classList.toggle('dd-playing', deck.lastPlaying);
      refs.play.innerHTML = icon(state.playing ? 'pause' : 'play', 20);
      refs.play.title = (state.playing ? 'Приостановить деку ' : 'Воспроизвести деку ') + id;
      refs.play.setAttribute('aria-label', refs.play.title);
    }
    const rotation = Math.round(((time % revolution) * 360 / revolution + deck.spin) * 10) / 10;
    if (deck.rotation !== rotation) {
      deck.rotation = rotation;
      refs.platter.style.transform = 'rotate(' + rotation + 'deg)';
    }
    write(refs.time, clock(time));
    write(refs.remaining, '−' + clock(duration - time));
    const second = Math.floor(time);
    if (deck.a11yTime !== second || deck.a11yDuration !== duration) {
      deck.a11yTime = second;
      deck.a11yDuration = duration;
      for (const control of [refs.wave, refs.scrub]) {
        control.setAttribute('aria-valuenow', String(second));
        control.setAttribute('aria-valuemax', String(Math.ceil(duration)));
        control.setAttribute('aria-valuetext', clock(time) + ' / ' + clock(duration));
      }
    }
    pressed(refs.loop, state.loopBeats > 0);
    if (state.loopBeats > 0 && Number(refs.length.value) !== state.loopBeats) refs.length.value = state.loopBeats;
    refs.pads.forEach((button, i) => {
      const at = state.hotCues?.[i];
      if (deck.padValues && deck.padValues[i] === at) return;
      const set = Number.isFinite(at);
      button.classList.toggle('dd-pad--set', set);
      const label = set ? 'Перейти к точке ' + (i + 1) + ' на ' + clock(at) + '. Для удаления нажмите с Shift или удерживайте.' : 'Поставить точку ' + (i + 1) + ' на деке ' + id;
      button.title = label;
      button.setAttribute('aria-label', label);
    });
    deck.padValues = [...(state.hotCues || [])];
    draw(deck, trackChanged);
  }

  window.DJDecks = { mount, render };
})();
