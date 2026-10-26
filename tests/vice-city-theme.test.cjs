const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const registry = source.slice(source.indexOf('const themeCoreFilters ='), source.indexOf('const populateThemeSelect ='));
const setter = source.slice(source.indexOf('const setTheme ='), source.indexOf('const randomizeTheme ='));
function fixture(morph = false) {
  const values = new Map(), stored = new Map(), calls = [];
  const root = {dataset: {theme: 'graphite'}, style: {setProperty: (key, value) => values.set(key, value)}};
  const sandbox = {document: {documentElement: root, body: {classList: {contains: () => false}}},
    window: {}, themeSelect: {}, themeStatus: {}, themeStorageKey: 'theme',
    storeValue: (key, value) => stored.set(key, value)};
  if (morph) sandbox.window.inteonThemeMorph = {apply: (...args) => calls.push(args)};
  vm.runInNewContext(registry + setter + '\nwindow.api={themeRegistry,themeNames,setTheme};', sandbox);
  return {...sandbox.window.api, root, values, stored, calls, select: sandbox.themeSelect};
}

test('Vice City enters the shared selector/cycle registry and morph controller', () => {
  const run = fixture(true), vice = run.themeRegistry.find(t => t.id === 'vice-city');
  assert.equal(vice.name, 'Vice City');
  assert.ok(run.themeNames.includes('vice-city'));
  run.setTheme('vice-city');
  assert.equal(run.calls[0][0], vice.tokens, 'uses the existing palette transition');
  assert.equal(run.calls[0][1], 'dark');
  assert.equal(run.calls[0][2], true);
  assert.equal(run.select.value, 'vice-city');
  assert.equal(run.stored.get('theme'), 'vice-city');
});

test('the neon theme retains readable text and accent contrast on its dark backdrop', () => {
  const vice = fixture().themeRegistry.find(t => t.id === 'vice-city').tokens;
  const luminance = rgb => rgb.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  const bg = luminance(vice['--theme-bg'].slice(1).match(/../g).map(n => parseInt(n, 16)));
  for (const key of ['--interface-ink', '--interface-muted', '--interface-accent']) {
    const foreground = luminance(vice[key].split(',').map(Number));
    assert.ok((foreground + .05) / (bg + .05) > 7, `${key} has strong contrast`);
  }
  assert.notEqual(vice['--theme-a-rgb'], vice['--theme-b-rgb'], 'magenta and cyan light sources differ');
});

test('leaving Vice City resets its interface colours even without the morph controller', () => {
  const run = fixture();
  run.setTheme('vice-city', {animate: false});
  assert.equal(run.values.get('--interface-accent'), '255, 134, 210');
  run.setTheme('graphite', {animate: false});
  const graphite = run.themeRegistry.find(t => t.id === 'graphite');
  for (const key of ['--interface-ink', '--interface-muted', '--interface-accent', '--interface-peach', '--interface-sage']) {
    assert.equal(run.values.get(key), graphite.tokens[key]);
  }
  assert.equal(run.root.dataset.theme, 'graphite');
});
