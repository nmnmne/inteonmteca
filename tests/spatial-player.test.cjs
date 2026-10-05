const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8') + fs.readFileSync(path.join(root, 'home-player.css'), 'utf8');
test('spatial listening surface retains identity and approved copy', () => {
  assert.match(html, /listening-room spatial-room/);
  assert.match(html, /Выбери<br> <em>свой звук<\/em>/);
  assert.match(html, /id="logo-vector"/);
  assert.match(css, /logo-fragmented\.png/);
});
test('spatial control system has large targets and responsive low-height mode', () => {
  assert.match(css, /@media[^\{]*\(max-height: 540px\)/);
  assert.match(css, /\.spatial-room \.transport-skip[^}]*min-width: 48px/s);
  assert.doesNotMatch(html, /id="close-track"/);
  assert.match(html, /id="active-player"[^>]*aria-hidden="false"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
