/* This renderer is shared by the AudioWorklet and the LAN preview fallback. */
(() => {
  'use strict';

  class Stylus {
    constructor(outputRate, report) {
      this.outputRate = outputRate;
      this.report = report;
      this.blocks = new Map();
      this.active = false;
      this.rate = outputRate;
      this.gain = 0;
    }

    message(m) {
      switch (m.type) {
        case 'format':
          this.rate = m.rate;
          this.blocks.clear();
          break;
        case 'block': this.blocks.set(m.index, m.channels); break;
        case 'drop': this.blocks.delete(m.index); break;
        case 'start':
          this.active = true;
          this.head = m.time * this.rate;
          this.left = 0;
          this.gain = 0;
          break;
        case 'move':
          if (!this.active) break;
          this.left = Math.max(1, Math.round(m.interval * this.outputRate));
          this.step = (m.time * this.rate - this.head) / this.left;
          break;
        case 'stop':
          this.active = false;
          this.gain = 0;
          break;
        case 'dispose':
          this.disposed = true;
          this.active = this.capturing = false;
          this.blocks.clear();
          this.ring = null;
          break;
        case 'capture':
          this.capturing = m.on;
          if (!m.on) break;
          // Short, source-timed history for imports too large to decode in memory.
          // New seeks and new transport speeds start a fresh contiguous window.
          this.ring ??= [new Float32Array(this.outputRate * 12), new Float32Array(this.outputRate * 12)];
          this.written = 0;
          this.origin = m.time;
          this.transportRate = m.speed;
          this.nextReport = 0;
          this.rate = this.outputRate;
          break;
      }
    }

    render(input, out) {
      const count = out[0].length;
      if (this.capturing && input[0]) {
        const length = this.ring[0].length;
        for (let ch = 0; ch < 2; ch++) {
          const data = input[ch] || input[0], index = this.written % length;
          if (index + count <= length) this.ring[ch].set(data, index);
          else {
            const first = length - index;
            this.ring[ch].set(data.subarray(0, first), index);
            this.ring[ch].set(data.subarray(first), 0);
          }
        }
        this.written += count;
        if (this.written >= this.nextReport) {
          this.report({type: 'history', from: this.origin + Math.max(0, this.written - length) * this.transportRate / this.rate,
            to: this.origin + (this.written - 1) * this.transportRate / this.rate});
          this.nextReport = this.written + this.outputRate / 30;
        }
      }
      if (!this.active || (!this.left && !this.gain)) return;
      const blockSize = this.rate * 2;
      const fade = 1 / (this.outputRate * .002);
      for (let i = 0; i < count; i++) {
        if (this.left > 0) {
          this.head += this.step;
          this.left--;
          this.gain = Math.min(1, this.gain + fade);
        } else {
          this.gain = Math.max(0, this.gain - fade);
          if (!this.gain) break;
        }
        let data, at, next, other;
        if (this.ring) {
          const frame = (this.head - this.origin * this.rate) / this.transportRate;
          if (frame < Math.max(0, this.written - this.ring[0].length) || frame >= this.written - 1) continue;
          at = frame % this.ring[0].length;
          next = (Math.floor(at) + 1) % this.ring[0].length;
          data = other = this.ring;
        } else {
          const block = Math.floor(this.head / blockSize);
          data = this.blocks.get(block);
          if (!data) continue;
          at = this.head - block * blockSize;
          next = Math.floor(at) + 1;
          if (at >= data[0].length) continue;
          other = data;
          if (next === data[0].length) {
            other = this.blocks.get(block + 1);
            next = other ? 0 : Math.floor(at);
            other ??= data;
          }
        }
        const index = Math.floor(at), frac = at - index;
        for (let ch = 0; ch < out.length; ch++) {
          const a = (data[ch] || data[0])[index], b = (other[ch] || other[0])[next];
          out[ch][i] = (a + (b - a) * frac) * this.gain;
        }
      }
    }
  }

  if (typeof AudioWorkletProcessor !== 'undefined') {
    registerProcessor('inteon-vinyl', class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.stylus = new Stylus(sampleRate, msg => this.port.postMessage(msg));
        this.port.onmessage = ({data}) => this.stylus.message(data);
      }
      process(inputs, outputs) {
        if (this.stylus.disposed) return false;
        if (outputs[0]?.[0]) this.stylus.render(inputs[0] || [], outputs[0]);
        return true;
      }
    });
    return;
  }

  const modules = new WeakMap();
  async function voice(context, report) {
    if (context.audioWorklet) {
      try {
        if (!modules.has(context)) modules.set(context, context.audioWorklet.addModule(new URL('dj-scratch.js', document.baseURI)));
        await modules.get(context);
        const node = new AudioWorkletNode(context, 'inteon-vinyl', {outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit'});
        node.port.onmessage = ({data}) => report(data);
        return {node, send: m => node.port.postMessage(m), close() {
          node.port.postMessage({type: 'dispose'});
          node.port.close();
          node.disconnect();
        }};
      } catch { /* An insecure LAN origin or older browser can use the same renderer on its audio callback. */ }
    }
    const node = context.createScriptProcessor(512, 2, 2), stylus = new Stylus(context.sampleRate, report);
    node.onaudioprocess = ({inputBuffer, outputBuffer}) => {
      const sources = [inputBuffer.getChannelData(0), inputBuffer.getChannelData(1)];
      const outputs = [outputBuffer.getChannelData(0), outputBuffer.getChannelData(1)];
      outputs.forEach(channel => channel.fill(0));
      stylus.render(sources, outputs);
    };
    return {node, send: m => stylus.message(m), close() { node.onaudioprocess = null; node.disconnect(); }};
  }

  async function range(url, from, bytes, signal) {
    const response = await fetch(url, {headers: {Range: 'bytes=' + from + '-' + (from + bytes - 1)}, signal});
    if (!response.ok) throw new Error('Аудиоданные недоступны (' + response.status + ').');
    const size = Number(response.headers.get('Content-Range')?.split('/')[1] || response.headers.get('Content-Length'));
    if (response.status === 206) return {data: await response.arrayBuffer(), size};
    if (from) throw new Error('Сервер не поддерживает чтение фрагментов.');
    // A static host can ignore Range. Read only the requested prefix.
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      while (length < bytes) {
        const {value, done} = await reader.read();
        if (done) break;
        const take = value.subarray(0, bytes - length);
        chunks.push(take);
        length += take.length;
      }
    } finally { void reader.cancel(); }
    const data = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
    return {data: data.buffer, size};
  }

  function waveFormat(data, fileSize) {
    const view = new DataView(data);
    const four = at => view.getUint32(at);
    if (data.byteLength < 44 || four(0) !== 0x52494646 || four(8) !== 0x57415645) return null;
    let format;
    for (let i = 12; i + 8 <= data.byteLength;) {
      const kind = four(i), length = view.getUint32(i + 4, true), start = i + 8;
      if (kind === 0x666d7420 && length >= 16 && start + length <= data.byteLength) {
        let tag = view.getUint16(start, true);
        if (tag === 65534 && length >= 40) tag = view.getUint16(start + 24, true);
        const channels = view.getUint16(start + 2, true), rate = view.getUint32(start + 4, true);
        const stride = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
        if (channels < 1 || channels > 2 || !rate || stride !== channels * bits / 8) return null;
        if (!(tag === 1 && [8,16,24,32].includes(bits) || tag === 3 && [32,64].includes(bits))) return null;
        format = {channels, rate, stride, bits, tag};
      }
      if (kind === 0x64617461 && format) return {...format, offset: start, frames: Math.floor(Math.min(fileSize ? fileSize - start : length, length) / format.stride)};
      i = start + length + (length & 1);
    }
    return null;
  }

  function pcmChannels(data, fmt) {
    const view = new DataView(data), frames = Math.floor(data.byteLength / fmt.stride);
    return Array.from({length: fmt.channels}, (_, channel) => {
      const out = new Float32Array(frames);
      for (let i = 0, at = channel * fmt.bits / 8; i < frames; i++, at += fmt.stride) {
        if (fmt.tag === 3) out[i] = fmt.bits === 32 ? view.getFloat32(at, true) : view.getFloat64(at, true);
        else if (fmt.bits === 16) out[i] = view.getInt16(at, true) / 32768;
        else if (fmt.bits === 24) out[i] = ((view.getUint16(at, true) | (view.getInt8(at + 2) << 16))) / 8388608;
        else if (fmt.bits === 32) out[i] = view.getInt32(at, true) / 2147483648;
        else out[i] = (view.getUint8(at) - 128) / 128;
      }
      return out;
    });
  }

  class DeckVinyl {
    constructor(track, duration, notify) {
      this.track = track;
      this.duration = duration;
      this.notify = notify;
      this.abort = new AbortController();
      this.blocks = new Map();
      this.pending = new Map();
      this.time = 0;
      this.status = 'loading';
      this.prepare().catch(() => this.historyMode());
    }

    async prepare() {
      const master = this.track.masterInfo;
      if (master?.scratchSrc && master.scratchRate && master.scratchFrames) {
        this.url = master.scratchSrc;
        this.format = {rate: master.scratchRate, frames: master.scratchFrames, offset: 0, stride: 4, bits: 16, channels: 2, tag: 1};
      } else {
        this.url = this.track.src || this.track.audio;
        const {data, size} = await range(this.url, 0, 65536, this.abort.signal);
        this.format = waveFormat(data, size);
        if (!this.format) {
          const duration = this.duration();
          const budget = (navigator.deviceMemory <= 4 ? 48 : 96) * 1024 ** 2;
          const rate = [44100, 32000, 22050].find(r => size * 1.5 + duration * r * 12 < budget);
          if (!rate || !duration || !size) { this.historyMode(); return; }
          const response = await fetch(this.url, {signal: this.abort.signal});
          if (!response.ok) throw new Error('Файл недоступен.');
          const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          const buffer = await new Decoder(2, 1, rate).decodeAudioData(await response.arrayBuffer());
          if (this.closed) return;
          this.buffer = buffer;
          this.format = {rate: buffer.sampleRate, frames: buffer.length};
          if (buffer.numberOfChannels > 2) { this.buffer = null; this.historyMode(); return; }
        }
      }
      if (this.closed) return;
      this.voice?.send({type: 'format', rate: this.format.rate});
      this.prime(this.time);
    }

    historyMode() {
      if (this.closed || this.status === 'history') return;
      this.status = 'history';
      this.format = null;
      this.blocks.clear();
      this.connectHistory();
      this.notify();
    }

    async attach(ctx, source, trim, audio) {
      this.mediaNode = source;
      this.audio = audio;
      try {
        const created = await voice(ctx, m => { if (m.type === 'history') this.history = m; });
        if (this.closed) { created.close(); return; }
        this.voice = created;
        created.node.connect(trim);
        this.connectHistory();
        if (this.format) {
          created.send({type: 'format', rate: this.format.rate});
          for (const [index, channels] of this.blocks) created.send({type: 'block', index, channels});
        }
        if (this.gesture) {
          const {time, from, lastMove, interval} = this.gesture;
          if (interval && performance.now() - lastMove < 35) {
            created.send({type: 'start', time: from});
            created.send({type: 'move', time, interval});
          } else created.send({type: 'start', time});
        }
      } catch {
        if (!this.closed) { this.status = 'unavailable'; this.notify(); }
      }
    }

    connectHistory() {
      if (this.status !== 'history' || !this.voice || this.connected) return;
      this.mediaNode.connect(this.voice.node);
      this.connected = true;
      this.capture(!this.audio.paused && !this.audio.seeking);
    }

    capture(on) {
      if (!this.connected) return;
      if (on) this.history = null;
      this.voice.send({type: 'capture', on, time: this.audio.currentTime, speed: this.audio.playbackRate});
    }

    prime(seconds) {
      this.time = Math.max(0, seconds);
      if (!this.format || this.closed) return;
      const center = Math.floor(this.time / 2);
      for (const index of this.blocks.keys()) {
        if (Math.abs(index - center) <= 2) continue;
        this.blocks.delete(index);
        this.voice?.send({type: 'drop', index});
      }
      for (const [index, controller] of this.pending) {
        if (Math.abs(index - center) > 2) controller.abort();
      }
      for (const index of [center, center + 1, center - 1]) {
        const start = index * this.format.rate * 2;
        if (index < 0 || start >= this.format.frames || this.blocks.has(index) || this.pending.has(index)) continue;
        const controller = new AbortController();
        this.pending.set(index, controller);
        const length = Math.min(this.format.frames - start, this.format.rate * 2);
        this.readBlock(start, length, controller.signal).then(channels => {
          if (this.closed || controller.signal.aborted || this.status === 'history') return;
          this.blocks.set(index, channels);
          this.voice?.send({type: 'block', index, channels});
          if (this.status !== 'ready') { this.status = 'ready'; this.notify(); }
        }).catch(() => {
          if (!controller.signal.aborted) this.historyMode();
        }).finally(() => this.pending.delete(index));
      }
    }

    async readBlock(start, length, signal) {
      if (this.buffer) {
        return Array.from({length: this.buffer.numberOfChannels}, (_, ch) => this.buffer.getChannelData(ch).slice(start, start + length));
      }
      const fmt = this.format;
      const {data} = await range(this.url, fmt.offset + start * fmt.stride, length * fmt.stride, signal);
      if (data.byteLength !== length * fmt.stride) throw new Error('Неполный фрагмент пластинки.');
      return pcmChannels(data, fmt);
    }

    start(time) {
      this.gesture = {time, lastMove: performance.now()};
      this.capture(false);
      this.prime(time);
      this.voice?.send({type: 'start', time});
    }

    move(time) {
      if (!this.gesture || time === this.gesture.time) return;
      this.prime(time);
      const now = performance.now();
      const interval = Math.max(.005, Math.min(.034, (now - this.gesture.lastMove) / 1000));
      this.gesture.from = this.gesture.time;
      this.gesture.interval = interval;
      this.gesture.time = time;
      this.gesture.lastMove = now;
      this.voice?.send({type: 'move', time, interval});
    }

    stop() {
      this.gesture = null;
      this.voice?.send({type: 'stop'});
    }

    close() {
      this.closed = true;
      this.abort.abort();
      for (const controller of this.pending.values()) controller.abort();
      if (this.connected) this.mediaNode.disconnect(this.voice.node);
      this.voice?.close();
      this.buffer = null;
      this.blocks.clear();
    }
  }
  window.DJScratch = {create: (track, duration, notify) => new DeckVinyl(track, duration, notify)};
})();
