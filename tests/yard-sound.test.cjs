const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

test('one gesture starts ambience, music gets beat-aligned crow replies, and hiding or closing cleans up', async () => {
  const document = new EventTarget(), window = new EventTarget();
  let interval = null, context, time = 0, playing = false;
  const sources = [], gains = [];
  const parameter = () => ({value:0, setTargetAtTime(value) { this.value = value; }});
  const node = () => ({connect(target) { return target; }, disconnect() {}});
  const master = {value:'80'};
  document.querySelector = selector => selector === '#master' ? master : null;
  window.matchMedia = () => ({matches:false});
  window.setInterval = callback => { assert.equal(interval,null); interval = callback; return 1; };
  window.clearInterval = () => { interval = null; };
  window.AudioContext = class {
    constructor() { context=this; this.state='suspended'; this.destination=node(); }
    get currentTime() { return time; }
    async resume() { this.state='running'; }
    async suspend() { this.state='suspended'; }
    async close() { this.state='closed'; }
    createGain() { const out={...node(),gain:parameter()}; gains.push(out); return out; }
    createStereoPanner() { return {...node(),pan:parameter()}; }
    createBiquadFilter() { return {...node(),frequency:parameter(),Q:parameter()}; }
    createBuffer(count,length,rate) {
      const channels=Array.from({length:count},()=>new Float32Array(length));
      return {length,sampleRate:rate,getChannelData:i=>channels[i]};
    }
    createBufferSource() {
      const out={...node(),playbackRate:parameter(), start(at) { this.at=at; }, stop() { this.stopped=true; }};
      sources.push(out);return out;
    }
  };
  window.inteonAudioBands={read:()=>({playing,bass:playing ? .79 : 0})};
  window.DJEngine={visuals:{get paused() { return !playing; }},snapshot:()=>({
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
  assert.equal(context,undefined);
  document.dispatchEvent(new Event('pointerup'));
  await new Promise(setImmediate);
  assert.equal(context.state,'running');
  assert.equal(sources.filter(s=>s.loop).length,1);
  assert.ok(sources[0].buffer.getChannelData(0).some(x=>x!==0));
  const initialVolume=gains[0].gain.value;
  document.dispatchEvent(new Event('keydown'));
  assert.equal(sources.filter(s=>s.loop).length,1);
  time=2; interval(); assert.ok(sources.length>=2);
  playing=true;
  for(let index=0;index<3;index++) {time+=15;interval(); }
  assert.ok(gains[0].gain.value>0 && gains[0].gain.value<initialVolume);
  assert.equal(bird.musicReplyAt,time+.25);
  assert.ok(sources.some(s=>s.playbackRate.value===.82));
  assert.ok(sources.some(s=>s.playbackRate.value===1.26));
  master.value='0';time+=20; const before=sources.length;interval();
  assert.equal(gains[0].gain.value,0);
  assert.equal(sources.length,before);
  document.hidden=true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(interval,null);
  assert.equal(context.state,'suspended');
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await new Promise(setImmediate);
  assert.equal(context.state,'running');
  assert.equal(sources.filter(s=>s.loop).length,1);
  yard.dispose(); assert.equal(context.state,'closed'); assert.equal(interval,null); assert.ok(sources[0].stopped);
});
