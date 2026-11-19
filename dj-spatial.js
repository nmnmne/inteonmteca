/* Discrete 7.1.4 speaker matrix. The offline render uses the same filter/delay preset. */
(() => {
  'use strict';

  const channels = Object.freeze(['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR', 'TFL', 'TFR', 'TBL', 'TBR']);
  let pending;
  function loadPreset() {
    if (!pending) {
      pending = fetch(new URL('assets/dj-spatial/preset.json?v=1', document.baseURI))
        .then(response => {
          if (!response.ok) throw new Error('Не удалось загрузить настройки 7.1.4.');
          return response.json();
        }).then(preset => {
          if (preset.channels.map(channel => channel.speaker).join() !== channels.join()) {
            throw new Error('Неизвестный порядок выходов 7.1.4.');
          }
          return preset;
        }).catch(error => {
          pending = null;
          throw error;
        });
    }
    return pending;
  }

  function createBus(context, preset, headphones = false) {
    const nodes = [];
    function keep(node) { nodes.push(node); return node; }
    const input = keep(context.createGain());
    input.channelCount = 2;
    input.channelCountMode = 'explicit';
    const split = input.connect(keep(context.createChannelSplitter(2)));
    const speakerBus = keep(context.createChannelMerger(channels.length));
    let output = speakerBus;
    let currentTone = null;

    function stopTone() {
      if (!currentTone) return;
      currentTone.stop();
      currentTone = null;
    }

    function dispose() {
      stopTone();
      for (const node of nodes) node.disconnect();
      nodes.length = 0;
    }

    try {
      preset.channels.forEach((channel, index) => {
        // Merge weighted left and right into the mono signal for this one speaker.
        let leg = keep(context.createGain());
        for (const [side, coefficient] of [channel.left, channel.right].entries()) {
          const gain = keep(context.createGain());
          gain.gain.value = coefficient;
          split.connect(gain, side);
          gain.connect(leg);
        }
        for (const type of ['highpass', 'lowpass', 'allpass']) {
          if (!channel[type]) continue;
          for (let n = 0; n < (channel[type + 'Stages'] || 1); n++) {
            const biquad = keep(context.createBiquadFilter());
            biquad.type = type;
            biquad.frequency.value = Math.min(channel[type], context.sampleRate * 0.45);
            // Web Audio expresses HP/LP Q in dB; allpass and FFmpeg use linear Q.
            biquad.Q.value = type === 'allpass' ? Math.SQRT1_2 : 20 * Math.log10(Math.SQRT1_2);
            leg = leg.connect(biquad);
          }
        }
        if (channel.delayMs) {
          const delay = keep(context.createDelay(0.1));
          delay.delayTime.value = Math.round(context.sampleRate * channel.delayMs / 1000) / context.sampleRate;
          leg = leg.connect(delay);
        }
        leg.connect(speakerBus, 0, index);
      });
      if (headphones) {
        const stems = speakerBus.connect(keep(context.createChannelSplitter(channels.length)));
        const mix = keep(context.createGain());
        mix.gain.value = 0.84;
        // Azimuth in degrees, relative to a listener facing down the Web Audio -Z axis.
        const angles = [-30, 30, 0, 0, -145, 145, -95, 95, -40, 40, -140, 140];
        channels.forEach((name, i) => {
          if (name === 'LFE') {
            const sub = keep(context.createGain());
            sub.gain.value = 0.5;
            stems.connect(sub, i).connect(mix);
            return;
          }
          const pan = keep(context.createPanner());
          const bearing = angles[i] * Math.PI / 180;
          const elevation = name.startsWith('T') ? Math.PI / 4 : 0;
          pan.panningModel = 'HRTF';
          pan.rolloffFactor = 0;
          pan.positionX.value = Math.sin(bearing) * Math.cos(elevation);
          pan.positionY.value = Math.sin(elevation);
          pan.positionZ.value = -Math.cos(bearing) * Math.cos(elevation);
          stems.connect(pan, i).connect(mix);
        });
        const limiter = keep(context.createDynamicsCompressor());
        limiter.threshold.value = -1.5;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = .003;
        mix.connect(limiter);
        output = limiter;
      }
    } catch (error) {
      dispose();
      throw error;
    }

    function testChannel(index, master) {
      if (!Number.isInteger(index) || index < 0 || index >= channels.length) return false;
      stopTone();
      const tone = context.createOscillator(), level = context.createGain();
      const start = context.currentTime;
      tone.frequency.value = channels[index] === 'LFE' ? 55 : 520;
      level.gain.setValueAtTime(0, start);
      level.gain.linearRampToValueAtTime(0.06 * master, start + 0.025);
      level.gain.setValueAtTime(0.06 * master, start + 0.37);
      level.gain.linearRampToValueAtTime(0, start + 0.42);
      tone.connect(level).connect(speakerBus, 0, index);
      tone.onended = () => {
        tone.disconnect();
        level.disconnect();
        if (currentTone === tone) currentTone = null;
      };
      tone.start(start);
      tone.stop(start + 0.43);
      currentTone = tone;
      return true;
    }
    return { input, output, dispose, testChannel };
  }

  window.DJSpatial = { channels, loadPreset, createBus };
})();
