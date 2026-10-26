const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'alternate-logo.js');
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';

function fixture({mobile=false}={}) {
  let now = 0, nextId = 0;
  const timers = new Map(), listeners = new Map();
  const classes = new Set();
  const wrap = {dataset: {}, classList: {contains: name => classes.has(name)}};
  const rootElement = {dataset: {}};
  const document = {
    hidden: false,
    documentElement: rootElement,
    body: {classList: {contains: name => classes.has(name)}},
    querySelector: selector => selector === '#logo-wrap' ? wrap : null,
    addEventListener(name, callback) { listeners.set(`document:${name}`, callback); },
  };
  const effects = {
    active: null, ambientPaused: false, suspended: false,
    claim(name) { if (this.active || this.suspended) return false; this.active = name; return true; },
    release(name) { if (this.active === name) this.active = null; },
    setMotionTimeout(callback, delay) {
      const id = ++nextId; timers.set(id, {callback, at: now + delay}); return id;
    },
    clearMotionTimeout(id) { timers.delete(id); },
  };
  const window = {
    inteonHomeEffects: effects,
    addEventListener(name, callback) { listeners.set(`window:${name}`, callback); },
    dispatchEvent() {},
  };
  const reduced = {matches: false, addEventListener(name, callback) { listeners.set(`motion:${name}`, callback); }};
  const sandbox = {
    window, document, matchMedia: query => query.includes('coarse') ? {matches:mobile,addEventListener(){}} : reduced,
    Math: Object.assign(Object.create(Math), {random: () => .5}),
    performance: {now: () => now},
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, {callback, at: now + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, sandbox);
  return {
    api: window.inteonAlternateLogo, listeners, effects, document, reduced, wrap, timers, classes,
    advance(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        assert.ok(++count < 1000, 'bounded timer execution');
        now = due[1].at; timers.delete(due[0]); due[1].callback();
      }
      now = end;
    },
  };
}

test('selected variants 1, 3 and 5 alternate over the old mark and restore it after 4.6 seconds', () => {
  assert.ok(source, 'alternate-logo.js exists');
  const f = fixture();
  assert.deepEqual([...f.api.variants], [1, 3, 5, 12, 13, 16, 17]);
  assert.equal(f.api.activeVariant, null);
  assert.equal(f.api.show(3), true);
  assert.equal(f.wrap.dataset.alternateLogo, '3');
  assert.equal(f.effects.active, 'alternate-logo');
  f.advance(4599);
  assert.equal(f.api.activeVariant, 3);
  f.advance(1);
  assert.equal(f.api.activeVariant, null);
  assert.equal(f.wrap.dataset.alternateLogo, undefined);
  assert.equal(f.effects.active, null);
});

test('automatic alternation cycles all seven choices with the old logo between appearances', () => {
  assert.ok(source, 'alternate-logo.js exists');
  const f = fixture();
  f.api.stop(); f.api.start(1000);
  f.advance(999);
  assert.equal(f.api.activeVariant, null);
  f.advance(1);
  assert.equal(f.api.activeVariant, 1);
  f.advance(4600);
  assert.equal(f.api.activeVariant, null);
  assert.equal(f.wrap.dataset.alternateLogo, undefined);
  f.advance(23999); assert.equal(f.api.activeVariant, null);
  f.advance(1); assert.equal(f.api.activeVariant, 3);
  f.advance(4600); assert.equal(f.api.activeVariant, null);
  f.advance(24000); assert.equal(f.api.activeVariant, 5);
  for (const variant of [12, 13, 16, 17, 1]) {
    f.advance(4600);
    assert.equal(f.api.activeVariant, null);
    assert.equal(f.wrap.dataset.alternateLogo, undefined);
    f.advance(23999); assert.equal(f.api.activeVariant, null);
    f.advance(1); assert.equal(f.api.activeVariant, variant);
  }
});

test('alternate logo defers to other scenes, hidden pages and reduced motion, but can replace a stable old mark', () => {
  assert.ok(source, 'alternate-logo.js exists');
  const f = fixture();
  f.effects.active = 'acid';
  assert.equal(f.api.show(1), false);
  f.effects.active = null;
  f.document.hidden = true;
  assert.equal(f.api.show(1), false);
  f.document.hidden = false;
  f.reduced.matches = true;
  assert.equal(f.api.show(1), false);
  assert.equal(f.api.activeVariant, null);
  f.reduced.matches = false;
  f.classes.add('is-stable');
  f.classes.add('is-charging');
  assert.equal(f.api.show(3), true);
  f.api.stop();
});

test('entry page and static deployment include the alternate-logo assets and original artwork', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const deploy = fs.readFileSync(path.join(root, 'deploy-site.ps1'), 'utf8');
  assert.match(html, /alternate-logo\.css\?v=/);
  assert.match(html, /alternate-logo\.js\?v=/);
  assert.match(html, /assets\/logo-handwriting\.svg/);
  assert.match(deploy, /"--include", "alternate-logo\.css"/);
  assert.match(deploy, /"--include", "alternate-logo\.js"/);
  assert.match(deploy, /"--include", "assets\/\*"/);
});

test('every handwritten logo consumer uses the transparent vector-only artwork', () => {
  for (const file of ['index.html', 'logo-variants-preview.html', 'logo-variants-next-preview.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /assets\/logo-handwriting\.svg/);
    assert.doesNotMatch(html, /logo-(?:handwriting|full)\.png/);
  }
  const svg = fs.readFileSync(path.join(root, 'assets/logo-handwriting.svg'), 'utf8');
  assert.match(svg, /viewBox="0 0 536 111"/);
  assert.match(svg, /<path d="M/);
  assert.match(svg, /<pattern /);
  assert.match(svg, /mask="url\(#ink-wear\)"/);
  assert.doesNotMatch(svg, /<image\b|data:image|<filter\b|<feTurbulence\b|<foreignObject\b/i);
  assert.ok(Buffer.byteLength(svg) < 40000, 'shared artwork remains lightweight');
});


test('mobile alternate skin does not claim or delay a foreground scene',()=>{
  const f=fixture({mobile:true});
  assert.equal(f.api.show(3),true);
  assert.equal(f.effects.active,null);
  assert.equal(f.effects.claim('mobile-scatter'),true);
  f.listeners.get('window:inteon-effects-change')();
  assert.equal(f.api.activeVariant,null);
  assert.equal(f.effects.active,'mobile-scatter');
});
