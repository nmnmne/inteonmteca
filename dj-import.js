(() => {
  'use strict';

  const sampleRate = 11025;
  const bins = 8192;
  const hop = 128;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  async function fileId(file) {
    const signature = [file.size.toString(36)];
    const width = 16384;
    for (const fraction of [0, 0.5, 1]) {
      const begin = Math.floor(Math.max(0, file.size - width) * fraction);
      const bytes = new Uint8Array(await file.slice(begin, begin + width).arrayBuffer());
      let hash = 2166136261;
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
      signature.push((hash >>> 0).toString(36));
    }
    return 'local-' + signature.join('-');
  }

  function mediaDuration(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const finish = (duration, message) => {
        clearTimeout(timer);
        audio.onloadedmetadata = audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
        if (message) reject(new Error(message));
        else resolve(duration);
      };
      const timer = setTimeout(() => finish(0, 'Не удалось прочитать аудиофайл.'), 12000);
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onerror = () => finish(0, 'Браузер не смог открыть этот аудиофайл. Проверьте его формат.');
      audio.preload = 'metadata';
      audio.src = url;
    });
  }

  function normalize(values) {
    const ordered = values.slice().sort();
    const scale = Math.max(0.00001, ordered[Math.floor(ordered.length * 0.998)]);
    return Array.from(values, value => Math.min(1, value / scale));
  }

  async function envelopes(channels, length, rate) {
    const peaks = new Float32Array(bins);
    const bass = new Float32Array(bins);
    const flux = new Float32Array(Math.ceil(length / hop));
    const bassSmoothing = 1 - Math.exp(-2 * Math.PI * 160 / rate);
    const midSmoothing = 1 - Math.exp(-2 * Math.PI * 1800 / rate);
    let low = 0, mid = 0, peak = 0, power = 0, lowPower = 0;
    let eLow = 0, eMid = 0, eHigh = 0, prevLow = 0, prevMid = 0, prevHigh = 0;
    let bin = 0, begin = 0, end = Math.max(1, Math.floor(length / bins));
    let nextPause = performance.now() + 8;
    for (let i = 0; i < length; i++) {
      let value = channels[0][i];
      if (channels.length > 1) value = (value + channels[1][i]) * 0.5;
      low += bassSmoothing * (value - low);
      mid += midSmoothing * (value - mid);
      const sq = value * value;
      const lsq = low * low;
      peak = Math.max(peak, Math.abs(value));
      power += sq;
      lowPower += lsq;
      eLow += lsq;
      eMid += (mid - low) ** 2;
      eHigh += (value - mid) ** 2;
      if ((i + 1) % hop === 0) {
        const index = Math.floor(i / hop);
        const l = Math.log1p(80 * Math.sqrt(eLow / hop));
        const m = Math.log1p(100 * Math.sqrt(eMid / hop));
        const h = Math.log1p(180 * Math.sqrt(eHigh / hop));
        flux[index] = 0.45 * Math.max(0, l - prevLow) +
          0.3 * Math.max(0, m - prevMid) + 0.25 * Math.max(0, h - prevHigh);
        prevLow = l; prevMid = m; prevHigh = h;
        eLow = eMid = eHigh = 0;
      }
      if (i + 1 === end) {
        const level = 0.72 * Math.sqrt(power / (end - begin)) + 0.28 * peak;
        const bassLevel = Math.sqrt(lowPower / (end - begin));
        // Duplicate the sample into adjacent bins for very short clips.
        do {
          peaks[bin] = level;
          bass[bin++] = bassLevel;
          end = Math.floor((bin + 1) * length / bins);
        } while (bin < bins && end <= i + 1);
        begin = i + 1;
        peak = power = lowPower = 0;
      }
      if (i % 16384 === 0 && performance.now() > nextPause) {
        await pause();
        nextPause = performance.now() + 8;
      }
    }
    return { peaks: normalize(peaks), bass: normalize(bass), flux };
  }

  async function beatGrid(flux, rate) {
    const unknown = { bpm: null, offset: 0 };
    const framesPerSecond = rate / hop;
    if (flux.length < framesPerSecond * 4) return unknown;
    const mean = flux.reduce((sum, x) => sum + x, 0) / flux.length;
    const strength = flux.map(value => value - mean);
    const energy = strength.reduce((sum, x) => sum + x * x, 0);
    if (energy < 1e-6) return unknown;
    const maxLag = Math.ceil(60 / 65 * framesPerSecond * 4) + 2;
    const correlations = new Float32Array(maxLag);
    let nextPause = performance.now() + 8;
    for (let lag = 1; lag < maxLag; lag++) {
      let sum = 0;
      for (let i = lag; i < strength.length; i++) sum += strength[i] * strength[i - lag];
      correlations[lag] = sum / energy;
      if (performance.now() > nextPause) {
        await pause();
        nextPause = performance.now() + 8;
      }
    }
    let winner = 0, best = 0;
    for (let step = 650; step <= 1800; step++) {
      const bpm = step / 10;
      let score = 0;
      for (let n = 1; n <= 4; n++) {
        const lag = n * 60 / bpm * framesPerSecond;
        const floor = Math.floor(lag), fraction = lag - floor;
        score += ((1 - fraction) * correlations[floor] +
          fraction * correlations[floor + 1]) / Math.sqrt(n);
      }
      score *= Math.exp(-0.16 * Math.log2(bpm / 120) ** 2);
      if (score > best) { best = score; winner = bpm; }
    }
    if (best < 0.12) return unknown;

    const threshold = flux.slice().sort()[Math.floor(flux.length * 0.65)];
    const events = [];
    for (let i = 1; i + 1 < flux.length; i++) {
      if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) events.push(i);
    }
    if (!events.length) return unknown;
    let bpm = winner, offset = 0, bestPhaseScore = 0;
    const resolution = 80;
    const phase = new Float64Array(resolution);
    for (let step = -55; step <= 55; step++) {
      const candidate = winner + step / 100;
      phase.fill(0);
      for (const index of events) {
        const position = (index + 0.5) / framesPerSecond * candidate / 60;
        phase[Math.floor((position % 1) * resolution)] += flux[index];
      }
      for (let j = 0; j < resolution; j++) {
        let score = 0;
        for (let k = -4; k <= 4; k++) score += phase[(j + k + resolution) % resolution] * (5 - Math.abs(k));
        if (score > bestPhaseScore) {
          bestPhaseScore = score;
          bpm = candidate;
          offset = (j + 0.5) / resolution * 60 / bpm;
        }
      }
      if (performance.now() > nextPause) {
        await pause();
        nextPause = performance.now() + 8;
      }
    }
    return { bpm: Math.round(bpm * 100) / 100, offset };
  }

  async function tonalKey(channels, length, rate) {
    const size = 4096;
    if (length < size) return null;
    const chroma = new Float64Array(12);
    const frame = new Float32Array(size);
    const window = Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(i * 2 * Math.PI / (size - 1)));
    const coefficients = Float64Array.from({ length: 60 }, (_, i) => {
      const hz = 440 * 2 ** ((36 + i - 69) / 12);
      return 2 * Math.cos(2 * Math.PI * hz / rate);
    });
    const count = Math.max(1, Math.min(64, Math.floor(length / size)));
    let nextPause = performance.now() + 8;
    for (let block = 0; block < count; block++) {
      const start = Math.floor((length - size) * (block + 0.5) / count);
      for (let j = 0; j < size; j++) {
        let sample = channels[0][start + j];
        if (channels.length > 1) sample = (sample + channels[1][start + j]) * 0.5;
        frame[j] = sample * window[j];
      }
      const local = new Float64Array(12);
      for (let note = 0; note < coefficients.length; note++) {
        const coefficient = coefficients[note];
        let previous = 0, older = 0;
        for (let j = 0; j < size; j++) {
          const current = frame[j] + coefficient * previous - older;
          older = previous;
          previous = current;
        }
        const power = previous * previous + older * older - coefficient * previous * older;
        local[note % 12] += Math.sqrt(Math.max(0, power));
      }
      const total = local.reduce((sum, value) => sum + value, 0);
      if (total > 1) local.forEach((value, i) => { chroma[i] += value / total; });
      if (performance.now() > nextPause) {
        await pause();
        nextPause = performance.now() + 8;
      }
    }
    const profiles = [
      [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
      [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    ];
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const average = chroma.reduce((sum, value) => sum + value, 0) / 12;
    const centered = chroma.map(value => value - average);
    const norm = Math.hypot(...centered);
    if (norm < 1e-6) return null;
    const scores = [];
    profiles.forEach((profile, minor) => {
      const avg = profile.reduce((sum, n) => sum + n, 0) / 12;
      const weights = profile.map(n => n - avg);
      for (let root = 0; root < 12; root++) {
        let score = 0;
        for (let n = 0; n < 12; n++) score += centered[(root + n) % 12] * weights[n];
        scores.push({ score: score / (norm * Math.hypot(...weights)), key: names[root] + (minor ? 'm' : '') });
      }
    });
    scores.sort((a, b) => b.score - a.score);
    return scores[0].score > 0.53 && scores[0].score - scores[1].score > 0.04 ? scores[0].key : null;
  }

  async function readFile(file) {
    if (!file || !file.size) throw new Error('Выберите непустой аудиофайл.');
    const src = URL.createObjectURL(file);
    try {
      const duration = await mediaDuration(src);
      const name = (file.name || 'Аудиофайл').replace(/\.[^.]+$/, '');
      const parts = name.split(/\s+[–—-]\s+/);
      const artist = parts.length > 1 ? parts.shift().trim() : '';
      const track = {
        id: await fileId(file), src, title: parts.join(' - ').trim() || name, artist, duration,
        bpm: null, offset: 0, key: null, peaks: [], bass: [], imported: true, analysisStatus: 'ready',
      };
      track.normalization = await window.DJImportLoudness.measure(file, duration);
      const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
      const bytesBudget = (lowMemory ? 96 : 200) * 1024 * 1024;
      // Browsers decode whole files. Leave space for the encoded data, stereo PCM,
      // decoder scratch space and the two active decks; oversized files can stream.
      if (file.size * 1.6 + duration * sampleRate * 12 > bytesBudget || duration > 1200) {
        track.analysisStatus = 'limited';
        track.analysisMessage = 'Большой файл доступен для сведения без автоматического анализа.';
        return track;
      }
      try {
        const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const decoder = new Decoder(1, 1, sampleRate);
        const decoded = await decoder.decodeAudioData(await file.arrayBuffer());
        if (!decoded.length || !decoded.numberOfChannels) throw new Error();
        const channels = [decoded.getChannelData(0)];
        if (decoded.numberOfChannels > 1) channels.push(decoded.getChannelData(1));
        const { peaks, bass, flux } = await envelopes(channels, decoded.length, decoded.sampleRate);
        const grid = await beatGrid(flux, decoded.sampleRate);
        Object.assign(track, grid, {
          peaks, bass, duration: decoded.duration,
          key: await tonalKey(channels, decoded.length, decoded.sampleRate),
        });
      } catch {
        track.analysisStatus = 'unavailable';
        track.analysisMessage = 'Файл доступен для воспроизведения. Браузер не смог выполнить анализ.';
      }
      return track;
    } catch (error) {
      URL.revokeObjectURL(src);
      if (error instanceof Error && /[а-яё]/i.test(error.message)) throw error;
      throw new Error('Не удалось прочитать файл с устройства.');
    }
  }

  // Selecting a folder or multiple files should only allocate one decoder at a time.
  let pending = Promise.resolve();
  window.DJImport = {
    read(file) {
      const result = pending.then(() => readFile(file));
      pending = result.then(() => {}, () => {});
      return result;
    },
  };
})();
