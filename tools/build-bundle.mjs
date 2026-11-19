#!/usr/bin/env node
/* Production bundle for the homepage: one minified stylesheet and one minified
   script instead of ~16 CSS and ~26 JS requests.

   node tools/build-bundle.mjs --root <site dir> --html <input html> --out-html <output html> [--out-dir <dir>]

   - Only root-level files referenced by <link rel="stylesheet"> and by
     <script defer src> are bundled, in document order. The synchronous
     room-portal.js and development-only scripts stay as they are.
   - Scripts are minified one by one (top-level names are kept, so cross-file
     globals still work) and joined in the original order.
   - A script made only of expression statements (an IIFE, window.x = ...) is
     wrapped in try/catch, so one failing file cannot stop the files after it,
     exactly like separate <script> tags. Files with top-level declarations
     (script.js) are left bare: wrapping would make their names block-scoped.
   Writes site.bundle.css and site.bundle.js to --out-dir (default: --root). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { parse } from 'acorn';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const root = resolve(option('root', '.'));
const htmlPath = resolve(option('html', join(root, 'index.html')));
const outHtml = resolve(option('out-html', join(root, 'index.bundled.html')));
const outDir = resolve(option('out-dir', root));
const html = readFileSync(htmlPath, 'utf8');
const eol = html.includes('\r\n') ? '\r\n' : '\n';

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))?.[1];
const localFile = ref => {
  const clean = String(ref).split(/[?#]/)[0];
  return /^[\w.-]+$/.test(clean) && existsSync(join(root, clean)) ? clean : null;
};

const found = [];
for (const match of html.matchAll(/[ \t]*<link\b[^>]*>[ \t]*\r?\n?/g)) {
  const tag = match[0];
  if (attr(tag, 'rel') !== 'stylesheet') continue;
  const name = localFile(attr(tag, 'href') || '');
  if (name?.endsWith('.css')) found.push({ kind: 'css', name, start: match.index, end: match.index + tag.length });
}
for (const match of html.matchAll(/[ \t]*<script\b([^>]*)>\s*<\/script>[ \t]*\r?\n?/g)) {
  const tag = match[0], attrs = match[1];
  if (/\bdata-development-only\b|\basync\b|type\s*=\s*"module"/.test(attrs) || !/\bdefer\b/.test(attrs)) continue;
  const name = localFile(attr(tag, 'src') || '');
  if (name?.endsWith('.js')) found.push({ kind: 'js', name, start: match.index, end: match.index + tag.length });
}
found.sort((a, b) => a.start - b.start);
const styles = found.filter(item => item.kind === 'css');
const scripts = found.filter(item => item.kind === 'js');
if (!styles.length || !scripts.length) {
  console.error('Nothing to bundle: no local stylesheets or deferred scripts found in', htmlPath);
  process.exit(2);
}

const warn = result => { for (const w of result.warnings || []) console.warn('esbuild warning:', w.text); };
const css = styles.map(item => {
  const result = transformSync(readFileSync(join(root, item.name), 'utf8'), { loader: 'css', minify: true, legalComments: 'none' });
  warn(result);
  return result.code.trim();
}).join(eol);

const isolatable = source => {
  try {
    return parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true })
      .body.every(node => node.type === 'ExpressionStatement');
  } catch { return false; }
};
let wrapped = 0;
const js = scripts.map(item => {
  const source = readFileSync(join(root, item.name), 'utf8');
  const result = transformSync(source, { loader: 'js', minify: true, legalComments: 'none' });
  warn(result);
  const code = result.code.trim();
  if (!isolatable(source)) return code;
  wrapped += 1;
  return `try{${code}\n}catch(e){console.error(${JSON.stringify('[bundle] ' + item.name)},e)}`;
}).join(`${eol};${eol}`) + eol;
new vm.Script(js, { filename: 'site.bundle.js' }); // throws on a syntax error

let out = '', cursor = 0, cssPlaced = false, jsPlaced = false;
for (const item of found) {
  out += html.slice(cursor, item.start);
  const indent = html.slice(item.start).match(/^[ \t]*/)[0];
  if (item.kind === 'css' && !cssPlaced) { out += `${indent}<link rel="stylesheet" href="site.bundle.css">${eol}`; cssPlaced = true; }
  if (item.kind === 'js' && !jsPlaced) { out += `${indent}<script defer src="site.bundle.js"></script>${eol}`; jsPlaced = true; }
  cursor = item.end;
}
out += html.slice(cursor);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'site.bundle.css'), css);
writeFileSync(join(outDir, 'site.bundle.js'), js);
writeFileSync(outHtml, out);

const bytes = text => Buffer.byteLength(text);
const raw = list => list.reduce((sum, item) => sum + bytes(readFileSync(join(root, item.name), 'utf8')), 0);
const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`bundle: ${styles.length} CSS + ${scripts.length} JS files -> 2 (${wrapped} scripts isolated with try/catch)`);
console.log(`  css ${kb(raw(styles))} -> ${kb(bytes(css))} (gzip ${kb(gzipSync(css).length)})`);
console.log(`  js  ${kb(raw(scripts))} -> ${kb(bytes(js))} (gzip ${kb(gzipSync(js).length)})`);
