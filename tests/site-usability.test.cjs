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
  assert.match(script, /if \(inlineChat\) \{\s*openChat\(\);/);
  assert.match(script, /const matrixElements = document\.querySelectorAll\("\.matrix-text\[data-matrix-noise\]"\);/, "brand copy is not periodically scrambled");
});

test("a guest loads shared chat and keeps polling while writing remains read-only", async () => {
  let loads = 0, polls = 0;
  const start = script.indexOf("const openChat =");
  const source = script.slice(start, script.indexOf("\n};", start) + 3);
  const context = { inlineChat: true, compactChatViewport: { matches: false },
    chatPanel: { hidden: false }, chatInput: {}, chatTimer: 0, sessionEmail: "", syncChatViewport() {},
    loadChat: async () => { loads++; }, window: {
      clearInterval() {}, setInterval(fn, delay) { assert.equal(fn, context.loadChat); assert.equal(delay, 2500); polls++; return 1; },
    } };
  await vm.runInNewContext(source + "\nopenChat();", context);
  assert.equal(loads, 1, "read access does not require a session");
  assert.equal(polls, 1);
  assert.equal(context.chatInput.readOnly, true);
  assert.equal(context.chatInput.placeholder, "войди, чтобы написать");
});

test("the mobile section slider opens chat and returns to tracks with keyboard or touch", () => {
  const events = {}, attributes = {}, bodyProperties = {}, classes = new Set();
  const chat = { hidden: false, inert: false }, playlist = { inert: false };
  const tracks = { querySelector: selector => { assert.equal(selector, ".playlist-shell"); return playlist; } };
  const slider = { value: "0", addEventListener: (name, fn) => { events[name] = fn; }, setAttribute: (name, value) => { attributes[name] = value; } };
  let loads = 0, blurred = 0, viewportChange;
  const mobile = { matches: true, addEventListener(name, fn) { assert.equal(name, "change"); viewportChange = fn; } };
  const context = { matchMedia: () => mobile, openChat: () => { loads++; },
    document: { getElementById: id => ({ "chat-panel": chat, "mobile-section-slider": slider, "chat-input": { blur() { blurred++; } } })[id],
      querySelector: () => tracks, body: { dataset: {}, style: { setProperty: (name, value) => { bodyProperties[name] = value; } },
        classList: { toggle: (name, active) => active ? classes.add(name) : classes.delete(name) } } },
    window: { addEventListener() {} }, innerHeight: 844 };
  vm.runInNewContext(fs.readFileSync(path.join(root, "mobile-sections.js"), "utf8"), context);
  assert.equal(tracks.id, "mobile-track-section");
  assert.equal(chat.hidden, true, "mobile starts with tracks");
  assert.equal(chat.inert, true);
  assert.equal(playlist.inert, false);
  for (const [key, opened] of [["End", true], ["Home", false], ["ArrowRight", true], ["ArrowLeft", false]]) {
    let prevented = false;
    events.keydown({ key, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(chat.hidden, !opened);
    assert.equal(chat.inert, !opened);
    assert.equal(playlist.inert, opened);
    assert.equal(attributes["aria-valuetext"], opened ? "Чат" : "Треки");
  }
  assert.equal(loads, 2, "revealing chat requests fresh public messages");
  slider.value = "750";
  events.input();
  assert.equal(blurred, 1);
  assert.equal(chat.hidden, false);
  assert.equal(chat.inert, true, "chat controls wait until the slide settles");
  events.change();
  assert.equal(slider.value, "1000");
  assert.equal(chat.inert, false);
  slider.value = "100";
  events.input();
  events.pointercancel();
  assert.equal(slider.value, "0");
  assert.equal(chat.hidden, true);
  assert.equal(playlist.inert, false);
  mobile.matches = false;
  viewportChange();
  assert.equal(chat.hidden, false, "desktop always reveals inline chat");
  assert.equal(chat.inert, false);
});
