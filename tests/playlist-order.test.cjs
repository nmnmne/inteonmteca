const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../opening-track.js'), 'utf8');
const tracks = ['before', 'media/Memphis/Матт - Memphis.flac', 'next', 'last'].map(audio => ({audio}));
const ids = tracks => Array.from(tracks, track => track.audio);
const math = Object.create(Math);
math.random = () => .28;
function visit(localStorage) {
  const window = {};
  vm.runInNewContext(source, {window, localStorage, Math: math});
  return window.CourtyardOpening.order;
}

test('a new visit changes the opening song even if the random draw repeats', () => {
  const store = new Map();
  const storage = {getItem: key => store.get(key), setItem: (key, value) => store.set(key, value)};
  const first = ids(visit(storage)(tracks));
  const again = visit(storage);
  const second = ids(again(tracks));
  assert.notEqual(first[0], second[0]);
  assert.deepEqual(ids(again(tracks.toReversed())), second);
  assert.deepEqual(new Set(second), new Set(ids(tracks)));
});

test('changing metadata, filtering and importing preserve the existing neighbours', () => {
  const order = visit();
  const before = ids(order(tracks));
  const refreshed = tracks.toReversed().map(track => ({...track, artist: 'Матт'}));
  const expanded = ids(order([...refreshed, {id:'new', audio:'imported'}]));
  assert.deepEqual(expanded.filter(id => id !== 'imported'), before);
  const subset = order(refreshed.filter(track => track.audio !== before[2]));
  assert.deepEqual(ids(subset), before.filter(id => id !== before[2]));
  assert.equal(subset[0].artist, 'Матт');
});
