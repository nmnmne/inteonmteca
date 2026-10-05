const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('player is visible and disabled before a track is chosen, with no close control', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="active-player"[^>]*aria-hidden="false"/);
  assert.doesNotMatch(html, /id="close-track"/);
  for (const id of ['immersive-play', 'previous-track', 'next-track', 'track-progress', 'track-volume']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*disabled`));
  }
});
test('Escape without a dialog retains playback and the persistent panel', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const start = script.indexOf('const handlePanelKeydown =');
  const source = script.slice(start, script.indexOf('\n};', start) + 3);
  const context = {openPanels: [], immersiveState: {active: true}, event: {key:'Escape'}};
  vm.runInNewContext(source + '\nhandlePanelKeydown(event);', context);
  assert.equal(context.immersiveState.active, true);
});
test('player controls never trigger the global track picker', () => {
  let picks = 0;
  const handlers = {};
  const item = { getAttribute: key => key === 'data-track-index' ? '0' : 'Track', classList: { contains: () => false } };
  const window = { INTEONMTECA_PLAYLIST: [{ title: 'Track', audio: 'a.mp3' }], inteonPlayTrack: () => picks++ };
  const document = {
    addEventListener: (name, handler) => handlers[name] = handler,
    elementsFromPoint: () => [{ closest: () => item }],
    getElementById: () => null,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'track-play.js'), 'utf8'), { window, document, Date });
  for (const name of ['pointerdown', 'click']) {
    handlers[name]({ button: 0, clientX: 100, clientY: 100, target: {
      closest: selector => selector.includes('.active-player') ? {} : null,
    } });
  }
  assert.equal(picks, 0);
});
test('a pixel-quantized wheel stops its RAF instead of running forever near the target', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const start = script.indexOf('const animatePlaylistScroll =');
  const source = script.slice(start, script.indexOf('\n};', start) + 3);
  let top = 10;
  const context = {
    playlistList: {get scrollTop(){return top}, set scrollTop(value){top=Math.round(value)}, scrollHeight:1000, clientHeight:100},
    playlistScrollTarget:10.8, playlistScrollVelocity:0.1, playlistScrollRaf:42, playlistPointerCarry:0,
    balanceInfiniteWheel(){}, pointerPlaylistNudge:()=>0,
    requestAnimationFrame:()=>{throw new Error('Wheel failed to settle')},
  };
  vm.runInNewContext(source + '\nanimatePlaylistScroll();', context);
  assert.equal(context.playlistScrollRaf,0);
  assert.equal(top,11);
});
