(() => {
  'use strict';

  const storeKey = 'inteonmteca.dj.midi.v1';
  const routes = new Map();
  const held = new Set();
  const pending = new Map();
  const actions = new Map();
  let access, port, preferred, dialog, ui, learning = false, requesting = false, frame = 0;
  const engine = () => window.DJEngine;
  const centered = raw => raw < 64 ? (raw - 64) / 64 : (raw - 64) / 63;
  const bind = (id, group, label, continuous, run) => actions.set(id, { group, label, continuous, run });
  bind('cross', 'Микшер', 'Кроссфейдер', true, n => engine().setCross(centered(n)));
  bind('master', 'Микшер', 'Громкость мастера', true, n => engine().setMaster(n / 127));
  for (const id of ['A', 'B']) {
    const group = 'Дека ' + id;
    const add = (name, label, continuous, run) => bind(id + '.' + name, group, label, continuous, run);
    add('play', 'Пуск / пауза', false, () => engine().toggle(id));
    add('cue', 'Cue', false, () => engine().cue(id));
    add('sync', 'Sync', false, () => engine().sync(id));
    add('loop', 'Петля на 4 доли', false, () => engine().loop(id, engine().snapshot()[id].loopBeats ? 0 : 4));
    add('monitor', 'Предпрослушивание', false, () => engine().setMonitor(id, !engine().snapshot()[id].monitor));
    add('keylock', 'Key Lock', false, () => engine().setKeyLock(id, !engine().snapshot()[id].keyLock));
    for (let n = 1; n <= 8; n++) add('pad' + n, 'Hot Cue ' + n, false, () => engine().hotCue(id, n));
    add('channel', 'Громкость канала', true, n => engine().setChannel(id, n / 127));
    add('tempo', 'Темп ±50%', true, n => engine().setTempo(id, centered(n) * 50));
    add('filter', 'Фильтр', true, n => engine().setFilter(id, centered(n)));
    add('echo', 'Эхо', true, n => engine().setEcho(id, n / 127));
    for (const [band, name] of [['low', 'Низкие'], ['mid', 'Средние'], ['high', 'Высокие']]) {
      add(band, name + ' частоты', true, n => engine().setEQ(id, band, centered(n) * (n < 64 ? 24 : 12)));
    }
  }

  const routeKey = ({ device, channel, type, number }) => JSON.stringify([device, channel, type, number]);
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey));
    if (typeof saved?.device === 'string') preferred = saved.device;
    for (const row of saved?.routes || []) {
      if (!row || !actions.has(row.action) || typeof row.device !== 'string' ||
          !Number.isInteger(row.channel) || row.channel < 1 || row.channel > 16 ||
          !['note', 'cc'].includes(row.type) || !Number.isInteger(row.number) || row.number < 0 || row.number > 127 ||
          (actions.get(row.action).continuous && row.type !== 'cc')) continue;
      routes.set(routeKey(row), row);
    }
  } catch { /* A private session still supports temporary mappings. */ }

  function save() {
    try {
      localStorage.setItem(storeKey, JSON.stringify({ device: preferred, routes: [...routes.values()] }));
      return true;
    } catch { return false; }
  }

  const forAction = id => [...routes.values()].find(row => row.device === port?.id && row.action === id);
  const describe = row => (row.type === 'cc' ? 'CC ' : 'Нота ') + row.number + ' · канал ' + row.channel;

  window.addEventListener('dj-load', ({detail}) => {
    for (const action of pending.keys()) {
      if (action.startsWith(detail.id + '.')) pending.delete(action);
    }
  });

  function refreshAction() {
    const row = forAction(ui.action.value);
    ui.binding.textContent = row ? 'Назначено: ' + describe(row) : 'Назначение отсутствует.';
    ui.action.disabled = !port;
    ui.learn.disabled = !port;
    ui.learn.textContent = learning ? 'Отменить ожидание' : 'Назначить контроллер';
    ui.clear.disabled = !row || learning;
  }

  function flush() {
    frame = 0;
    const latest = [...pending];
    pending.clear();
    for (const [action, value] of latest) actions.get(action).run(value);
  }

  function onMessage(event) {
    if (!port || event.data.length < 3 || !engine()) return;
    const [status, number, value] = event.data, kind = status >> 4;
    if (kind !== 8 && kind !== 9 && kind !== 11) return;
    if (kind === 11 && number >= 120) return;
    const type = kind === 11 ? 'cc' : 'note';
    const row = { device: port.id, channel: (status & 15) + 1, number, type };
    const key = routeKey(row);
    const pressed = kind !== 8 && value > 0;
    const repeat = held.has(key);
    if (pressed) held.add(key);
    else held.delete(key);
    if (learning) {
      if (type === 'note' && (!pressed || repeat)) return;
      const id = ui.action.value;
      if (actions.get(id).continuous && type !== 'cc') {
        ui.status.textContent = 'Для этого параметра поверните ручку или переместите фейдер MIDI CC.';
        return;
      }
      const previous = forAction(id);
      if (previous) routes.delete(routeKey(previous));
      routes.set(key, { ...row, action: id });
      learning = false;
      ui.status.textContent = save() ? 'Назначение сохранено.' : 'Назначение действует до закрытия вкладки.';
      refreshAction();
      return;
    }
    const action = routes.get(key)?.action;
    if (!action) return;
    if (actions.get(action).continuous) {
      // A controller can send several values per frame. The audio engine ramps
      // AudioParams between updates; keep only the latest sample for each fader.
      pending.set(action, value);
      if (document.hidden) flush();
      else if (!frame) frame = requestAnimationFrame(flush);
    } else if (pressed && !repeat) {
      actions.get(action).run();
    }
  }

  function refreshPorts() {
    if (!access) return;
    const inputs = [...access.inputs.values()].filter(input => input.state !== 'disconnected');
    const chosen = preferred === undefined ? inputs[0] : inputs.find(input => input.id === preferred);
    if (port !== chosen) {
      if (port) port.onmidimessage = null;
      port = chosen;
      held.clear();
      pending.clear();
      learning = false;
      if (port) port.onmidimessage = onMessage; // Assigning this listener opens the input.
    }
    ui.device.replaceChildren(new Option(inputs.length ? 'Выключен' : 'Устройства не найдены', ''));
    for (const input of inputs) ui.device.add(new Option(input.name || input.manufacturer || 'MIDI-вход', input.id));
    ui.device.value = port?.id || '';
    ui.device.disabled = !inputs.length;
    ui.connect.hidden = true;
    ui.status.textContent = !inputs.length ? 'Подключите MIDI-контроллер. Он появится в списке.' :
      port ? 'Вход подключён.' : 'Выберите MIDI-вход.';
    refreshAction();
  }

  async function connect() {
    if (access || requesting || !navigator.requestMIDIAccess) return;
    requesting = true;
    ui.connect.disabled = true;
    ui.status.textContent = 'Ожидание доступа к MIDI…';
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      access.onstatechange = refreshPorts;
      refreshPorts();
    } catch (error) {
      ui.status.textContent = error.name === 'NotAllowedError' || error.name === 'SecurityError' ?
        'Браузер заблокировал MIDI. Разрешите доступ в настройках сайта и повторите подключение.' :
        'Не удалось подключиться к MIDI. Проверьте устройство и повторите попытку.';
    } finally {
      requesting = false;
      ui.connect.disabled = false;
    }
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'midi-dialog';
    dialog.setAttribute('aria-labelledby', 'midi-title');
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="midi-title">MIDI Learn</h2>
      <button type="button" class="icon-btn" id="midi-close" aria-label="Закрыть MIDI Learn">×</button></div>
      <div class="dialog-body"><div class="settings-block">
      <label for="midi-device">MIDI-вход</label><select id="midi-device" disabled><option>Выключен</option></select>
      <button type="button" class="action-button" id="midi-connect">Подключить MIDI</button>
      <p role="status" id="midi-status"></p></div><div class="settings-block">
      <label for="midi-action">Действие пульта</label><select id="midi-action"></select>
      <p id="midi-binding"></p><button type="button" class="action-button" id="midi-learn"></button>
      <button type="button" class="action-button" id="midi-clear">Снять назначение</button></div></div>`;
    document.body.append(dialog);
    ui = Object.fromEntries(['device', 'connect', 'status', 'action', 'binding', 'learn', 'clear', 'close']
      .map(id => [id, dialog.querySelector('#midi-' + id)]));
    let group;
    for (const [id, action] of actions) {
      if (action.group !== group?.label) {
        group = document.createElement('optgroup');
        group.label = action.group;
        ui.action.append(group);
      }
      group.append(new Option(action.label, id));
    }
    ui.close.onclick = () => dialog.close();
    ui.connect.onclick = connect;
    ui.device.onchange = () => {
      preferred = ui.device.value;
      save();
      refreshPorts();
    };
    ui.action.onchange = () => {
      learning = false;
      ui.status.textContent = '';
      refreshAction();
    };
    ui.learn.onclick = () => {
      learning = !learning;
      ui.status.textContent = !learning ? 'Ожидание отменено.' : actions.get(ui.action.value).continuous ?
        'Поверните ручку или переместите фейдер MIDI CC.' : 'Нажмите кнопку или пэд на контроллере.';
      refreshAction();
    };
    ui.clear.onclick = () => {
      const row = forAction(ui.action.value);
      if (row) routes.delete(routeKey(row));
      ui.status.textContent = save() ? 'Назначение снято.' : 'Назначение снято в текущей вкладке.';
      refreshAction();
    };
    dialog.addEventListener('close', () => { learning = false; });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }

  window.DJMidi = {
    open() {
      if (!dialog) build();
      if (access) refreshPorts();
      else {
        ui.connect.disabled = !navigator.requestMIDIAccess || requesting;
        ui.status.textContent = !navigator.requestMIDIAccess ?
          'Web MIDI недоступен. Откройте студию по HTTPS в браузере с поддержкой MIDI.' :
          'Подключите контроллер и разрешите сайту доступ к MIDI-входу.';
        refreshAction();
      }
      if (!dialog.open) dialog.showModal();
    },
  };
})();
