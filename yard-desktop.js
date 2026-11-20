/* Application windows over the live courtyard. The audio engine stays mounted across views. */
(() => {
  'use strict';
  const studio = document.querySelector('#studio.room-console');
  if (!studio) return;

  const body = document.body;
  const names = {dj: 'DJ-пульт', engrus: 'Eng-Rus'};
  const actions = (app, targetMode) => `<div class="yard-window-actions" role="group" aria-label="Окно ${names[app]}">
    ${targetMode ? `<button type="button" class="yard-win-action yard-layout-action" data-dj-mode="${targetMode}"
      aria-label="${targetMode === 'full' ? 'Развернуть полный DJ-пульт' : 'Вернуть компактный плеер'}"
      title="${targetMode === 'full' ? 'Полный DJ-пульт' : 'Компактный плеер'}"><i aria-hidden="true"></i></button>` : ''}
    <button type="button" class="yard-win-action" data-window-action="minimize" data-app="${app}"
      aria-label="Свернуть ${names[app]}" title="Свернуть ${names[app]}"><span aria-hidden="true">−</span></button>
    <button type="button" class="yard-win-action" data-window-action="close" data-app="${app}"
      aria-label="Закрыть ${names[app]}" title="Закрыть ${names[app]}"><span aria-hidden="true">×</span></button>
  </div>`;
  studio.querySelector('.console-tools').insertAdjacentHTML('beforeend', actions('dj', 'compact'));
  const compactAction = studio.querySelector('[data-dj-mode=compact]');
  compactAction.hidden = true;
  const shell = document.createElement('div');
  shell.id = 'yard-desktop-shell';
  shell.innerHTML = `<header class="yard-system-panel">
    <span class="yard-system-name"><i aria-hidden="true"></i><span id="yard-view-title">Рабочий стол</span></span>
    <time id="yard-system-clock"></time>
    <button type="button" class="yard-source" popovertarget="yard-map-sources"
      aria-label="Источники карты двора" title="Источники карты двора">© OpenStreetMap</button>
  </header>
  <nav class="yard-app-dock" aria-label="Приложения">
    <button type="button" data-launch="dj" data-running="true" aria-controls="studio" aria-label="Открыть DJ-пульт">
      <span class="yard-app-icon yard-dj-icon" aria-hidden="true"><i></i></span><span>DJ-пульт</span></button>
    <button type="button" data-launch="engrus" data-running="false" aria-controls="yard-engrus-window" aria-label="Открыть Eng-Rus">
      <img class="yard-app-icon" src="assets/eng-rus-app.webp" alt="" width="46" height="46"><span>Eng-Rus</span></button>
  </nav>`;
  const cards = document.createElement('section');
  cards.id = 'yard-engrus-window';
  cards.setAttribute('aria-labelledby', 'yard-engrus-title');
  cards.tabIndex = -1;
  cards.hidden = true;
  cards.innerHTML = `<header class="yard-app-titlebar"><h1 id="yard-engrus-title">Eng-Rus</h1>${actions('engrus')}</header>
    <div id="yard-engrus-content"></div>`;
  body.append(shell, cards);
  const launchers = Object.fromEntries([...shell.querySelectorAll('[data-launch]')].map(button => [button.dataset.launch, button]));
  const appContent = cards.querySelector('#yard-engrus-content');
  const viewTitle = shell.querySelector('#yard-view-title');
  const clock = shell.querySelector('time');
  const clockFormat = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  const lastFocus = {full: studio.querySelector('#import'), compact: null, engrus: cards};
  let view = 'dj', djMode = 'full', compact, mounted = false, keyboard = false;
  let idleTimer = 0, clockTimer = 0, lastActivity = 0;
  const idleDelay = 20000;

  function updateClock() {
    clearTimeout(clockTimer);
    if (document.hidden) return;
    const visibleClock = view === 'dj'
      ? (djMode === 'compact' ? compact?.querySelector('time[data-yard-clock]') : null)
      : clock;
    if (!visibleClock) return;
    const now = new Date();
    visibleClock.dateTime = now.toISOString();
    visibleClock.textContent = clockFormat.format(now);
    clockTimer = setTimeout(updateClock, 60000 - now.getTime() % 60000);
  }

  function checkIdle() {
    idleTimer = 0;
    if (view === 'dj' || document.hidden || (keyboard && shell.contains(document.activeElement)) ||
        document.querySelector('#yard-map-sources:popover-open')) return;
    const remaining = idleDelay - (performance.now() - lastActivity);
    if (remaining > 0) idleTimer = setTimeout(checkIdle, remaining);
    else shell.dataset.idle = 'true';
  }

  function wake() {
    if (view === 'dj' || document.hidden) return;
    lastActivity = performance.now();
    delete shell.dataset.idle;
    if (!idleTimer) idleTimer = setTimeout(checkIdle, idleDelay);
  }

  function dismissOverlays() {
    for (const panel of document.querySelectorAll(':popover-open')) panel.hidePopover();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    for (const close of document.querySelectorAll('#auth-panel:not([hidden]) .auth-close, #theme-panel:not([hidden]) .theme-close')) close.click();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function stopDJ() {
    const engine = window.DJEngine;
    if (!engine) return;
    const state = engine.snapshot();
    if (state.recording) engine.toggleRecording();
    for (const id of ['A', 'B']) {
      // Suppress a scratch gesture's pending resume before releasing the platter.
      if (state[id].playing) engine.toggle(id);
      if (state[id].scratching) engine.endScratch(id);
    }
  }

  function notify(app, visible, action) {
    window.dispatchEvent(new CustomEvent('yard-app-visibility', {detail: {app, visible, action}}));
  }

  function selectView(next) {
    view = next;
    body.dataset.yardWindow = next;
    studio.inert = next !== 'dj' || djMode === 'compact';
    if (compact) compact.hidden = next !== 'dj' || djMode !== 'compact';
    cards.hidden = next !== 'engrus';
    shell.hidden = next === 'dj';
    viewTitle.textContent = names[next] || 'Рабочий стол';
    for (const [app, button] of Object.entries(launchers)) button.setAttribute('aria-expanded', String(next === app));
    clearTimeout(idleTimer);
    idleTimer = 0;
    updateClock();
    wake();
  }

  function hideApp(app, action) {
    if (view !== app) return;
    dismissOverlays();
    if (app === 'dj' && action === 'close') stopDJ();
    if (action === 'close') launchers[app].dataset.running = 'false';
    selectView('desktop');
    notify(app, false, action);
    launchers[app].focus({preventScroll: true});
  }

  function openApp(app) {
    if (view !== app) {
      dismissOverlays();
      if (view !== 'desktop') notify(view, false, 'minimize');
      selectView(app);
      if (app === 'engrus' && !mounted && window.YardEngRus) {
        window.YardEngRus.mount(appContent);
        mounted = true;
      }
      launchers[app].dataset.running = 'true';
      notify(app, true, 'open');
    }
    focusApp();
  }

  function focusApp() {
    const focus = lastFocus[view === 'dj' ? djMode : view];
    const fallback = view === 'engrus' ? cards : djMode === 'full' ? studio.querySelector('#import') : compact.querySelector('[data-dj-mode=full]');
    (focus?.isConnected && focus.getClientRects().length ? focus : fallback)?.focus({preventScroll: true});
  }

  function setDJMode(mode) {
    if (!compact || view !== 'dj' || !['compact','full'].includes(mode)) return;
    dismissOverlays();
    body.dataset.djMode = djMode = mode;
    selectView('dj');
    window.dispatchEvent(new CustomEvent('yard-dj-mode', {detail: {mode}}));
  }

  function connectCompact() {
    if (compact) return;
    const surface = document.querySelector('#yard-dj-compact');
    const tools = surface?.querySelector('[data-dj-window-tools]');
    if (!tools) return;
    compact = surface;
    compactAction.hidden = false;
    tools.insertAdjacentHTML('beforeend', actions('dj','full'));
    setDJMode('compact');
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-dj-mode], [data-window-action], .yard-app-dock [data-launch]');
    if (!button) return;
    if (button.dataset.djMode) { setDJMode(button.dataset.djMode); focusApp(); }
    else if (button.dataset.launch) openApp(button.dataset.launch);
    else hideApp(button.dataset.app, button.dataset.windowAction);
  });
  document.addEventListener('pointerdown', () => { keyboard = false; wake(); }, {capture: true, passive: true});
  for (const type of ['pointermove', 'touchstart', 'wheel']) {
    document.addEventListener(type, wake, {capture: true, passive: true});
  }
  document.addEventListener('keydown', () => { keyboard = true; wake(); }, true);
  document.addEventListener('focusin', event => {
    const surface = view === 'engrus' ? cards : djMode === 'full' ? studio : compact;
    if (view !== 'desktop' && !event.target.closest('.yard-window-actions') && surface?.contains(event.target))
      lastFocus[view === 'dj' ? djMode : view] = event.target;
    wake();
  });
  shell.addEventListener('focusout', wake);
  document.querySelector('#yard-map-sources')?.addEventListener('toggle', wake);
  document.addEventListener('visibilitychange', () => {
    clearTimeout(idleTimer);
    idleTimer = 0;
    updateClock();
    wake();
  });
  selectView('dj');
  body.dataset.djMode = djMode;
  connectCompact();
  window.addEventListener('yard-dj-compact-ready', connectCompact);
})();
