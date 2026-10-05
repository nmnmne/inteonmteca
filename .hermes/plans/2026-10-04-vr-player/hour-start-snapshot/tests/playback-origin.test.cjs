const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
 const store = new Map(); const window = {};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../playback-link.js'),'utf8'), {window, localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
 return window.inteonPlayback;
}
const track = {audio:'media/a.flac'};
test('home selection stops at yard; origin never changes on a save',()=>{
 const p=setup(), a={paused:false,currentTime:42};
 p.select(a,'home'); p.save(a,track);
 assert.equal(p.read().origin,'home');
 const s=p.forPage('yard'); assert.equal(s.playingIntent,false); assert.equal(s.time,42);
});
test('yard origin and intent survive home saves and blocked autoplay',()=>{
 const p=setup(), a={paused:false,currentTime:42};
 p.select(a,'yard'); p.save(a,track);
 const b={paused:true,currentTime:42}; p.restore(b,p.forPage('home')); p.save(b,track);
 assert.equal(p.read().origin,'yard'); assert.equal(p.read().paused,true);
 assert.equal(p.forPage('yard').playingIntent,true);
 p.intent(b,false); p.save(b,track);
 assert.equal(p.forPage('yard').playingIntent,false);
});
test('boundary stop policy survives handoff and completion; explicit selection clears it',()=>{
 const p=setup(), a={paused:false,currentTime:8};
 p.select(a,'yard',{stopAtEnd:true}); p.save(a,track);
 const b={paused:true,currentTime:8}; p.restore(b,p.forPage('home')); p.save(b,track);
 assert.equal(p.stopsAtEnd(b),true);
 assert.equal(p.read().stopAtEnd,true);
 assert.equal(p.read().origin,'yard');
 p.intent(b,false); p.save(b,track);
 const c={paused:true,currentTime:8}; p.restore(c,p.forPage('yard'));
 assert.equal(p.stopsAtEnd(c),true); assert.equal(p.read().playingIntent,false);
 p.select(b,'home'); p.save(b,track);
 assert.equal(p.stopsAtEnd(b),false); assert.equal(p.read().stopAtEnd,false);
});
test('explicit home selection replaces yard origin even for same file',()=>{
 const p=setup(), a={paused:false,currentTime:8}; p.select(a,'yard'); p.save(a,track);
 p.select(a,'home'); p.save(a,track); assert.equal(p.forPage('yard').playingIntent,false);
});
