const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

// Run the real player and persistence code; only the browser media/DOM boundary
// is simulated so metadata ordering remains deterministic without a network.
class Element extends EventTarget {
  setAttribute() {}
  emit(type) { this.dispatchEvent(new Event(type)); }
}

class Audio extends Element {
  constructor() {
    super();
    this._src = "";
    this.currentSrc = "";
    this.currentTime = 0;
    this.readyState = 0;
    this.paused = true;
    this.preload = "none";
    this.loads = 0;
    this.plays = 0;
  }
  get src() { return this._src; }
  set src(value) {
    this._src = value;
    this.readyState = 0;
    this.currentTime = 0;
  }
  load() {
    this.loads++;
    this.currentSrc = this.src;
    this.readyState = 0;
    this.currentTime = 0;
    this.emit("timeupdate");
  }
  play() {
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    const changed = !this.paused;
    this.paused = true;
    if (changed) this.emit("pause");
  }
  metadata(src = this.src) {
    this.currentSrc = src;
    this.readyState = 1;
    this.emit("loadedmetadata");
  }
}

async function setup() {
  const audio = new Audio();
  const elements = new Map([
    ["#album-player", audio], ["#yard-now", new Element()],
    ["#yard-play", new Element()], ["#yard-next", new Element()],
    ["#yard-prev", new Element()], [".home-link", new Element()],
  ]);
  const window = new Element();
  const store = new Map();
  const context = {
    window, URL, console,
    document: { baseURI: "https://example.test/yard/", activeElement: null },
    location: { protocol: "file:" },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
    },
  };
  window.INTEONMTECA_PLAYLIST = [
    { audio: "media/a.mp3", title: "A" },
    { audio: "media/b.mp3", title: "B" },
  ];
  const root = path.resolve(__dirname, "..");
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "playback-link.js"), "utf8"), context);
  window.inteonPlayback.save({ currentTime: 42, paused: true }, window.INTEONMTECA_PLAYLIST[0]);
  const source = fs.readFileSync(path.join(root, "yard/wall-player.js"), "utf8")
    .replace("export function createWallPlayer", "function createWallPlayer");
  vm.runInContext(source, context);
  const player = context.createWallPlayer({ querySelector: selector => elements.get(selector) });
  await player.load();
  return { audio, window, elements, read: () => window.inteonPlayback.read() };
}

test("paused 42-second handoff survives pending metadata and resumes persistence after seeking", async () => {
  const { audio, window, elements, read } = await setup();
  assert.equal(read().time, 42, "initial paused restore must not save the unloaded zero position");
  audio.emit("timeupdate");
  audio.emit("pause");
  elements.get(".home-link").emit("click");
  window.emit("pagehide");
  assert.equal(read().time, 42, "all persistence entry points must defer until restored");
  assert.equal(audio.preload, "metadata");
  assert.ok(audio.loads > 0, "paused preload=none audio must explicitly request metadata");
  assert.equal(audio.plays, 0, "loading metadata must not start playback");
  audio.metadata();
  assert.equal(audio.currentTime, 42);
  assert.equal(audio.paused, true);
  assert.equal(read().time, 42);
  audio.currentTime = 43;
  audio.emit("timeupdate");
  assert.equal(read().time, 43, "normal persistence resumes after restore");
});

test("next before metadata cannot apply A's saved seek to B", async () => {
  const { audio, elements, read } = await setup();
  elements.get("#yard-next").emit("click");
  assert.equal(audio.src, "https://example.test/media/b.mp3");
  audio.metadata();
  assert.equal(audio.currentTime, 0, "B must start at zero rather than A's 42 seconds");
  assert.equal(read().audio, "media/b.mp3");
  assert.equal(read().time, 0);
});

test("metadata from the old resource cannot complete the new selection's pending handoff", async () => {
  const { audio, elements, window, read } = await setup();
  const oldSrc = audio.src;
  elements.get("#yard-next").emit("click");
  audio.metadata(oldSrc);
  audio.emit("timeupdate");
  window.emit("pagehide");
  assert.equal(read().audio, "media/a.mp3", "wrong-source metadata must not release the save guard");
  assert.equal(read().time, 42);
  audio.metadata();
  assert.equal(read().audio, "media/b.mp3", "the correct later metadata must still be handled");
  assert.equal(read().time, 0);
});

test("A to B to A before metadata does not revive A's obsolete restored position", async () => {
  const { audio, elements, read } = await setup();
  elements.get("#yard-next").emit("click");
  elements.get("#yard-prev").emit("click");
  audio.metadata();
  assert.equal(audio.currentTime, 0);
  assert.equal(read().audio, "media/a.mp3");
  assert.equal(read().time, 0);
});
