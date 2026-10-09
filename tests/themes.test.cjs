// Run with: node tests/themes.test.cjs (no packages, browser or network needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(source.includes('const themeRegistry ='), 'embedded registry exists');
const registry = source.slice(source.indexOf('const themeCoreFilters ='), source.indexOf('const themeStorageKey ='));
const behavior = source.slice(source.indexOf('const themeSliderToDuration ='), source.indexOf('themeHint?.addEventListener'));
const element = () => ({ children: [], value: '', append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } });
const select = element();
const properties = new Map();
const stored = new Map();
const documentElement = { dataset: { theme: 'desert' }, style: { setProperty: (key, value) => properties.set(key, value) } };
let scheduled;
const sandbox = { document: { documentElement, createElement: element }, themeSelect: select, themeStatus: {},
  themeDuration: { value: '500' }, themeDurationOutput: {}, prefersReducedMotion: true,
  themeStorageKey: 'inteonmteca-theme', themeDurationStorageKey: 'inteonmteca-theme-duration',
  THEME_MIN_MS: 4000, THEME_MAX_MS: 604800000, THEME_DEFAULT_MS: 8000,
  themeShiftTimer: 0, themeRotationTimer: 0,
  window: { clearTimeout() {}, setTimeout(fn) { scheduled = fn; return 1; } },
  storeValue: (key, value) => stored.set(key, value), readStoredValue: key => stored.get(key),
  Math: Object.create(Math) };
vm.createContext(sandbox);
vm.runInContext(`${registry}\n${behavior}\nglobalThis.api = { themeRegistry, themeNames, setTheme, randomizeTheme, initializeThemeSystem };`, sandbox);
const api = sandbox.api;
assert.equal(api.themeRegistry.length, 9);
assert.equal(new Set(api.themeNames).size, 9);
assert.equal(new Set(api.themeRegistry.map(t => t.name)).size, 9);
assert.equal(new Set(api.themeRegistry.map(t => JSON.stringify(t.tokens))).size, 9);
assert.equal(api.themeRegistry.filter(t => t.mood === 'light').length, 2);
const luminance = hex => {
  const c = hex.match(/[a-f\d]{2}/gi).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
for (const theme of api.themeRegistry) {
  assert.match(theme.id, /^[a-z][a-z-]*$/);
  assert.match(theme.name, /^[а-яё][а-яё -]*$/u);
  assert.ok(!Object.values(theme.tokens).includes('grayscale(1)'), `${theme.id} stays in color`);
  assert.notEqual(theme.tokens['--theme-fog-blur'], '32px');
  assert.equal(Object.keys(theme.tokens).length, 11);
  for (const key of Object.keys(theme.tokens)) assert.ok(css.includes(`var(${key})`), `CSS consumes ${key}`);
  api.setTheme(theme.id, { animate: false });
  assert.equal(documentElement.dataset.theme, theme.id);
  assert.equal(select.value, theme.id);
  assert.equal(stored.get('inteonmteca-theme'), theme.id);
  for (const [key, value] of Object.entries(theme.tokens)) assert.equal(properties.get(key), value);
  const bg = theme.tokens['--theme-bg'];
  const text = '#' + theme.tokens['--theme-text-rgb'].split(',').map(x => Number(x).toString(16).padStart(2, '0')).join('');
  assert.ok((Math.max(luminance(text), luminance(bg)) + .05) / (Math.min(luminance(text), luminance(bg)) + .05) >= 7, `${theme.id}: text contrast`);
  api.initializeThemeSystem();
  assert.equal(documentElement.dataset.theme, theme.id, 'persisted IDs restore');
}
assert.equal(select.children.length, 9);
assert.deepEqual(select.children.map(o => o.value).sort(), Array.from(api.themeNames).sort());
const reachable = new Set();
for (let i = 0; i < 8; i++) {
  api.setTheme('graphite');
  sandbox.Math.random = () => (i + .5) / 8;
  api.randomizeTheme();
  assert.notEqual(documentElement.dataset.theme, 'graphite');
  reachable.add(documentElement.dataset.theme);
}
assert.equal(reachable.size, 8, 'random picker reaches every other theme');
api.setTheme('abyss'); sandbox.Math.random = () => 0; api.randomizeTheme();
assert.equal(documentElement.dataset.theme, 'graphite');
stored.set('inteonmteca-theme', 'missing'); api.initializeThemeSystem();
assert.equal(documentElement.dataset.theme, 'graphite');
const before = documentElement.dataset.theme; scheduled();
assert.notEqual(documentElement.dataset.theme, before, 'rotation advances');
assert.match(html, /<select[^>]+id="theme-select"/);
assert.match(source, /themeSelect\?\.addEventListener\("change", \(\) => \{\s*setTheme\(themeSelect.value\)/);
assert.match(source, /themeRandom\?\.addEventListener\("click", \(\) => \{\s*randomizeTheme\(\)/);
for (const pseudo of ['before', 'after']) {
  const block = css.split(`.logo-wrap.release-logo::${pseudo} {`)[1].split('}')[0];
  assert.ok(!block.includes('clip-path'));
  assert.ok(block.includes('radial-gradient'));
}
console.log('PASS: nine unique flat palettes, persistence and readable tokens');
