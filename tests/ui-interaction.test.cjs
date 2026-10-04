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
  let focused = null;
  const opener = { isConnected: true, focus: () => { focused = opener; }, setAttribute: (k, v) => { opener[k] = v; } };
  const input = { focus: () => { focused = input; } };
  const panel = { id: 'theme-panel', hidden: true, style: {}, setAttribute() {}, querySelector: () => input, contains: el => el === input };
  const document = { activeElement: opener, getElementById: () => opener };
  const context = { document, panel, openPanels: [], panelOpeners: new WeakMap() };
  vm.runInNewContext(functionSource('setPanelOpen') + '\nsetPanelOpen(panel, true);', context);
  assert.equal(focused, input);
  assert.equal(opener['aria-expanded'], 'true');
  document.activeElement = input;
  vm.runInNewContext('setPanelOpen(panel, false);', context);
  assert.equal(focused, opener);
  assert.equal(opener['aria-expanded'], 'false');
});
test('Escape closes only the latest panel before immersive playback', () => {
  const theme = { hidden: false }, auth = { hidden: false }, chat = { hidden: true };
  const context = { openPanels: [theme, auth], chatPanel: chat, immersiveState: { active: true },
    setPanelOpen: p => { p.hidden = true; context.openPanels.pop(); }, closeChat: () => {},
    exitImmersiveMode: () => { context.immersiveState.active = false; } };
  context.event = { key: 'Escape', preventDefault() {} };
  vm.runInNewContext(functionSource('handlePanelKeydown') + '\nhandlePanelKeydown(event);', context);
  assert.equal(auth.hidden, true); assert.equal(theme.hidden, false); assert.equal(context.immersiveState.active, true);
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
  for (const name of ['auth', 'chat', 'theme']) {
    const tag = html.match(new RegExp(`<button[^>]+id="${name}-hint"[^>]*>`))?.[0] || '';
    assert.ok(tag.includes(`aria-controls="${name}-panel"`), name);
    assert.ok(tag.includes('aria-expanded="false"'), name);
  }
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
