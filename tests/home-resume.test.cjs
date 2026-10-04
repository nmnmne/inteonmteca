const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const start = script.indexOf('  if (player && options.shared) {');
const end = script.indexOf('  if (player && src && options.shared?.paused)', start);
const restore = script.slice(start, end);
test('selecting an audio-only playlist entry keeps its actual index', () => {
  const tracks = [{audio:'a.flac'}, {audio:'b.flac'}];
  const context = {tracks, track:tracks[1], currentTrackIndex:-1};
  const begin = script.indexOf('  currentTrackIndex = tracks.findIndex');
  const finish = script.indexOf('  if (currentTrackIndex < 0',begin);
  vm.runInNewContext(script.slice(begin,finish),context);
  assert.equal(context.currentTrackIndex,1);
});
function setup() {
  let callback;
  const player = { readyState: 0, currentTime: 0, duration: 120,
    addEventListener: (name, cb) => { callback = cb; }, removeEventListener() {} };
  const context = { player, requestId: 1, playbackRequestId: 1, pendingPlaybackSeek: null, options: { shared: { time: 42, paused: true } } };
  vm.runInNewContext(restore, context);
  return { context, metadata: () => callback() };
}
test('home restore cannot seek a subsequently selected track', () => {
  const {context, metadata} = setup();
  context.playbackRequestId = 2;
  metadata();
  assert.equal(context.player.currentTime, 0);
});
test('home keeps shared time while metadata is pending', () => {
  const {context, metadata} = setup();
  const saves = [];
  context.window = {inteonPlayback: {save: player => saves.push(player.currentTime)}};
  context.currentTrack = {audio:'test.flac'};
  context.playbackStamp = '';
  const s = script.indexOf('const rememberPlayback =');
  vm.runInNewContext(script.slice(s,script.indexOf('\n};',s)+3)+'\nrememberPlayback();',context);
  assert.deepEqual(saves, []);
  metadata();
  vm.runInNewContext('rememberPlayback();', context);
  assert.deepEqual(saves, [42]);
});
