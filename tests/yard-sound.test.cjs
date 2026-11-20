const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

function fixture() {
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
    constructor() { context=this; this.state='suspended'; this.sampleRate=48000; this.destination=node('destination'); }
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
    .replace(/^import .*?;$/m,'').replace('export function createYardSound','function createYardSound');
  const bird={id:1,x:2,z:1};
  const scope=vm.createContext({window,document,navigator:{},Math,Float32Array,
    performance:{now:()=>time*1000},
    sampleWeather:()=>({rain:1,snow:0,autumn:0,summer:0,spring:0}),
  });
  vm.runInContext(code,scope);
  const yard=scope.createYardSound(()=>({x:0,z:0,yaw:0,elapsed:time,birds:[bird]}));
  return {
    document, nodes, sources, master, music, bird, yard,
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
  assert.equal(sources.filter(s=>s.loop).length,1);
  assert.ok(sources[0].buffer.getChannelData(0).some(x=>x!==0));
  const initialVolume=masterBus.gain.value;
  document.dispatchEvent(new Event('keydown'));
  assert.equal(sources.filter(s=>s.loop).length,1);
  scene.step(2); assert.ok(sources.length>=2);
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
  assert.equal(sources.filter(s=>s.loop).length,1);
  yard.dispose(); assert.equal(context.state,'closed'); assert.equal(scene.interval,null); assert.ok(sources[0].stopped);
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
  const air=scene.sources.find(node=>node.loop);
  const wind=air.outputs.find(node=>node.type==='bandpass');
  const rain=air.outputs.find(node=>node.type==='highpass');
  const windGain=wind.outputs.find(node=>node.kind==='gain');
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
  assert.ok(windGain.outputs.includes(master), 'dry wind reaches the master as well');
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
  for (let t=0;t<=180;t+=.25) {
    scene.step(t);
    gain.push(windGain.gain.value);
  }
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
