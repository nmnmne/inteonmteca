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

  const layouts = [[], ['M'], ['FL','FR'], ['FL','FR','FC'], ['FL','FR','SL','SR'],
    ['FL','FR','FC','SL','SR'], ['FL','FR','FC','LFE','SL','SR'], ['FL','FR','FC','LFE','BC','SL','SR']];
  let peakCurve;

  // Route every virtual speaker, including LFE, even when its physical speaker is missing.
  // On outputs with unnamed extra channels use the bed's discrete PCM order.
  function speakerRoutes(count) {
    const physical = layouts[count] || channels.slice(0,count);
    const mono = [.5,.5,.14,.07,.06,.06,.07,.07,.055,.055,.05,.05];
    return channels.map((name,index) => {
      if (count===1) return [[0,mono[index]]];
      const direct = physical.indexOf(name);
      if (direct>=0) return [[direct,1]];
      if (name==='FC' || name==='LFE') {
        const gain = name==='FC' ? .14 : .07;
        return [[0,gain],[1,gain]];
      }
      const side = name.endsWith('L') ? 'L' : 'R';
      const sideOut = physical.indexOf('S'+side), back = physical.indexOf('B'+side);
      if (name.startsWith('B') && physical.includes('BC')) return [[physical.indexOf('BC'),.55]];
      if (name.startsWith('B') && sideOut>=0) return [[sideOut,.57]];
      if (name.startsWith('TB') && back>=0) return [[back,.44]];
      if (name.startsWith('TB') && sideOut>=0) return [[sideOut,.36]];
      return [[side==='L' ? 0 : 1, name.startsWith('S') ? .14 : .11]];
    });
  }

  function createBus(context, preset, headphones = false, count) {
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
          // Live speaker playback keeps the original stereo at the front.
          // The offline reference and explicit binaural mode retain their original master.
          gain.gain.value = count!=null && !headphones && index<2 ? (side===index ? .80 : 0) : coefficient;
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
      if (!headphones && count!=null && count<channels.length) {
        const stems = speakerBus.connect(keep(context.createChannelSplitter(channels.length)));
        const physical = keep(context.createChannelMerger(count));
        speakerRoutes(count).forEach((targets,index) => {
          for (const [speaker,weight] of targets) {
            if (weight===1) stems.connect(physical,index,speaker);
            else {
              const send=keep(context.createGain());
              send.gain.value=weight;
              stems.connect(send,index).connect(physical,0,speaker);
            }
          }
        });
        output = physical;
      } else if (headphones) {
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
      if (count!=null && !headphones) {
        // Correlated filter tails can occasionally sum above the original master peak.
        // Process each discrete output independently, with unity response up to .90.
        peakCurve ||= Float32Array.from({length:4097},(_,i) => {
          const x = i/1024-2, a = Math.abs(x);
          return a<=.90 ? x : Math.sign(x)*(.90+.08*(1-Math.exp(-((a-.90)/.08))));
        });
        const headroom = keep(context.createGain()), ceiling = keep(context.createWaveShaper());
        headroom.gain.value = .5; // Give the shaper a linear input range of +/-2.
        ceiling.curve = peakCurve;
        output = output.connect(headroom).connect(ceiling);
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

  const layoutKey = 'inteonmteca.dj.output-layout';
  const modes = ['7.1.4','stereo','headphones'];
  function preferredLayout() {
    try {
      const saved=localStorage.getItem(layoutKey);
      if (modes.includes(saved)) return saved;
    } catch {}
    return '7.1.4';
  }

  // One programme output per player. Meters, recording and cue sends keep their
  // independent connections to the source when this speaker route is replaced.
  function createOutput(context,source,onChange=()=>{}) {
    const dest=context.destination;
    let preference=preferredLayout(), layout='stereo', bus=null, disposed=false, sequence=0;
    let capacity=0, count=dest.channelCount || 2;
    source.connect(dest);

    function configure(wanted,interpretation) {
      // Some drivers report a maximum but reject intermediate or discrete counts.
      for (let n=wanted; n>0; n--) {
        try {
          if (dest.channelCount!==n) dest.channelCount=n;
          if (dest.channelCount!==n) continue;
          // Matching input/output counts need no browser downmix. Fixed devices
          // may allow the channel count while locking interpretation to speakers.
          if (dest.channelInterpretation!==interpretation) {
            try {dest.channelInterpretation=interpretation;} catch {}
          }
          return n;
        } catch {}
      }
      throw new Error('Аудиоустройство не приняло раскладку.');
    }

    function replace(next,mode,n) {
      if (next) next.output.connect(dest);
      if (bus) {source.disconnect(bus.input); bus.dispose();}
      else source.disconnect(dest);
      bus=next; layout=mode; count=n;
      source.connect(next ? next.input : dest);
    }

    async function refresh(deviceChanged=false) {
      const token=++sequence;
      if (disposed) return false;
      const max=Math.min(12,Math.max(1,dest.maxChannelCount || dest.channelCount || 2));
      const wanted=preference==='7.1.4' ? max : Math.min(2,max);
      if (capacity===max && layout===preference && dest.channelCount===count && (!deviceChanged || count===wanted)) return true;
      let next=null;
      try {
        const preset=preference==='stereo' ? null : await loadPreset();
        if (token!==sequence || disposed) return false;
        const binaural=preference==='headphones' && wanted>=2;
        const n=configure(wanted,binaural || !preset ? 'speakers' : 'discrete');
        if (preset) next=createBus(context,preset,binaural && n>=2,n);
        replace(next,preference,n);
        capacity=max;
      } catch {
        if (token!==sequence || disposed) return false;
        if (next && next!==bus) next.dispose();
        let n=dest.channelCount || 2;
        try { n=configure(Math.min(2,max),'speakers'); } catch {}
        replace(null,'stereo',n);
        capacity=0;
      }
      onChange();
      return layout===preference;
    }

    function onStorage(event) {
      if (event.key!==layoutKey && event.key!==null) return;
      preference=preferredLayout();
      void refresh();
    }
    context.addEventListener('sinkchange',refresh);
    navigator.mediaDevices?.addEventListener?.('devicechange',refresh);
    window.addEventListener('storage',onStorage);
    void refresh();
    return {refresh, get layout(){ return layout; }, get channelCount(){ return count; },
      get preferredLayout(){ return preference; },
      setLayout(mode) {
        if (!modes.includes(mode)) return Promise.resolve(false);
        preference=mode;
        try {localStorage.setItem(layoutKey,mode);} catch {}
        return refresh();
      },
      testChannel(index,master) { return bus?.testChannel(index,master) || false; },
      dispose() {
        disposed=true; sequence++;
        context.removeEventListener('sinkchange',refresh);
        navigator.mediaDevices?.removeEventListener?.('devicechange',refresh);
        window.removeEventListener('storage',onStorage);
        source.disconnect(bus ? bus.input : dest); bus?.dispose();
      }
    };
  }

  window.DJSpatial = { channels, loadPreset, createBus, speakerRoutes, createOutput, preferredLayout };
})();
