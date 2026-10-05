const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../street-return.js'),'utf8');
function load(store=new Map(), at=new Date(2026,9,4,12).getTime(), pathname='/yard/') {
  let now=at; const timers=new Map(); let serial=0; const events={};
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  const context={Date:Clock,location:{pathname},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},
    setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),setInterval:()=>++serial,clearInterval(){},addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
  context.window=context; vm.runInNewContext(source,context);
  let left,home=false; const street=context.inteonStreet;
  return {street,store,events,timers,advance:ms=>now+=ms,now:()=>now,arm(){street.armReturn({replace(){home=true;}},'https:',v=>left=v);},left:()=>left,home:()=>home};
}
test('expired visit cannot receive a delayed playback bonus',()=>{
 const a=load();a.street.noteExit();a.arm(); const visit=a.street.boundaryVisit();a.advance(11000);
 assert.equal(a.street.boundaryPlaybackSucceeded(visit),false);
});
test('timeout ends the bonus and an ended visit rejects stale playback callbacks',()=>{
 const a=load();a.street.noteExit();a.arm();const visit=a.street.boundaryVisit();a.street.boundaryPlaybackSucceeded();
 a.advance(1200000); [...a.timers.values()].at(-1).fn();assert.equal(a.home(),true);
 assert.equal(a.street.boundaryPlaybackSucceeded(visit),false);
 const b=load(a.store,a.now());b.arm();assert.equal(b.left(),10);assert.equal(b.street.boundaryPlaybackSucceeded(visit),false);
});
test('local midnight does not reset an existing deadline; a later visit can earn the new day',()=>{
 const a=load(new Map(),new Date(2026,9,4,23,59,55).getTime());a.arm();a.street.boundaryPlaybackSucceeded();a.advance(10000);
 const b=load(a.store,a.now());b.arm();assert.equal(b.left(),1190);
 load(a.store,a.now(),'/index.html');const c=load(a.store,a.now());c.street.noteExit();c.arm();
 assert.equal(c.street.boundaryPlaybackSucceeded(),true);assert.equal(c.left(),1200);
});
test('successful switch grants a fixed 20-minute deadline, reload preserves it, home forfeits it',()=>{
 const a=load(); a.street.noteExit(); a.arm(); a.advance(3000);
 assert.equal(typeof a.street.boundaryPlaybackSucceeded,'function');
 assert.equal(a.street.boundaryPlaybackSucceeded(),true); assert.equal(a.left(),1200);
 const deadline=a.now()+1200000; a.advance(10000);
 const b=load(a.store,a.now()); b.arm(); assert.equal(b.left(),1190);
 assert.equal(b.street.boundaryPlaybackSucceeded(),false); assert.equal(b.left(),1190);
 load(a.store,a.now(),'/index.html');
 const c=load(a.store,a.now()); c.street.noteExit(); c.arm(); assert.equal(c.left(),15);
 assert.equal(c.street.boundaryPlaybackSucceeded(),false);
 const d=load(a.store,new Date(2026,9,5,0,0,1).getTime()); d.street.noteExit();d.arm();
 assert.equal(d.street.boundaryPlaybackSucceeded(),true); assert.equal(d.left(),1200);
 assert.ok(deadline>0);
});
