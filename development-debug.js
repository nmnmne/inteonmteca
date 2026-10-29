window.inteonDebugReady = (async () => {
  // Only the same-origin development server can grant diagnostics. Static hosts,
  // production, redirects and failed requests fail closed (even on localhost).
  document.documentElement.dataset.debugEnabled = 'false';
  document.documentElement.dataset.debugCompactOpen = 'false';
  try {
    const response = await fetch('/api/runtime', {cache: 'no-store', credentials: 'same-origin', redirect: 'error'});
    if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('application/json')) return false;
    if ((await response.json())?.debug !== true) return false;
  } catch { return false; }
  const compact = matchMedia('(max-width: 800px), (pointer: coarse)');
  let drawerOpen = false;
  // Debug is opt-in for this visit, never restored from another visit or tab.
  let enabled = false;
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
    .development-animation-menu button[aria-current="true"], .development-animation-menu button:hover, .development-animation-menu button:focus-visible { background: #bac48b22; }
    .development-animation-menu { scrollbar-color: #bac48b80 #bac48b0c; scrollbar-width: thin; }
    .development-animation-menu::-webkit-scrollbar { width: 5px; }
    .development-animation-menu::-webkit-scrollbar-track { background: #bac48b0c; border-radius: 8px; }
    .development-animation-menu::-webkit-scrollbar-thumb { background: #bac48b80; border-radius: 8px; border: 1px solid #101511; }
    .development-animation-menu::-webkit-scrollbar-thumb:hover { background: #bac48b; }
    .development-animation-menu button:disabled { opacity: .35; cursor: default; }
    @media (max-width: 800px), (pointer: coarse) {
      .development-debug-master { min-width: 66px; min-height: 36px; padding: 7px 10px; background: #101511e8; }
      html:not([data-debug-compact-open="true"]) [data-debug-element] { display: none !important; }
      .development-debug-toggle[data-debug-element] { min-height: 40px; padding: 8px 10px; background: #101511f5; }
      .development-animation-menu { box-sizing: border-box; width: min(340px, calc(100vw - 20px)); max-height: min(240px, calc(100dvh - 170px)); }
      .development-animation-menu button { min-height: 40px; }
    }
  `;
  document.head.append(style);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'development-debug-toggle development-debug-master';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', 'Отладка');
  const copy = document.querySelector('.hero-intro .topline');
  button.classList.add('development-debug-street');
  (document.querySelector('.room-toolbar') || document.body).append(button);
  const drawer = document.createElement('section');
  drawer.id = 'development-debug-panel'; drawer.hidden = true;
  drawer.setAttribute('aria-label', 'Отладка и эффекты');
  document.body.append(drawer);
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
  const quality = document.createElement('div');
  quality.className = 'development-quality'; quality.dataset.debugElement = '';
  quality.id = 'development-quality';
  quality.setAttribute('role', 'group'); quality.setAttribute('aria-label', 'Качество графики');
  const qualityCaption = document.createElement('div'); qualityCaption.className = 'development-quality-caption';
  const qualityLevel = document.createElement('span');
  const qualityStatus = document.createElement('span'); qualityStatus.className = 'development-quality-status';
  qualityCaption.append(qualityLevel, qualityStatus);
  const qualitySlider = document.createElement('input');
  qualitySlider.type = 'range'; qualitySlider.min = '1'; qualitySlider.max = '10'; qualitySlider.step = '1';
  qualitySlider.className = 'development-quality-slider';
  qualitySlider.setAttribute('aria-label', 'Уровень графики на одну минуту');
  quality.append(qualityCaption, qualitySlider);
  const qualityDetails = document.createElement('details');
  qualityDetails.className = 'development-quality-details';
  const qualitySummary = document.createElement('summary');
  qualitySummary.textContent = 'Кадры и устройство';
  const frameDetails = document.createElement('p');
  const hardwareDetails = document.createElement('p');
  const gpuDetails = document.createElement('p');
  gpuDetails.textContent = 'Адаптер WebGL ещё не проверен.';
  const gpuButton = document.createElement('button');
  gpuButton.type = 'button'; gpuButton.textContent = 'Проверить доступный GPU';
  const graphicsNote = document.createElement('p');
  graphicsNote.className = 'development-quality-note';
  graphicsNote.textContent = 'FPS относится к браузеру, не к передаче RDP. Главная рисуется через Canvas2D и CSS; их адаптер выбирает браузер. Проба WebGL не переключает Canvas2D.';
  qualityDetails.append(qualitySummary, frameDetails, hardwareDetails, gpuDetails, gpuButton, graphicsNote);
  quality.append(qualityDetails);
  const readGpu = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    let gl;
    try {
      const options = {powerPreference: 'default', antialias: false, depth: false, stencil: false};
      gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
      if (!gl) return 'недоступен';
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'WebGL доступен; название адаптера скрыто браузером';
    } catch { return 'проверка недоступна'; }
    finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
  };
  let gpuChecked = false;
  gpuButton.addEventListener('click', () => {
    if (gpuChecked) return;
    gpuChecked = true;
    gpuDetails.textContent = `Адаптер WebGL, выбранный браузером: ${readGpu()}`;
    gpuButton.textContent = 'Адаптер проверен'; gpuButton.disabled = true;
    // Creating diagnostic contexts must not skew the next quality decision.
    window.inteonGraphicsQuality?.recalibrate?.('gpu-probe');
  });
  let qualityDirty = true;
  const syncQuality = () => {
    if (!enabled || (compact.matches && !drawerOpen)) {
      qualityDirty = true;
      return;
    }
    qualityDirty = false;
    const controller = window.inteonGraphicsQuality;
    const level = controller?.level ?? 5;
    const manual = controller?.mode === 'manual';
    qualityLevel.textContent = `Графика ${level * 10}%`;
    qualityStatus.textContent = `${controller?.fps == null ? '—' : Math.round(controller.fps)} FPS · ${manual ? 'ручн.' : 'авто'}`;
    qualitySlider.value = String(level); qualitySlider.disabled = !controller;
    qualitySlider.style.setProperty('--quality-fill', `${level * 10}%`);
    qualitySlider.setAttribute('aria-valuetext', `${level} из 10, ${manual ? 'ручной выбор на минуту' : 'автоматически'}`);
    const sample = controller?.snapshot();
    const number = (value, suffix) => Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : '—';
    frameDetails.textContent = `В движении: ${number(sample?.activeFps, ' FPS')} · нижняя оценка: ${number(sample?.lowerTailFps, ' FPS')}\nДлинный кадр p95: ${number(sample?.p95FrameMs, ' мс')} · пропуски: ${number(sample?.missedFrameRatio * 100, '%')}\nОриентир частоты: ${number(sample?.cadenceFps, ' кадр/с')}`;
    hardwareDetails.textContent = `Поле: ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio}\nЛогических процессоров доступно браузеру: ${navigator.hardwareConcurrency || 'неизвестно'}`;
    quality.title = controller?.state === 'sampling' ? 'Измеряю кадры за 4 секунды; паузы не повышают графику'
      : manual ? 'Ручной уровень действует одну минуту' : 'Качество по кадрам в движении и просадкам: быстрое снижение, постепенное повышение';
  };
  qualitySlider.addEventListener('input', () => window.inteonGraphicsQuality?.setManualLevel(Number(qualitySlider.value)));
  window.addEventListener('inteon-quality-state', syncQuality);
  window.addEventListener('inteon-quality-change', syncQuality);
  syncQuality();
  const showEffects = open => {
    menu.hidden = !open;
    effectsButton.setAttribute('aria-expanded', String(open));
    effectsButton.textContent = open ? 'Эффекты лого ▴' : 'Эффекты лого ▾';
    quality.classList.toggle('development-quality-menu-open', open);
  };
  const closeDrawer = () => {
    drawerOpen = false;
    drawer.hidden = true;
    window.inteonPopups?.release(drawer);
    document.documentElement.dataset.debugCompactOpen = 'false';
    if (compact.matches) { button.setAttribute('aria-expanded', 'false'); button.textContent = 'debug'; }
    showEffects(false);
  };
  const popupOwner = event => event?.detail?.owner || event?.inteonPopupOwner || '';
  const publishPopup = (type, owner) => {
    const event = new Event(type);
    event.inteonPopupOwner = owner;
    window.dispatchEvent(event);
  };
  const requestPopupSpace = owner => {
    publishPopup('inteon-close-popups', owner);
    publishPopup('inteon-popup-open', owner);
  };
  const dismissDebug = () => {
    enabled = false;
    closeDrawer();
    sync();
  };
  window.addEventListener('inteon-close-popups', event => {
    if (popupOwner(event) === 'debug') return;
    dismissDebug();
  });
  window.addEventListener('inteon-popup-open', event => {
    if (popupOwner(event) !== 'debug') dismissDebug();
  });
  effectsButton.addEventListener('click', () => {
    const opening = menu.hidden;
    if (opening) requestPopupSpace('debug');
    showEffects(opening);
  });
  drawer.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {event.preventDefault(); event.stopPropagation(); showEffects(false); effectsButton.focus();}
  });
  if (copy) drawer.append(effectsButton, menu, quality);
  let materialReset = 0;
  const materialAnimations = () => (document.querySelector('#logo-wrap')?.getAnimations({subtree:true}) || [])
    .filter(a => a.animationName === 'logoContrastBreath');
  const resetEffects = async () => {
    clearTimeout(materialReset);
    const logoElement = document.querySelector('#logo-wrap');
    if (!logoElement) return;
    window.inteonMobileLogo?.stop();
    window.inteonLogoMaterials?.stop();
    delete logoElement.dataset.materialPreview;
    window.inteonThemeMorph?.finish();
    window.inteonLogoAcid?.stop(); window.inteonLogoStorm?.stop(); window.inteonAtmosphere?.stopScene();
    if (typeof renderLogoMatrix === 'function') renderLogoMatrix(true);
    logoElement.classList.remove('is-charging');
    logoElement.querySelector('.logo-particles')?.getAnimations({subtree:true}).forEach(a => { if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) a.finish(); });
    await Promise.resolve();
    if (typeof cancelLogoTimers === 'function') cancelLogoTimers();
    if (typeof logoLocked !== 'undefined') logoLocked = false;
    materialAnimations().forEach(a => { a.currentTime = 0; a.pause(); });
    materialReset = setTimeout(() => {
      delete logoElement.dataset.materialPreview;
      materialAnimations().forEach(a => { a.currentTime=0; a.play(); });
    }, 12000);
  };
  const entries = [
    ['Распад на кусочки', () => {
      if (compact.matches) { window.inteonMobileLogo?.run('scatter'); return; }
      renderLogoMatrix(false); logoParticles?.getAnimations({subtree:true}).forEach(a => { if (a instanceof CSSTransition) a.currentTime = 700; }); scheduleLogo(() => renderLogoMatrix(true), 4500); logoCycleTimeout = scheduleLogo(runLogoCycle, 9000);
    }],
    ['Растворение', () => { if (compact.matches) { window.inteonMobileLogo?.run('dissolve'); return; } window.inteonLogoAcid?.run({preview:true})?.then(() => { renderLogoMatrix(true); logoCycleTimeout = scheduleLogo(runLogoCycle, 5000); }); }],
    ['Разлёт и гроза', () => window.inteonLogoStorm?.replay()],
    ['Смена сцен', () => window.inteonAtmosphere?.replayScene({preview:true})],
    ['Облака', () => { window.inteonAtmosphere?.replayCloud({preview:true}); }],
    ['Рекурсия', () => { if (compact.matches) window.inteonMobileLogo?.run('recursion'); else window.inteonLogoMaterials?.run('recursion'); }],
  ];
  // Scatter, dissolve and recursion have compact implementations. Only the
  // full storm and scene choreography still require the wide composition.
  const desktopOnly = new Set(['Разлёт и гроза', 'Смена сцен']);
  const effectEntries = [];
  entries.forEach(([label, play]) => {
    const entry = document.createElement('button'); entry.type = 'button'; entry.textContent = label;
    effectEntries.push({entry, label});
    entry.addEventListener('click', async () => { if (entry.disabled) return; if (label !== 'Облака') await resetEffects(); menu.querySelectorAll('button').forEach(b => b.removeAttribute('aria-current')); entry.setAttribute('aria-current','true'); play(); }); menu.append(entry);
  });
  const syncEffectAvailability = () => effectEntries.forEach(({entry, label}) => {
    entry.disabled = compact.matches && desktopOnly.has(label);
    entry.title = entry.disabled ? 'Этот эффект доступен на широком экране' : '';
  });
  const place = () => {
    if (compact.matches) {
      button.style.left = '118px'; button.style.top = '4px';
    } else if (copy) {
      const rect = copy.getBoundingClientRect();
      button.style.left = `${Math.min(innerWidth - 100, rect.right + 14)}px`;
      button.style.top = `${Math.max(8, rect.top - 3)}px`;
    }
  };
  place();
  window.addEventListener('resize', place, {passive: true});
  document.fonts?.ready.then(place);
  const sync = () => {
    document.documentElement.dataset.debugEnabled = String(enabled);
    document.documentElement.dataset.debugCompactOpen = String(compact.matches && drawerOpen && enabled);
    button.setAttribute('role', compact.matches ? 'button' : 'switch');
    if (compact.matches) {
      button.removeAttribute('aria-checked');
      button.setAttribute('aria-expanded', String(drawerOpen && enabled));
      button.setAttribute('aria-controls', `${quality.id} ${menu.id}`);
      button.textContent = drawerOpen && enabled ? 'debug ×' : 'debug';
    } else {
      button.setAttribute('aria-checked', String(enabled));
      button.removeAttribute('aria-expanded'); button.removeAttribute('aria-controls');
      button.textContent = enabled ? 'debug on' : 'debug off';
    }
    syncEffectAvailability();
    drawer.hidden = !(enabled && (!compact.matches || drawerOpen));
    if (drawer.hidden) window.inteonPopups?.release(drawer);
    button.setAttribute('aria-controls', drawer.id);
    button.setAttribute('aria-expanded', String(!drawer.hidden));
    if (!enabled) showEffects(false);
    if (qualityDirty || enabled) syncQuality();
    window.dispatchEvent(new Event('inteon-debug-change'));
  };
  button.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('click', () => {
    const opening = compact.matches ? !drawerOpen : !enabled;
    if (opening) requestPopupSpace('debug');
    if (compact.matches) { drawerOpen = opening; enabled = true; if (!drawerOpen) showEffects(false); }
    else enabled = opening;
    sync();
    if (!drawer.hidden) window.inteonPopups?.open(drawer, button, dismissDebug);
  });
  compact.addEventListener('change', () => {dismissDebug(); place();});
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    enabled = false;
    closeDrawer();
    sync();
  });
  sync();
  return true;
})();
