const {before, test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

let crowPersonality;
before(async () => { ({crowPersonality} = await import('../yard/crow-personalities.js')); });

function fixture(channels = 2, random = Math.random) {
  const document = new EventTarget(), window = new EventTarget();
  let interval = null, context, time = 0, playing = false;
  const sources = [], nodes = [];
  const parameter = (value = 0) => ({value, setTargetAtTime(next) { this.value = next; }});
  function node(kind, properties = {}) {
    const out = {kind, outputs: [], ...properties,
      connect(target) { this.outputs.push(target); return target; },
      disconnect() { this.outputs.length = 0; }};
    nodes.push(out);
    return out;
  }
  const master = {value:'80'};
  const albumPlayer = {get paused() {return !playing;}, volume:1};
  const music = node('music');
  document.querySelector = selector => ({'#master':master, '#album-player':albumPlayer}[selector] ?? null);
  window.matchMedia = () => ({matches:false});
  window.setInterval = callback => { assert.equal(interval,null); interval = callback; return 1; };
  window.clearInterval = () => { interval = null; };
  window.AudioContext = class {
    constructor() { context=this; this.state='suspended'; this.sampleRate=48000; this.destination=node('destination',{channelCount:Math.min(2,channels),maxChannelCount:channels}); }
    get currentTime() { return time; }
    async resume() { this.state='running'; }
    async suspend() { this.state='suspended'; }
    async close() { this.state='closed'; }
    createGain() { return node('gain',{gain:parameter(1)}); }
    createStereoPanner() { return node('panner',{pan:parameter()}); }
    createBiquadFilter() { return node('filter',{frequency:parameter(),Q:parameter()}); }
    createDelay() { return node('delay',{delayTime:parameter()}); }
    createConvolver() { return node('convolver'); }
    createMediaElementSource() { return music; }
    createBuffer(count,length,rate) {
      const channels=Array.from({length:count},()=>new Float32Array(length));
      return {length,sampleRate:rate,numberOfChannels:count,getChannelData:i=>channels[i]};
    }
    createBufferSource() {
      const out=node('source',{playbackRate:parameter(1), start(at) { this.at=at; }, stop() { this.stopped=true; }});
      sources.push(out);return out;
    }
  };
  window.inteonAudioBands={read:()=>({playing,bass:playing ? .79 : 0})};
  window.DJEngine={visuals:{analysis:{analyser:music},get paused() { return !playing; }},snapshot:()=>({
    cross:-1, A:{playing,bpm:120,baseBPM:120,time:32.75,track:{offset:0}}, B:{playing:false},
  })};
  const code=readFileSync(join(__dirname,'../yard/yard-sound.js'),'utf8')
    .replace(/^import .*?;$/gm,'').replace('export function createYardSound','function createYardSound');
  const bird={id:1,x:2,z:1};
  const scope=vm.createContext({window,document,navigator:{},Math:Object.assign(Object.create(Math), {random}),Float32Array,crowPersonality,
    Date:{now:()=>time*1000}, courtyardEffectSeconds:ms=>-ms/1000,
    sampleWeather:()=>({rain:1,snow:0,autumn:0,summer:0,spring:0}),
  });
  vm.runInContext(code,scope);
  const listener={x:0,z:0,yaw:0,birds:[bird],get elapsed() { return time; }};
  const yard=scope.createYardSound(()=>listener);
  return {
    document, nodes, sources, master, music, bird, listener, yard,
    get context() { return context; },
    get interval() { return interval; },
    setPlaying(value) { playing = value; },
    step(seconds) { time = seconds; interval(); },
    async start() { document.dispatchEvent(new Event('pointerup')); await new Promise(setImmediate); },
  };
}

test('one gesture starts ambience, music gets beat-aligned crow replies, and hiding or closing cleans up', async () => {
  const scene=fixture();
  const {document,sources,nodes,bird,master,yard}=scene;
  assert.equal(scene.context,undefined);
  await scene.start();
  const {context}=scene;
  const masterBus=nodes.find(n=>n.kind==='gain' && n.outputs.includes(context.destination));
  assert.equal(context.state,'running');
  assert.equal(sources.filter(s=>s.loop).length,2);
  assert.ok(sources[0].buffer.getChannelData(0).some(x=>x!==0));
  const initialVolume=masterBus.gain.value;
  document.dispatchEvent(new Event('keydown'));
  assert.equal(sources.filter(s=>s.loop).length,2);
  scene.step(2); assert.ok(sources.some(s=>!s.loop));
  scene.setPlaying(true);
  for (const time of [17,32,47]) scene.step(time);
  assert.ok(masterBus.gain.value>0 && masterBus.gain.value<initialVolume);
  assert.equal(bird.musicReplyAt,47.25);
  assert.ok(sources.some(s=>s.playbackRate.value===.82));
  assert.ok(sources.some(s=>s.playbackRate.value===1.26));
  master.value='0';const before=sources.length;scene.step(67);
  assert.equal(masterBus.gain.value,0);
  assert.equal(sources.length,before);
  document.hidden=true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(scene.interval,null);
  assert.equal(context.state,'suspended');
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await new Promise(setImmediate);
  assert.equal(context.state,'running');
  assert.equal(sources.filter(s=>s.loop).length,2);
  yard.dispose(); assert.equal(context.state,'closed'); assert.equal(scene.interval,null);
  assert.ok(sources.filter(s=>s.loop).every(s=>s.stopped));
});

// Follow actual connections. Feedback may contain a cycle.
function reaches(start, target, blocked) {
  const seen=new Set([blocked]), remaining=[start];
  while (remaining.length) {
    const node=remaining.pop();
    if (seen.has(node)) continue;
    if (node===target) return true;
    seen.add(node);
    remaining.push(...node.outputs);
  }
  return false;
}

test('wind swells from lulls and only the wind feeds the echo and reverb returns', async () => {
  const scene=fixture();
  await scene.start();
  const {nodes,context,music}=scene;
  const {destination}=context;
  const air=scene.sources.find(node=>node.loop && node.outputs.some(n=>n.type==='bandpass'));
  const wind=air.outputs.find(node=>node.type==='bandpass');
  const rainfall=scene.sources.find(node=>node.loop && node!==air);
  const rain=rainfall.outputs.find(node=>node.type==='highpass');
  const grain=air.buffer.getChannelData(0), rainSamples=rainfall.buffer.getChannelData(0);
  assert.equal(new Set(grain).size,16);
  assert.ok(new Set(rainSamples.subarray(0,512)).size>480);
  const lowCut=wind.outputs.find(node=>node.type==='highpass');
  assert.ok(lowCut && lowCut.frequency.value>=300, 'all wind and its reflections lose the low end');
  const windGain=lowCut.outputs.find(node=>node.kind==='gain');
  const master=nodes.find(node=>node.kind==='gain' && node.outputs.includes(destination));
  assert.ok(windGain && master && rain);
  const delays=nodes.filter(node=>node.kind==='delay');
  const reverb=nodes.find(node=>node.kind==='convolver');
  assert.equal(delays.length,2);
  assert.ok(delays.every(delay=>delay.delayTime.value>0), 'audible echo delays');
  assert.ok(reverb?.buffer?.length>1, 'reverb impulse response');
  assert.equal(reverb.buffer.numberOfChannels,2);
  for (let channel=0;channel<reverb.buffer.numberOfChannels;channel++) {
    const ir=reverb.buffer.getChannelData(channel);
    const block=Math.max(1,Math.floor(ir.length/4));
    const energy=(start)=>ir.subarray(start,start+block).reduce((sum,v)=>sum+v*v,0);
    assert.ok(energy(0)>energy(ir.length-block), 'reflection tail decays');
  }
  const panner=windGain.outputs.find(n=>n.kind==='panner');
  assert.ok(panner && panner.outputs.includes(master), 'the moving dry wind reaches the front bed');
  const effects=[...delays,reverb];
  scene.setPlaying(true);
  for (const fx of effects) {
    assert.ok(reaches(windGain,fx) && reaches(fx,master));
    assert.equal(reaches(fx,destination,master),false, 'wet signal cannot bypass master mute');
    assert.equal(reaches(rain,fx),false, 'rain does not feed wind effects');
    assert.equal(reaches(air,fx,windGain),false, 'reflections follow the wind envelope');
    assert.equal(reaches(music,fx) || reaches(fx,music),false, 'music stays on its own audio path');
  }
  const gain=[];
  const frequencies=[];
  for (let t=0;t<=180;t+=.25) {
    scene.step(t);
    gain.push(windGain.gain.value);
    frequencies.push(wind.frequency.value);
  }
  assert.ok(frequencies.every(hz=>hz>500 && hz<2000));
  assert.ok(Math.max(...frequencies)-Math.min(...frequencies)>300);
  const quiet=Math.min(...gain), gust=Math.max(...gain);
  assert.ok(gust>0 && quiet<gust*.25, 'calm wind recedes between gusts');
  assert.ok(gain.some((value,i)=>i>0 && value>quiet*1.2 && value<gust*.85 && value>gain[i-1]),
    'wind swells progressively');
  const crows=scene.sources.filter(source=>!source.loop);
  assert.ok(crows.length>0);
  for (const crow of crows) {
    assert.ok(reaches(crow,master));
    assert.ok(effects.every(fx=>!reaches(crow,fx)));
  }
  scene.master.value='0';
  scene.step(181);
  assert.equal(master.gain.value,0);
  scene.yard.dispose();
});

test('the front pair keeps its speaker order on surround outputs and sums both sides on mono', async () => {
  for (const channels of [12, 8, 2, 1]) {
    const scene = fixture(channels);
    await scene.start();
    const dest = scene.context.destination;
    const bus = scene.nodes.find(n => n.kind === 'gain' && n.outputs.includes(dest));
    assert.equal(bus.channelCount, 2);
    assert.equal(bus.channelCountMode, 'explicit');
    assert.equal(dest.channelCount, channels);
    assert.equal(dest.channelInterpretation, channels === 1 ? 'speakers' : 'discrete');
    dest.maxChannelCount = channels === 1 ? 2 : 1;
    scene.step(.16);
    assert.equal(dest.channelInterpretation, dest.maxChannelCount === 1 ? 'speakers' : 'discrete');
    assert.equal(dest.channelCount, dest.maxChannelCount);
    scene.yard.dispose();
  }
});

test('wind and an active crow call retain their world positions when the listener turns', async () => {
  const scene = fixture();
  await scene.start();
  const windPan = scene.nodes.find(n => n.kind === 'panner');
  scene.step(2);
  const voiceGain = scene.sources.find(s => !s.loop).outputs[0];
  const voicePan = voiceGain.outputs.find(n => n.kind === 'panner');
  const originalWind = windPan.pan.value, originalBird = voicePan.pan.value;
  const originalGain = voiceGain.gain.value;
  scene.listener.yaw = Math.PI;
  scene.step(2);
  assert.ok(Math.abs(windPan.pan.value + originalWind) < 1e-8);
  assert.ok(originalBird > .5 && Math.abs(voicePan.pan.value + originalBird) < 1e-8);
  scene.bird.x = -25;
  scene.step(2.16);
  assert.ok(voicePan.pan.value > .85 && voiceGain.gain.value < originalGain);
  scene.listener.yaw = 0;
  const positions = [];
  for (let i = 0; i < 150; i++) {
    scene.step(2.32 + i * .16);
    positions.push(windPan.pan.value);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) > .5);
  scene.yard.dispose();
});

test('all nineteen residents keep individual waveforms, phrase lengths, rhythm and gain across visits', async () => {
  const twoRuns = [];
  for (let visit = 0; visit < 2; visit++) {
    const scene = fixture(2, () => visit ? .9 : .1);
    await scene.start();
    const voices = [];
    for (let id = 0; id < 19; id++) {
      const bird = {id, x:0, z:0};
      scene.listener.birds = [bird];
      const before = scene.sources.length, now = 2 + 12 * id;
      scene.step(now);
      const notes = scene.sources.slice(before), signature = crowPersonality(id).voice;
      assert.equal(notes.length, signature.notes);
      assert.equal(bird.musicReplyAt, now, 'the caller, including the leader, actually gestures');
      const [first, second] = notes, clip = first.buffer;
      const level = first.outputs[0].gain.value;
      assert.equal(level, .32 * signature.volume);
      assert.equal(clip.length, Math.round(.38 * signature.length * clip.sampleRate));
      if (second) assert.ok(Math.abs(second.at - first.at - clip.length / clip.sampleRate / first.playbackRate.value - .2 * signature.cadence) < 1e-8);
      const samples = clip.getChannelData(0);
      assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1));
      voices.push(require('node:crypto').createHash('sha256').update(Buffer.from(samples.buffer)).digest('hex'));
    }
    assert.equal(new Set(voices).size, 19);
    twoRuns.push(voices);
    scene.yard.dispose();
  }
  assert.deepEqual(twoRuns[0], twoRuns[1]);
});

test('a neighbour answers in its own voice and from its own position, including rhythmic reverse replies', async () => {
  const scene = fixture(2, () => 0), leader = {id:0, x:-3, z:0}, other = {id:2, x:4, z:0};
  scene.listener.birds = [leader, other];
  await scene.start();
  scene.step(2);
  const firstCall = scene.sources.filter(s => !s.loop);
  const outgoing = firstCall[0], answer = firstCall.at(-1);
  assert.ok(answer.at > outgoing.at && other.musicReplyAt > leader.musicReplyAt);
  assert.ok(outgoing.outputs[0].outputs[0].pan.value < 0 && answer.outputs[0].outputs[0].pan.value > 0);
  assert.notEqual(outgoing.buffer, answer.buffer);
  scene.step(17); // The other bird takes the next turn, using the same cached voice.
  assert.equal(scene.sources[2 + firstCall.length].buffer, answer.buffer);
  scene.setPlaying(true);
  const offset = scene.sources.length;
  scene.step(32); // Third bout is beat-aligned; the neighbour answers backwards.
  const magical = scene.sources.slice(offset);
  assert.equal(magical.length, 3);
  assert.ok(Math.abs(magical[1].at - magical[0].at - .75) < 1e-8);
  assert.deepEqual(magical[1].buffer.getChannelData(0), answer.buffer.getChannelData(0).slice().reverse());
  assert.equal(other.musicReplyAt, scene.listener.elapsed + .25 + .75);
  scene.yard.dispose();
});
