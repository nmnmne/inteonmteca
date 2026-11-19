/* Local programme measurement. PCM WAV is scanned in slices, including large files.
   Compressed audio uses a bounded full decode at its source rate when available.
   Reference: ITU-R BS.1770-4 §1, Annex 2 (fourfold true-peak estimation). */
(() => {
  'use strict';

  const version = 1,
    target = -14,
    ceiling = -1;
  const chunkFrames = 32768,
    taps = 24;
  const unavailable = (reason) => ({
    version,
    target,
    ceiling,
    status: 'unavailable',
    mode: 'adaptive',
    reason,
    gainDb: 0,
    integrated: null,
    truePeak: null,
  });
  const lufs = (power) => -0.691 + 10 * Math.log10(power);
  const yieldToMixer = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Four interpolation phases (the integer phase is the original sample).
  // Normalize each Hann-windowed sinc kernel to unity DC gain.
  const phases = [0.25, 0.5, 0.75].map((fraction) => {
    const h = Float64Array.from({ length: taps }, (_, i) => {
      const x = i - (taps / 2 - 1 + fraction);
      return (Math.sin(Math.PI * x) / (Math.PI * x)) * (0.5 + 0.5 * Math.cos((2 * Math.PI * x) / taps));
    });
    const dc = h.reduce((sum, n) => sum + n, 0);
    return h.map((n) => n / dc);
  });
  const firBound = Math.max(...phases.map((h) => h.reduce((sum, n) => sum + Math.abs(n), 0)));

  function weighting(rate) {
    // Bilinear transforms of the shelf and RLB high-pass in the K-weighting chain.
    const sections = [
      [1681.974450955533, 0.7071752369554196],
      [38.13547087602444, 0.5003270373238773],
    ];
    return sections.map(([hz, q], index) => {
      const k = Math.tan((Math.PI * hz) / rate),
        k2 = k * k,
        damping = k / q;
      const a0 = 1 + damping + k2;
      const v = 10 ** (3.999843853973347 / 20),
        middle = v ** 0.4996667741545416;
      const numerator =
        index === 0
          ? [(v + middle * damping + k2) / a0, (2 * (k2 - v)) / a0, (v - middle * damping + k2) / a0]
          : [1, -2, 1];
      return [...numerator, (2 * (k2 - 1)) / a0, (1 - damping + k2) / a0];
    });
  }

  function createMeter(rate, channels) {
    const [shelf, highpass] = weighting(rate);
    const [b0, b1, b2, a1, a2] = shelf,
      [c0, c1, c2, d1, d2] = highpass;
    const steps = [],
      hop = Math.round(rate / 10);
    const states = Array.from({ length: channels }, () => ({
      z1: 0,
      z2: 0,
      z3: 0,
      z4: 0,
      pos: 0,
      sum: 0,
      segment: 0,
      tail: new Float32Array(taps - 1),
    }));
    let peak = 0;

    function truePeak(samples, state) {
      const padded = new Float32Array(samples.length + taps - 1);
      padded.set(state.tail);
      padded.set(samples, taps - 1);
      state.tail.set(padded.subarray(samples.length));
      let localPeak = 0;
      for (const x of padded) localPeak = Math.max(localPeak, Math.abs(x));
      if (localPeak * firBound <= peak || !localPeak) return;
      peak = Math.max(peak, localPeak);
      for (let i = 0; i < samples.length; i++) {
        let a = 0,
          b = 0,
          c = 0;
        for (let j = 0; j < taps; j++) {
          const sample = padded[i + j];
          a += phases[0][j] * sample;
          b += phases[1][j] * sample;
          c += phases[2][j] * sample;
        }
        peak = Math.max(peak, Math.abs(a), Math.abs(b), Math.abs(c));
      }
    }
    function push(samples, channel) {
      const s = states[channel];
      truePeak(samples, s);
      let { z1, z2, z3, z4, pos, sum, segment } = s;
      for (const x of samples) {
        const y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        const z = c0 * y + z3;
        z3 = c1 * y - d1 * z + z4;
        z4 = c2 * y - d2 * z;
        sum += z * z;
        if (++pos === hop) {
          steps[segment] = (steps[segment] || 0) + sum / hop;
          segment++;
          pos = 0;
          sum = 0;
        }
      }
      Object.assign(s, { z1, z2, z3, z4, pos, sum, segment });
    }
    function finish() {
      for (const s of states) truePeak(new Float32Array(taps), s);
      const gated = [];
      for (let i = 3; i < steps.length; i++) {
        const power = (steps[i] + steps[i - 1] + steps[i - 2] + steps[i - 3]) * 0.25;
        if (lufs(power) > -70) gated.push(power);
      }
      const measuredPeak = peak ? 20 * Math.log10(peak) : null;
      const result = {
        version,
        target,
        ceiling,
        status: 'measured',
        mode: 'static',
        integrated: null,
        truePeak: measuredPeak,
        gainDb: 0,
        sampleRate: rate,
        channels,
      };
      if (!gated.length) {
        result.status = peak ? 'ungated' : 'silent';
        // Very short clips and below-gate signals have no BS.1770 integrated value.
        if (peak) result.gainDb = Math.min(0, ceiling - measuredPeak);
        return result;
      }
      const relativeGate = (gated.reduce((sum, n) => sum + n, 0) / gated.length) * 0.1;
      let sum = 0,
        count = 0;
      for (const power of gated)
        if (power > relativeGate) {
          sum += power;
          count++;
        }
      result.integrated = lufs(sum / count);
      // A mono source is measured as mono, then played from two mixer speakers.
      result.playbackIntegrated = result.integrated + (channels === 1 ? 10 * Math.log10(2) : 0);
      result.gainDb = Math.min(target - result.playbackIntegrated, ceiling - measuredPeak);
      return result;
    }
    return { push, finish };
  }

  // Stream-relative gain for files the browser cannot decode within its memory
  // budget. Native filters see both stereo channels upstream of trim and EQ.
  // Drive only this track's trim; the shared master limiter still protects sums.
  function createAdaptive(context, source, gain, audio) {
    let nodes, interval, level, silentSince;

    function stop() {
      clearInterval(interval);
      interval = null;
      level = null;
      silentSince = null;
    }

    function update() {
      if (!nodes || context.state !== 'running' || audio.paused) return;
      let power = 0,
        peak = 0;
      for (const meter of nodes.meters) {
        meter.weighted.getFloatTimeDomainData(meter.samples);
        let energy = 0;
        for (const sample of meter.samples) energy += sample * sample;
        power += energy / meter.samples.length;
        meter.raw.getFloatTimeDomainData(meter.samples);
        for (const sample of meter.samples) peak = Math.max(peak, Math.abs(sample));
      }
      const now = context.currentTime;
      // Never chase the noise floor with makeup gain. Retire accumulated gain in a long rest.
      if (lufs(power) < -55 || peak < 0.0001) {
        silentSince ??= now;
        if (now - silentSince > 2) {
          level = null;
          gain.setTargetAtTime(1, now, 0.4);
        }
        return;
      }
      silentSince = null;
      level = level === null ? power : level + (power - level) * 0.06;
      const desiredDb = Math.max(-36, Math.min(24, target - lufs(level), -1.5 - 20 * Math.log10(peak)));
      const desired = 10 ** (desiredDb / 20);
      gain.setTargetAtTime(desired, now, desired < gain.value ? 0.12 : 0.85);
    }

    function start() {
      if (nodes && !interval && !audio.paused) interval = setInterval(update, 120);
    }

    function configure(track) {
      stop();
      if (nodes) {
        source.disconnect(nodes.shelf);
        source.disconnect(nodes.dry);
        for (const node of nodes.all) node.disconnect();
        nodes = null;
      }
      const now = context.currentTime;
      gain.cancelScheduledValues(now);
      if (!track?.imported || track.normalization?.status !== 'unavailable') return;
      const [pre, rlb] = weighting(context.sampleRate);
      const shelf = context.createIIRFilter(pre.slice(0, 3), [1, ...pre.slice(3)]);
      shelf.channelCount = 2;
      shelf.channelCountMode = 'explicit';
      const hp = context.createIIRFilter(rlb.slice(0, 3), [1, ...rlb.slice(3)]);
      const dry = context.createGain();
      dry.channelCount = 2;
      dry.channelCountMode = 'explicit';
      const split = context.createChannelSplitter(2),
        rawSplit = context.createChannelSplitter(2);
      source.connect(shelf).connect(hp).connect(split);
      source.connect(dry).connect(rawSplit);
      const all = [shelf, hp, dry, split, rawSplit];
      const meters = Array.from({ length: 2 }, (_, i) => {
        const weighted = context.createAnalyser(),
          raw = context.createAnalyser();
        const size = Math.min(32768, 2 ** Math.ceil(Math.log2(context.sampleRate * 0.16)));
        weighted.fftSize = raw.fftSize = size;
        split.connect(weighted, i);
        rawSplit.connect(raw, i);
        all.push(weighted, raw);
        return { weighted, raw, samples: new Float32Array(size) };
      });
      nodes = { shelf, dry, meters, all };
      start();
    }
    audio.addEventListener('play', start);
    audio.addEventListener('pause', stop);
    audio.addEventListener('ended', stop);
    audio.addEventListener('seeked', () => {
      if (nodes) {
        stop();
        start();
      }
    });
    return { configure };
  }

  function fourCC(view, at) {
    return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at, 4));
  }

  async function waveFormat(file) {
    const head = new DataView(await file.slice(0, 12).arrayBuffer());
    if (head.byteLength < 12 || fourCC(head, 0) !== 'RIFF' || fourCC(head, 8) !== 'WAVE') return null;
    let fmt;
    for (let at = 12, i = 0; at + 8 <= file.size && i < 256; i++) {
      const h = new DataView(await file.slice(at, at + 8).arrayBuffer());
      const id = fourCC(h, 0),
        size = h.getUint32(4, true);
      at += 8;
      if (id === 'fmt ' && size >= 16) {
        const v = new DataView(await file.slice(at, at + Math.min(size, 40)).arrayBuffer());
        let tag = v.getUint16(0, true);
        if (tag === 0xfffe && v.byteLength >= 40) tag = v.getUint16(24, true);
        fmt = {
          tag,
          channels: v.getUint16(2, true),
          rate: v.getUint32(4, true),
          stride: v.getUint16(12, true),
          bits: v.getUint16(14, true),
        };
      } else if (id === 'data' && fmt) {
        return { ...fmt, offset: at, bytes: Math.min(size, file.size - at) };
      }
      at += size + (size & 1);
    }
    return null;
  }

  function wavSample(v, at, bits, tag) {
    if (tag === 3) return bits === 32 ? v.getFloat32(at, true) : v.getFloat64(at, true);
    if (bits === 8) return (v.getUint8(at) - 128) / 128;
    if (bits === 16) return v.getInt16(at, true) / 32768;
    if (bits === 24)
      return (v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16)) / 8388608;
    return v.getInt32(at, true) / 2147483648;
  }

  async function scanWave(file, fmt) {
    const { bits, stride, tag, channels, rate } = fmt;
    const frames = Math.floor(fmt.bytes / stride);
    const meter = createMeter(rate, channels);
    for (let pos = 0; pos < frames; pos += chunkFrames) {
      const n = Math.min(chunkFrames, frames - pos),
        at = fmt.offset + pos * stride;
      const chunk = new DataView(await file.slice(at, at + n * stride).arrayBuffer());
      for (let ch = 0; ch < channels; ch++) {
        const data = new Float32Array(n);
        for (let i = 0; i < n; i++) data[i] = wavSample(chunk, i * stride + (ch * bits) / 8, bits, tag);
        meter.push(data, ch);
      }
      // File slicing yields to the event loop between chunks.
    }
    return meter.finish();
  }

  async function mp4Rate(file) {
    // Jump over mdat to find a trailing moov even in a multi-GB file.
    for (let at = 0, count = 0; at + 8 <= file.size && count < 256; count++) {
      const header = new DataView(await file.slice(at, at + 16).arrayBuffer());
      let length = header.getUint32(0),
        head = 8;
      if (length === 1 && header.byteLength >= 16) {
        length = Number(header.getBigUint64(8));
        head = 16;
      }
      if (!length) length = file.size - at;
      if (!Number.isSafeInteger(length) || length < head || length > file.size - at) break;
      if (fourCC(header, 4) === 'moov') {
        const data = new Uint8Array(
          await file.slice(at + head, at + Math.min(length, head + 512 * 1024)).arrayBuffer(),
        );
        const marker = new TextDecoder('latin1').decode(data),
          view = new DataView(data.buffer);
        for (const entry of ['mp4a', 'alac', 'fLaC', 'Opus']) {
          const pos = marker.indexOf(entry);
          if (pos < 4 || pos + 32 > data.length || view.getUint32(pos - 4) < 36) continue;
          const rate = view.getUint16(pos + 28);
          if (rate >= 8000) return rate;
        }
        break;
      }
      at += length;
    }
    return 48000;
  }

  // A null rate means that the file explicitly declares a surround mix. Its
  // live stereo downmix is the signal the adaptive detector should measure.
  async function decoderRate(file) {
    const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const marker = new TextDecoder('latin1').decode(bytes);
    if (marker.startsWith('fLaC') && bytes.length >= 42) {
      if (((bytes[20] >> 1) & 7) + 1 > 2) return null;
      return bytes[18] * 4096 + bytes[19] * 16 + (bytes[20] >> 4);
    }
    if (marker.slice(4, 8) === 'ftyp') return mp4Rate(file);
    if (marker.startsWith('OggS')) {
      const vorbis = marker.indexOf('\x01vorbis');
      if (vorbis >= 0 && vorbis + 16 <= bytes.length) {
        if (bytes[vorbis + 11] > 2) return null;
        return new DataView(bytes.buffer).getUint32(vorbis + 12, true);
      }
      const opus = marker.indexOf('OpusHead');
      if (opus >= 0 && bytes[opus + 9] > 2) return null;
      return 48000; // Opus uses a 48 kHz decoding clock.
    }
    // Scan the first valid MPEG audio header after any attached ID3 tag.
    let at = 0;
    if (marker.startsWith('ID3') && bytes.length >= 10) {
      at =
        10 +
        (((bytes[6] & 127) << 21) | ((bytes[7] & 127) << 14) | ((bytes[8] & 127) << 7) | (bytes[9] & 127));
      if (bytes[5] & 16) at += 10;
    }
    const audio =
      at >= bytes.length - 4
        ? new Uint8Array(await file.slice(at, at + 8192).arrayBuffer())
        : bytes.subarray(at);
    if (!at && audio[0] !== 255 && !/\.mp[123]$/i.test(file.name || '')) return 48000;
    for (let i = 0; i + 4 <= Math.min(audio.length, 8192); i++) {
      if (audio[i] !== 255 || (audio[i + 1] & 224) !== 224) continue;
      if ((audio[i + 1] & 246) === 240) {
        const rate = [
          96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
        ][(audio[i + 2] >> 2) & 15];
        if (rate) return rate;
      }
      const version = (audio[i + 1] >> 3) & 3,
        layer = (audio[i + 1] >> 1) & 3,
        index = (audio[i + 2] >> 2) & 3;
      if (version === 1 || !layer || index === 3 || audio[i + 2] >> 4 === 15) continue;
      return [44100, 48000, 32000][index] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    }
    return 48000;
  }

  async function measure(file, duration) {
    try {
      const fmt = await waveFormat(file);
      if (fmt?.channels > 2) return unavailable('channels');
      if (
        fmt &&
        fmt.channels <= 2 &&
        fmt.channels >= 1 &&
        fmt.rate >= 8000 &&
        fmt.rate <= 384000 &&
        fmt.stride === (fmt.channels * fmt.bits) / 8 &&
        ((fmt.tag === 1 && [8, 16, 24, 32].includes(fmt.bits)) ||
          (fmt.tag === 3 && [32, 64].includes(fmt.bits)))
      )
        return await scanWave(file, fmt);
      const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Decoder) return unavailable('decoder');
      const rate = await decoderRate(file);
      if (rate === null) return unavailable('channels');
      const budget = (navigator.deviceMemory && navigator.deviceMemory <= 4 ? 160 : 360) * 1024 * 1024;
      if (!(duration > 0) || file.size * 1.7 + duration * rate * 16 > budget) return unavailable('memory');
      const decoded = await new Decoder(2, 1, rate).decodeAudioData(await file.arrayBuffer());
      if (decoded.numberOfChannels > 2 || !decoded.numberOfChannels) return unavailable('channels');
      const meter = createMeter(decoded.sampleRate, decoded.numberOfChannels);
      let nextYield = performance.now() + 12;
      for (let at = 0; at < decoded.length; at += chunkFrames) {
        for (let ch = 0; ch < decoded.numberOfChannels; ch++)
          meter.push(decoded.getChannelData(ch).subarray(at, at + chunkFrames), ch);
        if (performance.now() >= nextYield) {
          await yieldToMixer();
          nextYield = performance.now() + 12;
        }
      }
      return meter.finish();
    } catch {
      return unavailable('decode');
    }
  }

  // Serialize old-library upgrades and new imports to bound concurrent PCM allocations.
  let queue = Promise.resolve();
  window.DJImportLoudness = {
    version,
    createAdaptive,
    measure(file, duration) {
      const current = queue.then(() => measure(file, duration));
      queue = current.catch(() => {});
      return current;
    },
  };
})();
