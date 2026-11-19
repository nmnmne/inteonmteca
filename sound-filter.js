/* Shared playback EQ, upstream of device routing and the studio master limiter. */
(() => {
  'use strict';
  const storageKey = 'inteonmteca.sound-filter.v1';
  const eventName = 'inteon:sound-settings';
  const presets = Object.freeze([
    { id: 'soft', label: 'Мягкий верх', frequency: 6000, treble: -3, bass: 0, compression: 0 },
    { id: 'gentle', label: 'Меньше резкости', frequency: 4000, treble: -5, bass: 0, compression: 0 },
    { id: 'even', label: 'Ровная громкость', frequency: 6500, treble: -1.5, bass: 0, compression: 35 },
    { id: 'night', label: 'Ночной', frequency: 3800, treble: -6, bass: 0, compression: 65 },
    { id: 'bright', label: 'Яркий', frequency: 5500, treble: 3, bass: 0, compression: 0 },
    { id: 'bass', label: 'Глубокий бас', frequency: 6000, treble: 0, bass: 4, compression: 0 },
    { id: 'flat', label: 'Ровный', frequency: 6000, treble: 0, bass: 0, compression: 0 }
  ].map(Object.freeze));
  const defaults = { enabled: false, frequency: 6000, treble: -3, bass: 0, compression: 0 };
  const bounds = { frequency: [2000, 14000], treble: [-12, 12], bass: [-12, 12], compression: [0, 100] };
  const graphs = new Set();

  function normalize(base, patch) {
    const next = { ...base };
    if (typeof patch?.enabled === 'boolean') next.enabled = patch.enabled;
    for (const [key, [min, max]] of Object.entries(bounds)) {
      const value = patch?.[key];
      if (Number.isFinite(value)) next[key] = Math.max(min, Math.min(max, value));
    }
    return next;
  }

  function read() {
    try { return normalize(defaults, JSON.parse(localStorage.getItem(storageKey))); }
    catch { return { ...defaults }; }
  }

  let settings = read();
  function getSettings() {
    const match = presets.find(preset => Object.keys(bounds).every(key => preset[key] === settings[key]));
    return { ...settings, preset: match?.id || 'custom' };
  }

  function change(next, persist) {
    if (Object.keys(defaults).every(key => next[key] === settings[key])) return getSettings();
    settings = next;
    if (persist) {
      try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Session only. */ }
    }
    for (const apply of graphs) apply(false);
    const state = getSettings();
    window.dispatchEvent(new CustomEvent(eventName, { detail: state }));
    return state;
  }

  function setSettings(patch) {
    return change(normalize(settings, patch), true);
  }

  function applyPreset(id) {
    const preset = presets.find(item => item.id === id);
    return preset ? setSettings({ ...preset, enabled: true }) : getSettings();
  }

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) change(read(), false);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) change(read(), false);
  });

  function connect(source, destination) {
    const context = source.context;
    const bass = context.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 160;
    const treble = context.createBiquadFilter();
    treble.type = 'highshelf';
    const dry = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.knee.value = 0;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
    const wet = context.createGain();

    function apply(immediate) {
      const param = (target, value) => {
        if (immediate) target.value = value;
        else target.setTargetAtTime(value, context.currentTime, 0.012);
      };
      param(bass.gain, settings.enabled ? settings.bass : 0);
      param(treble.gain, settings.enabled ? settings.treble : 0);
      param(treble.frequency, Math.min(settings.frequency, context.sampleRate * 0.49));
      const strength = settings.compression / 100;
      const active = settings.enabled && strength > 0;
      const threshold = -12 - 12 * strength;
      const ratio = 1 + 3 * strength;
      param(compressor.threshold, threshold);
      param(compressor.ratio, ratio);
      // A Web Audio compressor adds makeup gain even below threshold. Reverse
      // that gain for this hard-knee curve so the slider only tames loud peaks.
      const makeupDb = 0.6 * -threshold * (1 - 1 / ratio);
      param(wet.gain, active ? 10 ** (-makeupDb / 20) : 0);
      param(dry.gain, active ? 0 : 1);
    }
    apply(true);
    bass.connect(treble);
    treble.connect(dry).connect(destination);
    treble.connect(compressor).connect(wet).connect(destination);
    source.connect(bass);
    graphs.add(apply);
    return () => {
      if (!graphs.delete(apply)) return;
      source.disconnect(bass);
      for (const node of [bass, treble, dry, compressor, wet]) node.disconnect();
    };
  }

  window.InteonSoundFilter = Object.freeze({ presets, getSettings, setSettings, applyPreset, connect });
})();
