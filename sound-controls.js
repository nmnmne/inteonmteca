(() => {
  'use strict';
  const filter = window.InteonSoundFilter;
  const trigger = document.querySelector('[data-sound-open]');
  if (!filter || !trigger) return;

  const controls = document.createElement('section');
  controls.className = 'sound-editor settings-block';
  controls.setAttribute('aria-label', 'Обработка звука');
  controls.innerHTML = `
    <div class="sound-editor-head">
      <h3>Обработка звука</h3>
      <label class="sound-switch">
        <input id="sound-enabled" type="checkbox" role="switch" aria-label="Обработка звука">
        <span class="sound-switch-track" aria-hidden="true"></span>
        <span class="sound-switch-value" aria-hidden="true"></span>
      </label>
    </div>
    <div class="sound-preset-row">
      <label for="sound-preset">Пресет</label>
      <select id="sound-preset"></select>
    </div>`;

  const preset = controls.querySelector('#sound-preset');
  for (const { id, label } of filter.presets) preset.add(new Option(label, id));
  const custom = new Option('Свои настройки', 'custom');
  custom.disabled = true;
  preset.add(custom);
  const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const formatGain = value => (value > 0 ? '+' : '') + format.format(value).replace('-', '−') + ' дБ';
  const ranges = [
    ['frequency', 'Частота ВЧ-фильтра', 2000, 14000, 100, value => format.format(value / 1000) + ' кГц'],
    ['treble', 'Высокие частоты', -12, 12, 0.5, formatGain],
    ['bass', 'Бас', -12, 12, 0.5, formatGain],
    ['compression', 'Компрессия', 0, 100, 1, value => format.format(value) + ' %'],
  ].map(([key, label, min, max, step, display]) => {
    const row = document.createElement('div');
    row.className = 'sound-range';
    row.innerHTML = `<label for="sound-${key}">${label}</label><output for="sound-${key}"></output>
      <input id="sound-${key}" type="range" min="${min}" max="${max}" step="${step}">`;
    const input = row.querySelector('input');
    // Editing a control auditions it immediately, including from bypass.
    const adjust = () => filter.setSettings({ [key]: input.valueAsNumber, enabled: true });
    input.addEventListener('input', adjust);
    input.addEventListener('change', adjust);
    controls.append(row);
    return { key, input, output: row.querySelector('output'), display };
  });

  const enabled = controls.querySelector('#sound-enabled');
  enabled.addEventListener('change', () => filter.setSettings({ enabled: enabled.checked }));
  preset.addEventListener('change', () => filter.applyPreset(preset.value));
  function render() {
    const settings = filter.getSettings();
    enabled.checked = settings.enabled;
    controls.querySelector('.sound-switch-value').textContent = settings.enabled ? 'Вкл' : 'Выкл';
    preset.value = settings.preset;
    trigger.dataset.soundActive = String(settings.enabled);
    for (const { key, input, output, display } of ranges) {
      const value = settings[key];
      input.value = value;
      output.value = display(value);
      input.setAttribute('aria-valuetext', output.value);
    }
  }

  window.InteonSoundControls = { editor: () => controls };
  window.addEventListener('inteon:sound-settings', render);
  render();

  // DJ Studio hosts the editor alongside its existing output and controller settings.
  if (trigger.id === 'settings-open') return;
  const dialog = document.createElement('dialog');
  dialog.id = 'sound-dialog';
  dialog.setAttribute('aria-labelledby', 'sound-title');
  dialog.innerHTML = `<header class="sound-heading"><h2 id="sound-title">Настройки звука</h2>
    <button class="sound-close" type="button" aria-label="Закрыть настройки звука">×</button></header>`;
  dialog.append(controls);
  document.body.append(dialog);
  trigger.addEventListener('click', () => {
    window.inteonPopups?.dismiss(false);
    if (document.pointerLockElement) document.exitPointerLock();
    dialog.showModal();
  });
  dialog.querySelector('.sound-close').addEventListener('click', () => dialog.close());
  // Let the controls handle their keys while the modal owns focus in the courtyard.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  trigger.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
      dialog.close();
  });
})();
