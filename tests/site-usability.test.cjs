const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

test("public desktop chat is an accessible inline region and starts loading automatically", () => {
  const chat = html.match(/<section[^>]*id="chat-panel"[^>]*>/)?.[0] || "";
  assert.match(chat, /class="chat-panel chat-inline"/);
  assert.match(chat, /role="region"/);
  assert.match(chat, /aria-label="Чат"/);
  assert.doesNotMatch(chat, /\shidden(?:\s|>)|aria-hidden="true"/);
  assert.match(html, /id="chat-stream"[^>]*aria-live="polite"/);
  assert.match(html, /id="mobile-chat-toggle"[^>]*aria-expanded="false"/, "mobile chat has an explicit collapsed control");
  assert.match(script, /if \(inlineChat\) \{\s*openChat\(\);/);
  assert.match(script, /const matrixElements = document\.querySelectorAll\("\.matrix-text\[data-matrix-noise\]"\);/, "brand copy is not periodically scrambled");
});

test("a guest loads shared chat and keeps polling while writing remains read-only", async () => {
  let loads = 0, polls = 0;
  const start = script.indexOf("const openChat =");
  const source = script.slice(start, script.indexOf("\n};", start) + 3);
  const context = { inlineChat: true, compactChatViewport: { matches: false },
    chatPanel: { hidden: false }, chatInput: {}, chatTimer: 0, sessionEmail: "", syncChatViewport() {},
    chatWorkVisible: () => true, loadChat: async () => { loads++; }, window: {
      clearInterval() {}, setInterval(fn, delay) { assert.equal(fn, context.loadChat); assert.equal(delay, 2500); polls++; return 1; },
    } };
  const pollingStart = script.indexOf("const syncChatPolling =");
  const polling = script.slice(pollingStart, script.indexOf("\n};", pollingStart) + 3);
  await vm.runInNewContext(polling + "\n" + source + "\nopenChat();", context);
  assert.equal(loads, 1, "read access does not require a session");
  assert.equal(polls, 1);
  assert.equal(context.chatInput.readOnly, true);
  assert.equal(context.chatInput.placeholder, "войди, чтобы написать");
});

function mobileLayoutFixture(width = 390, height = 844) {
  const properties = {}, frames = new Map(); let frameId = 0, opened = 0;
  const node = () => {
    const classes = new Set();
    const events = {}, attributes = {};
    return {children: [], dataset: {}, hidden: false, inert: false, style: {
      setProperty(name, value) { properties[name] = value; },
      getPropertyValue(name) { return properties[name] || ''; }, getPropertyPriority() { return ''; },
      removeProperty(name) { delete properties[name]; }},
      querySelector() { return null; }, dispatchEvent(event) { events[event.type]?.(event); },
      classList: {add(name) { classes.add(name); }, remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); }, toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }},
      setAttribute(name, value) { attributes[name] = String(value); }, getAttribute(name) { return attributes[name]; },
      addEventListener(name, fn) { events[name] = fn; }, click() { events.click?.({preventDefault() {}}); }, append(child) {
        if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
        this.children.push(child); child.parentNode = this;
      },
      insertBefore(child, before) {
        if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
        const index = before ? this.children.indexOf(before) : this.children.length;
        this.children.splice(index, 0, child); child.parentNode = this;
      },
      get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; },
    };
  };
  const body = node(), rootElement = node(), intro = node(), logo = node(), playlist = node(), tracks = node(), chat = node(), composer = node(), toggle = node(), dock = node(), oldSwitch = node();
  intro.append(logo);
  chat.hidden = true; chat.inert = playlist.inert = true;
  const listeners = {}, viewportListeners = {}, mediaListeners = [];
  const mobile = {matches: true, addEventListener(name, fn) { mediaListeners[0] = fn; }};
  const landscape = {matches: false, addEventListener(name, fn) { mediaListeners[1] = fn; }};
  const viewport = {height, offsetTop: 0, addEventListener(name, fn) { viewportListeners[name] = fn; }};
  composer.getBoundingClientRect = () => ({height: 36});
  dock.getBoundingClientRect = () => ({top: viewport.height - 84});
  chat.querySelector = selector => selector === '.chat-compose' ? composer : null;
  tracks.querySelector = () => playlist;
  const context = {innerWidth: width, innerHeight: height, openChat() { opened++; },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    matchMedia: query => query.startsWith('(pointer: coarse) and') ? landscape : mobile,
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    ResizeObserver: class { observe() {} },
    document: {body, documentElement: rootElement, createElement: node, createComment: node,
      querySelector: selector => selector === '.release-content' ? tracks : oldSwitch,
      getElementById: id => ({'chat-panel': chat, 'mobile-chat-toggle': toggle, 'logo-wrap': logo, 'active-player': dock})[id]},
    window: {visualViewport: viewport, addEventListener(name, fn) { listeners[name] = fn; }, dispatchEvent(event) { listeners[event.type]?.(event); }, scrollTo() {}},
  };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'mobile-sections.js'), 'utf8'), context);
  flush();
  return {properties, body, rootElement, intro, logo, playlist, tracks, chat, toggle, oldSwitch, mobile, landscape,
    viewport, listeners, viewportListeners, mediaListeners, flush, opened: () => opened};
}

test('mobile starts with chat collapsed so the playlist gains rows, then restores the full chat on demand', () => {
  const f = mobileLayoutFixture();
  assert.equal(f.chat.hidden, false);
  assert.equal(f.chat.inert, false);
  assert.equal(f.playlist.inert, false);
  assert.equal(f.tracks.inert, false);
  assert.equal(f.oldSwitch.hidden, true);
  assert.equal(f.oldSwitch.inert, true);
  assert.equal(f.opened(), 1);
  assert.equal(f.logo.parentNode.id, 'mobile-visual-stage');
  assert.equal(f.chat.classList.contains('is-mobile-collapsed'), true);
  assert.equal(f.toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(Number.parseFloat(f.properties['--mobile-list-height']) > 300, 'playlist occupies the collapsed chat space');
  const collapsedSlots = Number(f.properties['--mobile-catalog-slots']);
  assert.ok(Number.parseFloat(f.properties['--mobile-list-height']) / collapsedSlots >= 44, 'rows remain readable');
  assert.equal(f.properties['--mobile-chat-height'], '14px');
  assert.equal(f.properties['--mobile-stage-top'], '132px');
  const headerBottom = f.properties['--mobile-chat-top'];
  f.toggle.click(); f.flush();
  assert.equal(f.chat.classList.contains('is-mobile-collapsed'), false);
  assert.equal(f.toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(Number.parseFloat(f.properties['--mobile-list-height']) > 236);
  assert.equal(f.properties['--mobile-chat-top'], headerBottom, 'opening chat preserves the top composition');
  assert.equal(f.properties['--mobile-chat-height'], '122px');
  assert.ok(Number(f.properties['--mobile-catalog-slots']) < collapsedSlots, 'opening chat gives back its space rather than squeezing rows');
  assert.equal(f.body.dataset.mobileSection, undefined);
  f.mobile.matches = false; f.mediaListeners[0](); f.flush();
  assert.equal(f.playlist.style.getPropertyValue('--catalog-slots'), '', 'desktop slot count is restored');
  assert.equal(f.logo.parentNode, f.intro, 'restore the original node, including its canvas state');
  assert.equal(f.chat.hidden, false);
  f.mobile.matches = true; f.mediaListeners[0](); f.flush();
  assert.equal(f.logo.parentNode.id, 'mobile-visual-stage');
  assert.equal(f.opened(), 1, 'resize does not reload an already visible chat');
});

test('short phones retain readable rows and keyboard layout makes a single scrollable page only when necessary', () => {
  const f = mobileLayoutFixture(320, 568);
  assert.ok(Number.parseFloat(f.properties['--mobile-list-height']) > 190, 'collapsed chat space belongs to the playlist');
  f.toggle.click(); f.flush();
  assert.ok(Number.parseFloat(f.properties['--mobile-list-height']) >= 140, 'short screen preserves readable rows');
  assert.equal(f.properties['--mobile-chat-row'], '14px');
  assert.ok(Number.parseFloat(f.properties['--mobile-list-top']) > Number.parseFloat(f.properties['--mobile-chat-top']));
  assert.equal(f.properties['--mobile-stage-top'], '132px', 'short phone retains the anchored header');
  f.viewport.height = 400; f.viewportListeners.resize(); f.flush();
  assert.equal(f.properties['--mobile-keyboard'], '168px');
  assert.equal(f.properties['--mobile-list-height'], '190px');
  assert.equal(f.rootElement.classList.contains('mobile-keyboard-scroll'), false);
  assert.ok(Number.parseFloat(f.properties['--mobile-chat-top']) >= 0);
  f.viewport.height = 300; f.viewportListeners.resize(); f.flush();
  assert.equal(f.rootElement.classList.contains('mobile-keyboard-scroll'), true);
  assert.equal(f.properties['--mobile-chat-top'], '10px');
  assert.equal(f.properties['--mobile-list-height'], '190px');
  assert.ok(Number.parseFloat(f.properties['--mobile-document-height']) > 568, 'content can scroll above the keyboard');
  assert.equal(f.chat.hidden, false);
  assert.equal(f.playlist.inert, false);
  f.viewport.height = 568; f.viewportListeners.resize(); f.flush();
  assert.equal(f.rootElement.classList.contains('mobile-keyboard-scroll'), false);
});
