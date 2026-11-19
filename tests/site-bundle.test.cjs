'use strict';
// Verifies the optional production bundle (tools/build-bundle.mjs). Skipped until
// `npm install` has provided esbuild and acorn, so the release checks still run without them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let available = true;
try { require.resolve('esbuild', { paths: [root] }); require.resolve('acorn', { paths: [root] }); } catch { available = false; }

test('homepage bundle replaces the individual assets and stays valid', { skip: available ? false : 'run npm install to enable the bundle checks' }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'inteon-bundle-'));
  const bundledHtml = path.join(out, 'index.html');
  execFileSync(process.execPath, [
    path.join(root, 'tools', 'build-bundle.mjs'),
    '--root', root, '--html', path.join(root, 'index.html'), '--out-html', bundledHtml, '--out-dir', out,
  ], { stdio: 'pipe' });

  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const html = fs.readFileSync(bundledHtml, 'utf8');
  const js = fs.readFileSync(path.join(out, 'site.bundle.js'), 'utf8');
  const css = fs.readFileSync(path.join(out, 'site.bundle.css'), 'utf8');

  assert.equal((html.match(/href="site\.bundle\.css"/g) || []).length, 1);
  assert.equal((html.match(/src="site\.bundle\.js"/g) || []).length, 1);
  assert.deepEqual(html.match(/<link[^>]+rel="stylesheet"[^>]*>/g).filter(tag => !tag.includes('site.bundle.css')), [], 'every local stylesheet is bundled');
  assert.deepEqual(
    html.match(/<script\b[^>]*\bdefer\b[^>]*src="[^"]+"/g).filter(tag => !/site\.bundle\.js|data-development-only/.test(tag)),
    [], 'every deferred local script is bundled');

  new vm.Script(js);
  const deferred = [...source.matchAll(/<script defer src="([\w.-]+\.js)\?/g)].map(match => match[1]).filter(name => name !== 'development-debug.js');
  assert.ok(deferred.includes('dj-engine.js') && deferred.includes('dj-studio.js'), 'the studio engine and UI are bundled');
  for (const marker of ['INTEONMTECA_PLAYLIST', 'DJEngine', 'DJDecks', 'DJMidi', 'DJStorage']) assert.ok(js.includes(marker), `bundle contains ${marker}`);
  assert.ok(css.includes('.deck-bank') && css.includes('.dj-deck'), 'bundle includes both the mixer and deck styles');
  assert.ok(Buffer.byteLength(js) < deferred.reduce((sum, name) => sum + fs.statSync(path.join(root, name)).size, 0), 'minified bundle is smaller than its sources');
  fs.rmSync(out, { recursive: true, force: true });
});
