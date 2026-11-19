const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "playback-link.js"), "utf8");
const home = fs.readFileSync(path.join(root, "script.js"), "utf8");
const yard = fs.readFileSync(path.join(root, "yard", "wall-player.js"), "utf8");
const yardHtml = fs.readFileSync(path.join(root, "yard", "index.html"), "utf8");
const listeningRoom = fs.readFileSync(path.join(root, "listening-room.html"), "utf8");

const store = new Map();
const context = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
};
context.window = context;
vm.runInNewContext(source, context);

context.inteonPlayback.save(
  { currentTime: 12.4, paused: false },
  { audio: "media/night.mp3", title: "Night", artist: "Sonyx" },
);
const saved = context.inteonPlayback.read();
assert.equal(saved.audio, "media/night.mp3");
assert.equal(saved.time, 12.4);
assert.equal(saved.paused, false);
assert.equal(saved.title, "Night");
context.inteonPlayback.clear();
assert.equal(context.inteonPlayback.read(), null);

assert.match(home, /inteonPlayback\.save\(player, currentTrack\)/);
assert.match(home, /restoreSharedPlayback\(\)/);
assert.match(yard, /inteonPlayback\.save\(audio, track\)/);
assert.match(yard, /event\.code === "Space"/);
assert.match(yard, /event\.code === "BracketLeft"/);
assert.match(listeningRoom, /<audio\b[^>]*\bid="album-player"/, "the listening room owns the audio element");
assert.match(listeningRoom, /<script\b[^>]*src="playback-link\.js\b/, "the listening room loads shared playback");
assert.doesNotMatch(yardHtml, /<audio\b|class="yard-player"/, "the legacy entry cannot start a second player");

console.log("PASS: playback link");
