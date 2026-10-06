(async () => {
  if (!await window.inteonDebugReady) return;
  const panel = document.createElement('section');
  panel.className = 'yard-debug';
  panel.dataset.debugElement = '';
  panel.setAttribute('aria-label', 'Отладка положения');
  panel.innerHTML = '<strong>debug / pose</strong><textarea readonly aria-label="Координаты и направление взгляда" spellcheck="false"></textarea><button type="button">Скопировать позицию и взгляд</button><span role="status"></span>';
  document.body.append(panel);
  const field = panel.querySelector('textarea');
  const status = panel.querySelector('[role="status"]');
  const round = n => Number(n.toFixed(4));
  const snapshot = () => {
    const yard = window.__yard;
    if (!yard) return null;
    const {body, camera} = yard;
    const direction = camera.getWorldDirection(camera.position.clone());
    return JSON.stringify({scene: 'yard', units: 'meters',
      position: {x: round(body.x), y: round(camera.position.y), z: round(body.z)},
      look: {yaw: round(body.yaw), pitch: round(body.pitch), angleUnit: 'radians'},
      direction: {x: round(direction.x), y: round(direction.y), z: round(direction.z)}}, null, 2);
  };
  const update = () => {
    if (document.hidden || document.documentElement.dataset.debugEnabled !== 'true' || document.activeElement === field) return;
    field.value = snapshot() || 'Загрузка сцены…';
  };
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  panel.addEventListener('pointermove', event => event.stopPropagation());
  panel.querySelector('button').addEventListener('click', async () => {
    const text = snapshot();
    if (!text) return;
    field.value = text;
    try { await navigator.clipboard.writeText(text); status.textContent = 'Скопировано'; }
    catch { field.focus(); field.select(); status.textContent = 'Нажми Ctrl+C или скопируй выделенный текст'; }
  });
  const timer = setInterval(update, 250);
  window.addEventListener('pagehide', () => clearInterval(timer), {once: true});
  update();
})();
