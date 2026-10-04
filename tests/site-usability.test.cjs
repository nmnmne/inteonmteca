const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.doesNotMatch(html, /<body[^>]*\bis-chat-open\b/, "chat opens from script after the page markup is ready");
assert.match(html, /<section class="chat-panel" id="chat-panel" aria-hidden="true" hidden>/, "chat markup stays collapsed until the page script opens it");
assert.match(html, /<button class="chat-close" id="chat-close" type="button">свернуть<\/button>/, "an open chat can be collapsed");
assert.match(script, /const matrixElements = document\.querySelectorAll\("\.matrix-text\[data-matrix-noise\]"\);/, "frozen brand copy remains readable instead of being periodically scrambled");
assert.match(script, /const closeChat = \(\) => \{\s*window\.clearInterval\(chatTimer\);\s*setPanelOpen\(chatPanel, false\);\s*document\.body\.classList\.remove\("is-chat-open"\);/s, "chat close really hides the panel and stops polling");
assert.match(script, /window\.addEventListener\("DOMContentLoaded", \(\) => \{\s*setupVisitCounter\(\);\s*updateScrollbar\(\);\s*openChat\(\);/s, "chat opens by default once the page is ready");
assert.match(script, /chatClose\?\.addEventListener\("click", closeChat\)/, "the collapse control hides the chat");
assert.match(styles, /\.chat-close\s*\{[^}]*display:\s*inline-flex/s, "the close control remains visible in an open chat");

console.log("PASS: site usability");
