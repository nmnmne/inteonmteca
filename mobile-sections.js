/* One mobile page: wordmark, five chat rows, composer, five tracks and transport. */
(() => {
  const mobile = matchMedia('(max-width: 800px) and (min-height: 501px), (max-width: 500px), (pointer: coarse) and (max-height: 500px)');
  const landscape = matchMedia('(pointer: coarse) and (min-width: 501px) and (max-height: 500px)');
  const chat = document.getElementById('chat-panel');
  const tracks = document.querySelector('.release-content');
  const logo = document.getElementById('logo-wrap');
  const dock = document.getElementById('active-player');
  const playlist = tracks?.querySelector('.playlist-shell');
  if (!chat || !tracks || !logo || !dock || !playlist) return;
  const composer = chat.querySelector('.chat-compose');
  const oldSwitch = document.querySelector('.mobile-sections');
  if (oldSwitch) { oldSwitch.hidden = true; oldSwitch.inert = true; }
  const marker = document.createComment('desktop logo position');
  logo.parentNode.insertBefore(marker, logo);
  const stage = document.createElement('div');
  stage.id = 'mobile-visual-stage'; stage.className = 'mobile-visual-stage';
  stage.setAttribute('aria-hidden', 'true'); stage.hidden = true;
  document.body.append(stage);
  tracks.id = 'mobile-track-section';
  let layoutFrame = 0, keyboard = 0;
  const set = (name, value) => document.body.style.setProperty(name, `${value}px`);
  const fit = () => {
    layoutFrame = 0;
    if (!mobile.matches) return;
    const viewport = window.visualViewport;
    const visibleBottom = viewport ? Math.min(innerHeight, viewport.offsetTop + viewport.height) : innerHeight;
    const editing = keyboard > 100;
    const sideBySide = landscape.matches && !editing;
    const tight = editing && visibleBottom < 400;
    document.documentElement.classList.toggle('mobile-keyboard-scroll', tight);
    document.body.classList.toggle('mobile-stage-tight-keyboard', tight);
    const row = innerHeight < 650 || editing ? 14 : 16;
    const composerHeight = composer?.getBoundingClientRect().height || 36;
    const chatHeight = row * 5 + 6 + composerHeight;
    const dockTop = Math.min(dock.getBoundingClientRect().top, visibleBottom - 76);
    let listTop, listHeight, chatTop, logoTop, logoWidth;
    if (sideBySide) {
      listTop = 94;
      listHeight = Math.max(140, dockTop - listTop - 6);
      chatTop = Math.max(172, dockTop - chatHeight - 6);
      logoWidth = Math.min(innerWidth * .4, 360);
      logoTop = Math.max(72, chatTop - logoWidth * .2004 - 14);
    } else if (tight) {
      // The keyboard can leave less room than five readable rows. Keep one
      // scrollable document instead of compressing labels into tiny text.
      chatTop = 10;
      listTop = chatTop + chatHeight + 6;
      listHeight = 190;
      logoTop = 0; logoWidth = 0;
      set('--mobile-document-height', listTop + listHeight + 90 + keyboard);
    } else {
      listHeight = editing ? 190 : Math.round(Math.max(38, Math.min(56, innerHeight * .056)) * 5);
      listTop = dockTop - 6 - listHeight;
      chatTop = listTop - 6 - chatHeight;
      logoWidth = Math.min(innerWidth * .76, 520);
      const logoHeight = logoWidth * .2004;
      logoTop = Math.min(innerHeight * .355 - logoHeight / 2, chatTop - logoHeight - 10);
      if (editing) logoTop = 0;
    }
    set('--mobile-chat-row', row);
    set('--mobile-chat-top', Math.round(chatTop));
    set('--mobile-chat-height', chatHeight);
    set('--mobile-list-top', Math.round(listTop));
    set('--mobile-list-height', Math.round(listHeight));
    set('--mobile-logo-width', logoWidth);
    set('--mobile-stage-top', Math.round(logoTop));
    set('--mobile-stage-height', logoWidth * .2004);
    set('--mobile-heading-top', sideBySide ? 57 : Math.max(70, Math.min(innerHeight * .185, logoTop - 36)));
    set('--mobile-resident-top', sideBySide ? 118 : Math.max(90, chatTop + 12));
  };
  const scheduleLayout = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(fit);
  };
  const sync = () => {
    const active = mobile.matches;
    const wasHidden = chat.hidden;
    chat.hidden = false; chat.inert = false; tracks.inert = false; playlist.inert = false;
    delete document.body.dataset.mobileSection;
    document.body.classList.remove('mobile-section-dragging');
    document.body.style.setProperty('--mobile-section-progress', '0');
    const viewport = window.visualViewport;
    keyboard = active && viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
    set('--mobile-keyboard', keyboard);
    document.body.classList.toggle('has-mobile-visual-stage', active);
    document.body.classList.toggle('mobile-stage-keyboard', active && keyboard > 100);
    stage.hidden = !active;
    if (active && logo.parentNode !== stage) stage.append(logo);
    else if (!active && logo.parentNode === stage) marker.parentNode.insertBefore(logo, marker.nextSibling);
    if (!active || keyboard <= 100) {
      const wasScrolling = document.documentElement.classList.contains('mobile-keyboard-scroll');
      document.documentElement.classList.remove('mobile-keyboard-scroll');
      document.body.classList.remove('mobile-stage-tight-keyboard');
      if (wasScrolling) window.scrollTo?.(0, 0);
    }
    if (wasHidden && typeof openChat === 'function') openChat();
    scheduleLayout();
  };
  mobile.addEventListener('change', sync);
  landscape.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(dock);
  if (composer) observer.observe(composer);
  document.fonts?.ready.then(scheduleLayout);
  sync();
})();
