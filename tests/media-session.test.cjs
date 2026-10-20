const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../media-session.js'), 'utf8');

function setup({ supported = true, limited = false } = {}) {
  const actions = {};
  const events = {};
  const session = {
    setActionHandler(action, handler) {
      if (limited && action === 'seekbackward') throw new Error('Unsupported action');
      actions[action] = handler;
    },
    setPositionState(state) { this.position = state; },
  };
  const window = { addEventListener() {}, MediaMetadata: function(data) { Object.assign(this, data); } };
  vm.runInNewContext(source, { window, navigator: supported ? { mediaSession: session } : {} });
  const audio = {
    paused: true, ended: false, currentTime: 12, duration: 120, playbackRate: 1,
    addEventListener(name, callback) { events[name] = callback; },
  };
  let track = null;
  let plays = 0;
  const controller = window.inteonMediaSession.bind({
    audio, getTrack: () => track,
    play: () => { plays++; audio.paused = false; events.play(); },
    pause: () => { audio.paused = true; events.pause(); },
    next: () => { track = { title: 'Next', artist: 'Other', audio: 'next.flac' }; controller.sync(); },
    previous: () => { track = { title: 'Previous', audio: 'prev.flac' }; controller.sync(); },
  });
  return { session, actions, audio, events, controller, plays: () => plays,
    select(value = { title: 'Трек', artist: 'Матт', audio: 'track.flac' }) { track = value; controller.sync(); } };
}

test('remote commands keep metadata, playback state and selection in sync', () => {
  const s = setup();
  assert.equal(s.session.metadata, null);
  assert.equal(s.actions.play, null);
  s.select();
  assert.equal(s.session.metadata.title, 'Трек');
  assert.equal(s.session.metadata.artist, 'Матт');
  s.actions.play();
  s.actions.play();
  assert.equal(s.plays(), 1, 'play is idempotent');
  assert.equal(s.session.playbackState, 'playing');
  s.actions.pause();
  s.actions.pause();
  assert.equal(s.session.playbackState, 'paused');
  s.actions.nexttrack();
  assert.equal(s.session.metadata.title, 'Next');
  s.actions.previoustrack();
  assert.equal(s.session.metadata.title, 'Previous');
  assert.equal(s.session.metadata.artist, '');
  s.select(null);
  assert.equal(s.session.metadata, null);
  assert.equal(s.session.playbackState, 'none');
  assert.equal(s.session.position, undefined);
  assert.ok(Object.values(s.actions).every(value => value === null));
});

test('seeking clamps positions and clears invalid duration/rate without breaking playback', () => {
  const s = setup();
  s.select();
  s.actions.seekto({ seekTime: 150 });
  assert.equal(s.audio.currentTime, 120);
  s.actions.seekbackward({ seekOffset: 200 });
  assert.equal(s.audio.currentTime, 0);
  s.actions.seekforward({});
  assert.equal(s.audio.currentTime, 10);
  s.actions.seekto({ seekTime: NaN });
  assert.equal(s.audio.currentTime, 10);
  s.audio.playbackRate = 1.5;
  s.events.ratechange();
  assert.equal(s.session.position.playbackRate, 1.5);
  s.actions.play();
  s.actions.stop();
  assert.equal(s.audio.currentTime, 0);
  assert.equal(s.session.playbackState, 'paused');
  s.audio.duration = NaN;
  s.events.emptied();
  assert.equal(s.session.position, undefined);
  s.actions.seekto({ seekTime: 60 });
  assert.equal(s.audio.currentTime, 0);
});

test('missing or partially supported Media Session leaves other controls usable', () => {
  const absent = setup({ supported: false });
  assert.doesNotThrow(() => absent.select());
  const limited = setup({ limited: true });
  limited.select();
  assert.equal(limited.actions.seekbackward, undefined);
  limited.actions.nexttrack();
  assert.equal(limited.session.metadata.title, 'Next');
});
