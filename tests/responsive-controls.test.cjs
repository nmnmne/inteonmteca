const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = path.join(__dirname, '..');

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    emit(name, values = {}) {
      const event = {
        type: name,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...values,
      };
      for (const callback of listeners.get(name) || []) callback(event);
      return event;
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) callback(event);
      return !event.defaultPrevented;
    },
  };
}

function themePickerFixture() {
  const window = eventTarget();
  const documentEvents = eventTarget();
  const observers = [];
  let document;
  const element = tag => {
    const classes = new Set();
    const node = Object.assign(eventTarget(), {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      dataset: {},
      hidden: false,
      tabIndex: 0,
      className: '',
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        contains(name) { return classes.has(name); },
      },
      append(...children) { this.children.push(...children); children.forEach(child => { child.parentNode = this; }); },
      after(node) { this.afterNode = node; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      contains(target) { return this === target || this.children.some(child => child.contains?.(target)); },
      focus() { document.activeElement = this; },
      scrollIntoView() {},
      getBoundingClientRect() { return {left: 0, right: 200, top: 0, bottom: 200}; },
    });
    return node;
  };
  // Object.assign above already copied working listener methods; do not replace them.
  const panel = element('section'); panel.id = 'theme-panel'; panel.hidden = false;
  const select = element('select'); select.id = 'theme-select'; select.value = 'graphite'; select.parentNode = panel;
  const optionA = {value: 'graphite', textContent: 'Матовый углерод'};
  const optionB = {value: 'fern', textContent: 'Лес'};
  select.options = [optionA, optionB];
  Object.defineProperty(select, 'selectedOptions', {get() { return select.options.filter(option => option.value === select.value); }});
  select.closest = selector => selector === '#theme-panel' ? panel : null;
  document = Object.assign(documentEvents, {
    activeElement: null,
    documentElement: element('html'),
    createElement: element,
    querySelector: selector => selector === '#theme-select' ? select : null,
  });
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
  }
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const source = fs.readFileSync(path.join(root, 'theme-picker.js'), 'utf8');
  vm.runInNewContext(source, {window, document, MutationObserver, CustomEvent});
  const host = select.afterNode;
  const [toggle, menu] = host.children;
  return {window, document, panel, select, host, toggle, menu, observers};
}

test('responsive control stylesheet owns compact sizing, panel bounds, and coarse landscape reset', () => {
  const cssPath = path.join(root, 'responsive-ui.css');
  assert.equal(fs.existsSync(cssPath), true, 'responsive-ui.css must be a bounded final cascade');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /@media[^\{]*(?:max-width:\s*800px|pointer:\s*coarse)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /width:\s*min\(360px,\s*calc\(100vw\s*-\s*20px\)\)/);
  assert.match(css, /max-height:\s*calc\(100dvh/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /z-index:\s*70\s*!important/);
  assert.match(css, /pointer:\s*coarse[^}]*max-height:\s*500px/);
  assert.match(css, /\.room-toolbar[^{]*\{[^}]*width:\s*100%/s);
});

test('theme palette Escape is hierarchical and popup events coordinate without closing its panel first', () => {
  const run = themePickerFixture();
  run.toggle.emit('click');
  assert.equal(run.menu.hidden, false);
  assert.equal(run.toggle.attributes['aria-expanded'], 'true');

  const firstEscape = run.host.emit('keydown', {key: 'Escape'});
  assert.equal(run.menu.hidden, true, 'first Escape closes the palette list');
  assert.equal(firstEscape.defaultPrevented, true);
  assert.equal(firstEscape.propagationStopped, true);
  assert.equal(run.document.activeElement, run.toggle);

  const secondEscape = run.host.emit('keydown', {key: 'Escape'});
  assert.equal(secondEscape.defaultPrevented, false, 'second Escape bubbles to the owning theme panel');
  assert.equal(secondEscape.propagationStopped, false);

  run.toggle.emit('click');
  run.window.emit('inteon-popup-open', {detail: {owner: 'debug'}});
  assert.equal(run.menu.hidden, true, 'another popup closes the palette list');
});

test('opening the palette publishes its owner and global popup close hides it', () => {
  const run = themePickerFixture();
  let owner = null;
  run.window.addEventListener('inteon-popup-open', event => { owner = event.detail?.owner; });
  run.toggle.emit('click');
  assert.equal(owner, 'theme-picker');
  assert.equal(run.menu.hidden, false);
  run.window.emit('inteon-close-popups', {detail: {owner: 'debug'}});
  assert.equal(run.menu.hidden, true);
});
