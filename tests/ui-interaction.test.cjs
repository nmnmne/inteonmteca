const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
test('artist labels never flicker', () => {
  assert.doesNotMatch(styles, /animation:\s*artistFlicker/);
});
test('hover alone cannot scroll the playlist', () => {
  const context = { playlistList: {}, trackViewport: { getBoundingClientRect: () => ({ left: 0, right: 600, top: 0, bottom: 500, height: 500 }) },
    draggingScroll: null, pointerState: { active: true, x: 300, y: 450 }, performance: { now: () => 5000 }, playlistPointerLockUntil: 0 };
  assert.equal(vm.runInNewContext(functionSource('pointerPlaylistNudge') + '\npointerPlaylistNudge();', context), 0);
  assert.match(script, /trackViewport\?\.addEventListener\("wheel"/);
});
test('panels move focus in, restore opener and expose expanded state', () => {
  for (const name of ['auth', 'theme']) {
    const context = panelFixture();
    const panel = context[`${name}Panel`], opener = context[`${name}Hint`];
    opener.focus();
    vm.runInNewContext(`setPanelOpen(${name}Panel, true);`, context);
    assert.equal(context.document.activeElement, panel.input);
    assert.equal(opener['aria-expanded'], 'true');
    assert.equal(panel['aria-hidden'], 'false');
    assert.equal(context.bodyClasses.has(`is-${name}-menu-open`), true);
    vm.runInNewContext(`setPanelOpen(${name}Panel, false);`, context);
    assert.equal(context.document.activeElement, opener);
    assert.equal(opener['aria-expanded'], 'false');
    assert.equal(panel['aria-hidden'], 'true');
    assert.equal(context.bodyClasses.has(`is-${name}-menu-open`), false);
    assert.equal(context.openPanels.length, 0);
  }
});
test('auth and theme replace each other; a repeated trigger closes its own panel', () => {
  const context = panelFixture();
  for (const name of ['theme', 'auth', 'theme']) {
    context[`${name}Hint`].focus();
    context.handlers[name]();
    const other = name === 'theme' ? 'auth' : 'theme';
    assert.equal(context[`${name}Panel`].hidden, false);
    assert.equal(context[`${other}Panel`].hidden, true);
    assert.equal(context[`${name}Hint`]['aria-expanded'], 'true');
    assert.equal(context[`${other}Hint`]['aria-expanded'], 'false');
    assert.equal(context.openPanels.length, 1, 'only one popup is open');
    assert.equal(context.document.activeElement, context[`${name}Panel`].input);
    assert.equal(context.chatPanel.hidden, false, 'public inline chat remains available');
  }
  context.themeHint.focus();
  context.handlers.theme();
  assert.equal(context.themePanel.hidden, true);
  assert.equal(context.openPanels.length, 0);
  assert.equal(context.document.activeElement, context.themeHint);
});
test('Escape closes the current popup and restores focus without interrupting playback', () => {
  const context = panelFixture();
  context.immersiveState = { active: true };
  context.authHint.focus();
  context.handlers.auth();
  let prevented = 0;
  context.event = { key: 'Escape', preventDefault() { prevented++; } };
  vm.runInNewContext(functionSource('handlePanelKeydown') + '\nhandlePanelKeydown(event);', context);
  assert.equal(context.authPanel.hidden, true);
  assert.equal(context.themePanel.hidden, true);
  assert.equal(context.document.activeElement, context.authHint);
  assert.equal(context.openPanels.length, 0);
  assert.equal(context.immersiveState.active, true);
  assert.equal(context.chatPanel.hidden, false);
  assert.equal(prevented, 1);
  vm.runInNewContext('handlePanelKeydown(event);', context);
  assert.equal(prevented, 1, 'Escape without a popup is left to the page');
  assert.ok(!script.includes('if (event.key === "Escape") exitImmersiveMode();'), 'no competing Escape listener');
});
test('controls have a shared 44px hit area and visible keyboard focus', () => {
  const rule = styles.match(/\/\* Usability: control targets[\s\S]*$/)?.[0] || '';
  for (const selector of ['.auth-hint', '.chat-hint', '.theme-hint', '.transport-play', '.transport-skip', '.theme-close', '.chat-close', '.immersive-back']) {
    assert.ok(rule.includes(selector), `${selector} covered by target rule`);
  }
  assert.ok(/min-height: 44px/.test(rule));
  assert.ok(/:focus-visible[\s\S]*outline: 2px solid/.test(rule));
});
test('panel triggers declare their controls before JavaScript loads', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const name of ['auth', 'theme']) {
    const tag = html.match(new RegExp(`<button[^>]+id="${name}-hint"[^>]*>`))?.[0] || '';
    assert.ok(tag.includes(`aria-controls="${name}-panel"`), name);
    assert.ok(tag.includes('aria-expanded="false"'), name);
  }
  const slider = html.match(/<input[^>]+id="mobile-section-slider"[^>]*>/)?.[0] || '';
  assert.ok(slider.includes('aria-controls="mobile-track-section chat-panel"'));
  assert.ok(slider.includes('aria-label="Треки или чат"'));
  assert.ok(slider.includes('aria-valuetext="Треки"'));
});
test('a late chat response cannot steal focus or restart polling after close', () => {
  const source = functionSource('openChat');
  assert.ok(source.indexOf('if (focus)') < source.indexOf('await loadChat()'));
  assert.ok(/await loadChat\(\);\s*if \(chatPanel\?\.hidden\) return;/.test(source));
});
function functionSource(name) {
  const start = script.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `${name} exists`);
  return script.slice(start, script.indexOf('\n};', start) + 3);
}
function panelFixture() {
  const bodyClasses = new Set(), handlers = {}, nodes = {};
  const document = { activeElement: null, querySelector: () => null, getElementById: id => nodes[id], body: {
    classList: { toggle: (name, active) => active ? bodyClasses.add(name) : bodyClasses.delete(name) },
  } };
  const context = { document, bodyClasses, handlers, openPanels: [], panelOpeners: new WeakMap(),
    chatPanel: { hidden: false }, inlineChat: true, compactChatViewport: { matches: false },
    sessionEmail: '', setAuthStatus() {}, closeChat() { throw Error('Opening a popup must preserve the desktop inline chat'); } };
  for (const name of ['auth', 'theme']) {
    const opener = { isConnected: true, 'aria-expanded': 'false',
      focus() { document.activeElement = opener; },
      setAttribute(k, v) { this[k] = v; },
      addEventListener(event, fn) { if (event === 'click') handlers[name] = fn; } };
    const input = { focus() { document.activeElement = input; } };
    const panel = { id: `${name}-panel`, hidden: true, style: {}, input,
      setAttribute(k, v) { this[k] = v; }, querySelector: () => input, contains: el => el === input };
    nodes[`${name}-hint`] = opener;
    context[`${name}Hint`] = opener;
    context[`${name}Panel`] = panel;
    context[name === 'auth' ? 'authEmail' : 'themeSelect'] = input;
  }
  vm.runInNewContext(functionSource('setPanelOpen'), context);
  for (const name of ['auth', 'theme']) {
    const start = script.indexOf(`${name}Hint?.addEventListener("click"`);
    assert.ok(start >= 0, `${name} trigger exists`);
    vm.runInNewContext(script.slice(start, script.indexOf('\n});', start) + 4), context);
  }
  return context;
}
test('visible wheel tracks remain sharp at every position', () => {
  const cards = [];
  const items = [0, 100, 200, 300, 400].map(top => {
    const card = { style: {} }; cards.push(card);
    return { style: {}, querySelector: () => card, classList: { contains: () => false },
      matches: () => false, getBoundingClientRect: () => ({ top, bottom: top + 100, height: 100 }) };
  });
  const context = { playlistList: { getBoundingClientRect: () => ({ top: 0, height: 500, bottom: 500 }), querySelectorAll: () => items },
    TRACK_VIEW: 5, trackItemNodes: items, currentTrack: null, immersiveState: { active: false }, player: null,
    spectrumState: { bass: 0, flux: 0, high: 0 }, trackPlayBlend: 0 };
  vm.runInNewContext(functionSource('updateTrackFold') + '\nupdateTrackFold();', context);
  for (const item of items) assert.ok(item.style.filter === 'none' || parseFloat(item.style.filter.slice(5)) <= 0.25, item.style.filter);
  assert.ok(cards.some(card => card.style.transform.includes('rotateX')), 'wheel depth is preserved');
});
