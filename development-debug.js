window.inteonDebugReady = (async () => {
  try {
    const response = await fetch('/api/runtime', {cache: 'no-store'});
    if (!response.ok || (await response.json()).debug !== true) return false;
  } catch { return false; }
  const key = 'inteonmteca-debug-enabled';
  let enabled = true;
  try { enabled = localStorage.getItem(key) !== '0'; } catch {}
  const style = document.createElement('style');
  style.textContent = `
    html[data-debug-enabled="false"] [data-debug-element] { display: none !important; }
    .development-debug-toggle { display: inline-flex; align-items: center; gap: 6px; margin-left: 14px; padding: 4px 7px; border: 1px solid #bac48b55; border-radius: 4px; background: #10151180; color: #bac48b; font: 10px/1.2 Consolas, monospace; letter-spacing: 0; cursor: pointer; pointer-events: auto; vertical-align: middle; }
    .development-debug-toggle::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .35; }
    .development-debug-toggle[aria-checked="true"]::before { opacity: 1; box-shadow: 0 0 5px currentColor; }
    .development-debug-toggle[aria-checked="false"] { color: #aaa; }
    .development-debug-street { position: fixed; top: 12px; left: 12px; z-index: 61; margin: 0; }
    .development-animation-menu { position: fixed; z-index: 61; width: 215px; max-height: min(210px, 45vh); overflow-y: auto; padding: 7px; border: 1px solid #bac48b55; border-radius: 6px; background: #101511ed; scrollbar-width: thin; }
    .development-animation-menu button { display: block; width: 100%; padding: 8px; border: 0; border-radius: 3px; background: transparent; color: #dce4cc; text-align: left; font: 11px/1.4 Consolas, monospace; cursor: pointer; }
    .development-animation-menu button:hover, .development-animation-menu button:focus-visible { background: #bac48b22; }
    .development-animation-menu { scrollbar-color: #bac48b80 #bac48b0c; scrollbar-width: thin; }
    .development-animation-menu::-webkit-scrollbar { width: 5px; }
    .development-animation-menu::-webkit-scrollbar-track { background: #bac48b0c; border-radius: 8px; }
    .development-animation-menu::-webkit-scrollbar-thumb { background: #bac48b80; border-radius: 8px; border: 1px solid #101511; }
    .development-animation-menu::-webkit-scrollbar-thumb:hover { background: #bac48b; }
    @media (max-width: 800px), (pointer: coarse) { .development-debug-toggle, [data-debug-element] { display: none !important; } }
  `;
  document.head.append(style);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'development-debug-toggle';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', 'Отладка');
  const copy = document.querySelector('.hero-intro .topline');
  button.classList.add('development-debug-street');
  document.body.append(button);
  const menu = document.createElement('nav');
  menu.className = 'development-animation-menu'; menu.dataset.debugElement = '';
  menu.setAttribute('aria-label', 'Повтор анимаций');
  menu.id = 'development-animation-menu'; menu.hidden = true;
  const effectsButton = document.createElement('button'); effectsButton.type = 'button';
  effectsButton.className = 'development-debug-toggle development-debug-street';
  effectsButton.dataset.debugElement = '';
  effectsButton.textContent = 'Эффекты лого ▾';
  effectsButton.setAttribute('aria-controls', menu.id);
  effectsButton.setAttribute('aria-expanded', 'false');
  const showEffects = open => {
    menu.hidden = !open;
    effectsButton.setAttribute('aria-expanded', String(open));
    effectsButton.textContent = open ? 'Эффекты лого ▴' : 'Эффекты лого ▾';
  };
  effectsButton.addEventListener('click', () => showEffects(menu.hidden));
  if (copy) document.body.append(effectsButton, menu);
  const resetEffects = async () => {
    window.inteonLogoAcid?.stop(); window.inteonLogoStorm?.stop(); window.inteonAtmosphere?.stop();
    await Promise.resolve();
    if (typeof logoTimers !== 'undefined') { logoTimers.forEach(clearTimeout); logoTimers.clear(); }
    if (typeof logoLocked !== 'undefined') logoLocked = false;
  };
  const cssReplay = (selector, pseudo = '') => {
    const element = document.querySelector(selector);
    if (!element) return;
    const animations = element.getAnimations({subtree: true}).filter(animation => !pseudo || animation.animationName === 'logo-darkness');
    animations.forEach(animation => { animation.cancel(); animation.play(); });
  };
  const entries = [
    ['Распад на кусочки', () => { renderLogoMatrix(false); scheduleLogo(() => renderLogoMatrix(true), 4500); logoCycleTimeout = scheduleLogo(runLogoCycle, 9000); }],
    ['Кислотное растворение', () => { window.inteonLogoAcid?.run()?.then(() => { renderLogoMatrix(true); logoCycleTimeout = scheduleLogo(runLogoCycle, 5000); }); }],
    ['Разлёт и гроза', () => window.inteonLogoStorm?.replay()],
    ['Смена сцен', () => window.inteonAtmosphere?.replayScene()],
    ['Облака', () => window.inteonAtmosphere?.replayCloud()],
    ['Тушь вокруг логотипа', () => cssReplay('#logo-wrap', '::before')],
    ['Растворение букв', () => cssReplay('#logo-vector')],
    ['Дыхание логотипа', () => cssReplay('#reactive-logo')],
  ];
  entries.forEach(([label, play]) => {
    const entry = document.createElement('button'); entry.type = 'button'; entry.textContent = label;
    entry.addEventListener('click', async () => { await resetEffects(); play(); }); menu.append(entry);
  });
  const place = () => {
    if (!copy) return;
    const rect = copy.getBoundingClientRect();
    button.style.left = `${rect.right + 14}px`;
    button.style.top = `${rect.top - 3}px`;
    effectsButton.style.left = `${rect.right + 14}px`; effectsButton.style.top = `${rect.top + 25}px`;
    menu.style.left = `${rect.right + 14}px`; menu.style.top = `${rect.top + 53}px`;
  };
  place();
  window.addEventListener('resize', place, {passive: true});
  document.fonts?.ready.then(place);
  const sync = () => {
    document.documentElement.dataset.debugEnabled = String(enabled);
    button.setAttribute('aria-checked', String(enabled));
    button.textContent = enabled ? 'debug on' : 'debug off';
    if (!enabled) showEffects(false);
    window.dispatchEvent(new Event('inteon-debug-change'));
  };
  button.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? '1' : '0'); } catch {}
    sync();
  });
  window.addEventListener('storage', event => {
    if (event.key === key) { enabled = event.newValue !== '0'; sync(); }
  });
  sync();
  return true;
})();
