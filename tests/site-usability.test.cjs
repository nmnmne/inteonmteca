const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.doesNotMatch(html, /<body[^>]*\bis-chat-open\b/, "chat opens from script after the page markup is ready");
assert.match(html, /<section class="chat-panel" id="chat-panel"[^>]*aria-hidden="true" hidden>/, "chat markup starts collapsed");
assert.match(html, /<button class="chat-close" id="chat-close" type="button">свернуть<\/button>/, "an open chat can be collapsed");
assert.match(script, /const matrixElements = document\.querySelectorAll\("\.matrix-text\[data-matrix-noise\]"\);/, "frozen brand copy remains readable instead of being periodically scrambled");
assert.match(script, /const closeChat = \(\) => \{\s*window\.clearInterval\(chatTimer\);[\s\S]*?setPanelOpen\(chatPanel, false\);\s*document\.body\.classList\.remove\("is-chat-open"\);/, "chat close hides the panel and stops polling and animation");
const onReady = script.slice(script.indexOf('window.addEventListener("DOMContentLoaded"'));
assert.doesNotMatch(onReady, /openChat\(/, "chat opens only on request, not on page load");
assert.match(script, /chatClose\?\.addEventListener\("click", closeChat\)/, "the collapse control hides the chat");
assert.match(styles, /\.chat-close\s*\{[^}]*display:\s*inline-flex/s, "the close control remains visible in an open chat");

console.log("PASS: site usability");
