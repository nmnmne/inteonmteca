const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const functionSource = name => {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n};', start) + 3);
};

test('repeated transport updates preserve text wrappers and write only changed playback values', () => {
  const writes = [];
  const makeElement = name => {
    const attrs = new Map(), css = new Map();
    const element = {
      textContent: '', title: '', value: '', disabled: false, wrappedChildren: {},
      getAttribute: key => attrs.get(key),
      setAttribute(key, value) { writes.push(`${name}:attr:${key}`); attrs.set(key, value); },
      style: {getPropertyValue: key => css.get(key), setProperty(key, value) { writes.push(`${name}:style:${key}`); css.set(key, value); }},
      dataset: new Proxy({}, {set(target, key, value) { writes.push(`${name}:data:${key}`); target[key] = value; return true; }}),
    };
    return new Proxy(element, {set(target, key, value) {
      writes.push(`${name}:${key}`);
      if (key === 'textContent') target.wrappedChildren = null;
      target[key] = value; return true;
    }});
  };
  const classes = new Set();
  const context = vm.createContext({
    player: {paused: false, ended: false, error: null, readyState: 4, currentTime: 10, duration: 100},
    currentTrack: {title: 'Original title'}, tracks: [{}, {}], volumeSupported: true,
    document: {activeElement: null, body: {classList: {
      contains: name => classes.has(name),
      toggle(name, enabled) { writes.push(`body:${name}`); if (enabled) classes.add(name); else classes.delete(name); },
    }}}, rememberPlayback() {},
  });
  for (const name of ['activePlayer', 'playerCaption', 'immersivePlay', 'previousTrack', 'nextTrack',
    'trackProgress', 'trackVolume', 'currentTime', 'durationTime', 'immersivePlayIcon', 'nowPlayingTitle']) context[name] = makeElement(name);
  context.trackProgress.parentElement = makeElement('seekParent');
  vm.runInContext(['formatTime', 'writeTransportProperty', 'writeTransportAttribute', 'writeTransportSeek', 'syncTransport'].map(functionSource).join('\n'), context);
  vm.runInContext('syncTransport();', context);
  assert.equal(context.playerCaption.textContent, 'Сейчас играет');
  assert.equal(context.currentTime.textContent, '0:10');
  assert.equal(context.durationTime.textContent, '1:40');
  const captionWrapper = {};
  context.playerCaption.wrappedChildren = captionWrapper;
  writes.length = 0;
  vm.runInContext('syncTransport();', context);
  assert.deepEqual(writes, [], 'identical timeupdate events have zero DOM mutations');
  context.player.currentTime = 10.5;
  vm.runInContext('syncTransport();', context);
  assert.equal(context.playerCaption.wrappedChildren, captionWrapper);
  assert.ok(!writes.some(write => write.endsWith(':textContent')), 'subsecond updates preserve every decorated text node');
  assert.equal(context.trackProgress.value, '105');
  assert.equal(context.trackProgress.style.getPropertyValue('--seek'), '10.50%');
  writes.length = 0;
  context.player.currentTime = 11;
  vm.runInContext('syncTransport();', context);
  assert.equal(context.currentTime.textContent, '0:11');
  assert.deepEqual(writes.filter(write => write.endsWith(':textContent')), ['currentTime:textContent']);
  assert.equal(context.trackProgress.getAttribute('aria-valuetext'), '0:11 из 1:40');
  context.player.paused = true;
  vm.runInContext('syncTransport();', context);
  assert.equal(context.playerCaption.textContent, 'Пауза');
  assert.equal(context.immersivePlay.getAttribute('aria-label'), 'Воспроизвести');
  assert.equal(context.activePlayer.dataset.state, 'paused');
  assert.ok(!classes.has('is-signal'));
});
