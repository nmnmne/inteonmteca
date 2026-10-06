const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const start = source.indexOf('const themeCoreFilters =');
const end = source.indexOf('const themeStorageKey', start);
assert.ok(start >= 0 && end > start);
const themes = vm.runInNewContext(source.slice(start, end) + '\nthemeRegistry;');
assert.equal(themes.length, 20);
assert.equal(themes.filter(t => t.mood === 'color').length, 16);
assert.equal(new Set(themes.map(t => t.group)).size, 10);
for (const group of new Set(themes.map(t => t.group))) assert.equal(themes.filter(t => t.group === group).length, 2);
assert.equal(themes.filter(t => t.group === 'мрачные').length, 2);
assert.equal(new Set(themes.map(t => t.id)).size, 20);
assert.equal(new Set(themes.map(t => t.name)).size, 20);
assert.equal(new Set(themes.map(t => JSON.stringify(t.tokens))).size, 20);
for (const id of ['desert', 'sunset', 'abyss', 'moss', 'infrared', 'amethyst', 'glacier']) assert.ok(themes.some(t => t.id === id));
assert.equal(themes.filter(t => t.mood === 'light').length, 2);
for (const theme of themes) {
  assert.equal(theme.name, theme.name.toLowerCase());
  assert.match(theme.tokens['--theme-bg'], /^#[0-9a-f]{6}$/);
  assert.ok(!Object.values(theme.tokens).includes('grayscale(1)'));
  assert.notEqual(theme.tokens['--theme-fog-blur'], '32px');
  for (const key of ['a', 'b', 'c', 'accent', 'text', 'panel']) {
    const channels = theme.tokens[`--theme-${key}-rgb`].split(',').map(Number);
    assert.equal(channels.length, 3);
    assert.ok(channels.every((value) => Number.isInteger(value) && value >= 0 && value <= 255));
  }
}
console.log('PASS: 20 unique palettes, 10 pairs, valid tokens, legacy IDs preserved');
