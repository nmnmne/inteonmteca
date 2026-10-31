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
  const toggle = document.getElementById('mobile-chat-toggle');
  const oldSwitch = document.querySelector('.mobile-sections');
  if (oldSwitch) { oldSwitch.hidden = true; oldSwitch.inert = true; }
  const marker = document.createComment('desktop logo position');
  logo.parentNode.insertBefore(marker, logo);
  const stage = document.createElement('div');
  stage.id = 'mobile-visual-stage'; stage.className = 'mobile-visual-stage';
  stage.setAttribute('aria-hidden', 'true'); stage.hidden = true;
  document.body.append(stage);
  tracks.id = 'mobile-track-section';
  let layoutFrame = 0, keyboard = 0, collapsed = true, lastCollapsed;
  const originalSlots = playlist.style.getPropertyValue('--catalog-slots');
  const originalSlotsPriority = playlist.style.getPropertyPriority('--catalog-slots');
  const notifyChat = () => {
    const value = mobile.matches && collapsed;
    if (value === lastCollapsed) return;
    lastCollapsed = value;
    window.dispatchEvent(new CustomEvent('inteon-mobile-chat-change', {detail: {collapsed: value}}));
  };
  const requestCatalogFit = () => playlist.dispatchEvent(new Event('inteon-catalog-refit'));
  const minimumRowHeight = () => {
    const item = playlist.querySelector('.track-item');
    const button = item?.querySelector('.track-select');
    const meta = item?.querySelector('.track-meta');
    if (!button || !meta) return 48;
    const verticalSpace = element => {
      const style = getComputedStyle(element);
      return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
    };
    // Intrinsic typography, not a stretched grid box or an as-yet unmeasured
    // cover, determines the minimum. This prevents a size/refit feedback loop.
    const line = selector => {
      const el = meta.querySelector(selector); if (!el) return 0;
      const css = getComputedStyle(el);
      return parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2;
    };
    const gap = parseFloat(getComputedStyle(meta).rowGap) || 0;
    const content = line('.track-title') * 2 + line('.track-artist') + gap + verticalSpace(meta);
    return Math.ceil(Math.max(48, content + verticalSpace(button) + verticalSpace(item)));
  };
  const set = (name, value) => document.body.style.setProperty(name, `${value}px`);
  const setRaw = (name, value) => document.body.style.setProperty(name, String(value));
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
    const fullChatHeight = row * 5 + 6 + composerHeight;
    const collapsedHeight = 14;
    const chatHeight = collapsed ? collapsedHeight : fullChatHeight;
    const dockTop = Math.min(dock.getBoundingClientRect().top, visibleBottom - 76);
    let listTop, listHeight, chatTop, logoTop, logoWidth;
    if (sideBySide) {
      listTop = 94;
      listHeight = Math.max(140, dockTop - listTop - 6);
      chatTop = collapsed ? dockTop - 20 : Math.max(110, dockTop - fullChatHeight - 6);
      logoWidth = Math.min(innerWidth * .4, 360);
      logoTop = Math.max(72, (dockTop - fullChatHeight - 6) - logoWidth * .2004 - 14);
    } else if (tight) {
      // The keyboard can leave less room than five readable rows. Keep one
      // scrollable document instead of compressing labels into tiny text.
      chatTop = 10;
      listTop = chatTop + chatHeight + 6;
      listHeight = 190;
      logoTop = 0; logoWidth = 0;
      set('--mobile-document-height', listTop + listHeight + 90 + keyboard);
    } else {
      const baseListHeight = editing ? 190 : Math.round(Math.max(38, Math.min(56, innerHeight * .056)) * 5) + minimumRowHeight();
      if (collapsed) {
        chatTop = dockTop - 12 - baseListHeight - fullChatHeight;
        listTop = chatTop + collapsedHeight;
        listHeight = dockTop - 6 - listTop;
      } else {
        listHeight = baseListHeight;
        listTop = dockTop - 6 - listHeight;
        chatTop = listTop - 6 - chatHeight;
      }
      logoWidth = Math.min(innerWidth * .76, 520);
      // A top-anchored composition: its spacing does not grow with viewport height.
      logoTop = 132;
      if (!editing) {
        chatTop = logoTop + logoWidth * .2004 + 32;
        listTop = chatTop + chatHeight + (collapsed ? 0 : 6);
        listHeight = Math.max(48, dockTop - 6 - listTop);
      } else logoTop = 0;
    }
    set('--mobile-chat-row', row);
    set('--mobile-chat-top', Math.round(chatTop));
    set('--mobile-chat-height', chatHeight);
    set('--mobile-list-top', Math.round(listTop));
    set('--mobile-list-height', Math.round(listHeight));
    set('--mobile-logo-width', logoWidth);
    set('--mobile-stage-top', Math.round(logoTop));
    set('--mobile-stage-height', logoWidth * .2004);
    // Account for the actual two-line typography, padding and a readable row;
    // collapsed chat earns additional rows only when they genuinely fit.
    const slots = Math.max(1, Math.min(30, Math.floor(Math.round(listHeight) / minimumRowHeight())));
    setRaw('--mobile-catalog-slots', slots);
    playlist.style.setProperty('--catalog-slots', slots);
    set('--mobile-heading-top', sideBySide ? 57 : 90);
    set('--mobile-resident-top', sideBySide ? 90 : 86);
    requestCatalogFit();
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
    chat.classList.toggle('is-mobile-collapsed', active && collapsed);
    if (toggle) {
      toggle.hidden = !active;
      toggle.setAttribute('aria-expanded', String(active && !collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Развернуть чат' : 'Свернуть чат');
    }
    if (active && logo.parentNode !== stage) stage.append(logo);
    else if (!active && logo.parentNode === stage) marker.parentNode.insertBefore(logo, marker.nextSibling);
    if (!active || keyboard <= 100) {
      const wasScrolling = document.documentElement.classList.contains('mobile-keyboard-scroll');
      document.documentElement.classList.remove('mobile-keyboard-scroll');
      document.body.classList.remove('mobile-stage-tight-keyboard');
      if (wasScrolling) window.scrollTo?.(0, 0);
    }
    if (wasHidden && typeof openChat === 'function') openChat();
    notifyChat();
    if (active) fit();
    else {
      if (originalSlots) playlist.style.setProperty('--catalog-slots', originalSlots, originalSlotsPriority);
      else playlist.style.removeProperty('--catalog-slots');
      requestCatalogFit();
    }
  };
  toggle?.addEventListener('click', () => {
    if (!mobile.matches) return;
    collapsed = !collapsed;
    chat.classList.toggle('is-mobile-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Развернуть чат' : 'Свернуть чат');
    notifyChat();
    fit();
  });
  mobile.addEventListener('change', sync);
  landscape.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('pageshow', event => {if (event.persisted) {collapsed = true; sync();}});
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(dock);
  if (composer) observer.observe(composer);
  document.fonts?.ready.then(scheduleLayout);
  sync();
})();
