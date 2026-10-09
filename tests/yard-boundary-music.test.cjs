const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'yard', name), 'utf8');
class Element extends EventTarget {
  setAttribute() {}
  appendChild() {}
  remove() { this.hidden = true; }
}
async function setup(deny = false, store = new Map()) {
  const audio = new Element();
  Object.assign(audio, {paused:true, ended:false, readyState:0, currentTime:0, plays:0, src:''});
  audio.load = () => {};
  audio.pause = () => { audio.paused = true; };
  audio.play = () => {
    audio.plays++;
    if (deny) return Promise.reject(Object.assign(new Error('blocked'), {name:'NotAllowedError'}));
    audio.paused = false;
    audio.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  };
  const elements = new Map(['#yard-now','#yard-play','#yard-next','#yard-prev'].map(s => [s,new Element()]));
  elements.set('#album-player', audio);
  const buttons = [];
  const window = new Element();
  let grants = 0;
  window.inteonStreet = { boundaryVisit: () => 'visit', boundaryPlaybackSucceeded: () => grants++ };
  window.INTEONMTECA_PLAYLIST = JSON.parse(fs.readFileSync(path.join(root,'playlist.json')));
  const document = {baseURI:'https://example.test/yard/', body:new Element(), createElement() {const e=new Element(); buttons.push(e); return e;}};
  const ctx = vm.createContext({window, document, URL, location:{protocol:'file:'}});
  ctx.localStorage = {getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  vm.runInContext(fs.readFileSync(path.join(root,'playback-link.js'),'utf8'),ctx);
  vm.runInContext(source('wall-player.js').replaceAll('export ', ''), ctx);
  const player = ctx.createWallPlayer({querySelector: s => elements.get(s)});
  await player.load();
  return {player, audio, buttons, elements, store, grants: () => grants, allow: () => {deny=false;}};
}
test('boundary session stops at end; manual next resumes normal playlist without bonus replay', async () => {
  const {player,audio,elements,grants}=await setup();
  player.playBoundaryTrack();
  const src=audio.src;
  audio.paused=true; audio.ended=true;
  audio.dispatchEvent(new Event('ended'));
  assert.equal(audio.src,src);
  assert.equal(audio.plays,1);
  assert.equal(grants(),1);
  elements.get('#yard-next').dispatchEvent(new Event('click'));
  audio.paused=true; audio.ended=true;
  audio.dispatchEvent(new Event('ended'));
  assert.equal(audio.plays,3);
  assert.equal(grants(),1);
});
test('boundary track starts once per local day, survives reload and permits a new day', async () => {
  const {player,audio,store} = await setup();
  player.playBoundaryTrack();
  assert.equal(decodeURI(audio.src), 'https://example.test/media/God Is Dead/Матт - God Is Dead.flac');
  assert.equal(audio.plays,1);
  audio.src='https://example.test/other.flac'; audio.currentTime=42;
  player.playBoundaryTrack();
  assert.equal(audio.src, 'https://example.test/other.flac');
  assert.equal(audio.plays,1);
  const reloaded = await setup(false,store);
  reloaded.player.playBoundaryTrack();
  assert.equal(reloaded.audio.plays,0);
  store.set('inteon-boundary-track-day','2000-1-1');
  reloaded.player.playBoundaryTrack();
  assert.equal(reloaded.audio.plays,1);
});

test('denied crossing remains paused with one attempt until explicit retry gesture', async () => {
  const {player,audio,buttons,allow,grants} = await setup(true);
  player.playBoundaryTrack();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(audio.paused,true); assert.equal(audio.plays,1);
  assert.equal(buttons.length,1, 'offer a visible user gesture retry');
  assert.equal(buttons[0].hidden,false);
  assert.equal(grants(),0);
  allow(); buttons[0].dispatchEvent(new Event('click'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(grants(),1);
  audio.dispatchEvent(new Event('playing')); assert.equal(grants(),1);
  assert.equal(audio.paused,false); assert.equal(audio.plays,2);
  assert.equal(buttons[0].hidden,true);
});
test('a different selection cancels a denied boundary grant', async () => {
  const {player,audio,elements,allow,grants}=await setup(true);
  player.playBoundaryTrack(); await new Promise(resolve=>setImmediate(resolve));
  allow(); elements.get('#yard-next').dispatchEvent(new Event('click'));
  assert.equal(audio.paused,false);assert.equal(grants(),0);
});
test('scene frame wires crossing check to wall player using actual walkable polygon', () => {
  const main = source('main.js');
  assert.match(main, /createBoundaryMusic\(layout\.walkable, body, \(\) => player\.playBoundaryTrack\(\)\)/);
  assert.match(main, /boundaryMusic\(body\.x, body\.z\)/);
});
function boundary() {
  const ctx = vm.createContext({});
  vm.runInContext(source('navigation.js').replaceAll('export ', ''), ctx);
  vm.runInContext(source('boundary-music.js').replace(/^import .*;$/mg, '').replaceAll('export ', ''), ctx);
  return ctx;
}
test('touching every actual polygon edge triggers, but near-edge interior does not', () => {
  const {createBoundaryMusic}=boundary();
  for (const [x,z] of [[0,5],[10,5],[5,0],[5,10]]) {
    let calls=0; const update=createBoundaryMusic([[0,0],[10,0],[10,10],[0,10]],{x:5,z:5},()=>calls++);
    update(x===0?0.001:x===10?9.999:x,z===0?0.001:z===10?9.999:z); assert.equal(calls,0);
    update(x,z); update(x,z); assert.equal(calls,1);
  }
});
test('actual polygon exit triggers once, not grid proximity; reentry rearms; outside spawn is silent', () => {
  assert.ok(fs.existsSync(path.join(root, 'yard/boundary-music.js')), 'crossing controller exists');
  const { createBoundaryMusic } = boundary();
  const ring = [[0,0],[10,0],[10,10],[0,10]];
  let calls = 0;
  const update = createBoundaryMusic(ring, {x:5,z:5}, () => calls++);
  update(9.9,5); assert.equal(calls,0);
  update(11,5); update(12,5); update(13,5); assert.equal(calls,1);
  update(5,5); update(-1,5); assert.equal(calls,2);
  const outside = createBoundaryMusic(ring, {x:12,z:5}, () => calls++);
  outside(13,5); assert.equal(calls,2);
});
