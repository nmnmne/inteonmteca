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
 const a=load();a.street.noteExit();a.arm(); const visit=a.street.boundaryVisit();a.advance(61000);
 assert.equal(a.street.boundaryPlaybackSucceeded(visit),false);
});
test('timeout ends the bonus and an ended visit rejects stale playback callbacks',()=>{
 const a=load();a.street.noteExit();a.arm();const visit=a.street.boundaryVisit();a.street.boundaryPlaybackSucceeded();
 a.advance(300000); [...a.timers.values()].at(-1).fn();assert.equal(a.home(),true);
 assert.equal(a.street.boundaryPlaybackSucceeded(visit),false);
 const b=load(a.store,a.now());b.arm();assert.equal(b.left(),300);assert.equal(b.street.boundaryPlaybackSucceeded(visit),false);
});
test('local midnight does not reset an existing deadline; a later visit can earn the new day',()=>{
 const a=load(new Map(),new Date(2026,9,4,23,59,55).getTime());a.arm();a.street.boundaryPlaybackSucceeded();a.advance(10000);
 const b=load(a.store,a.now());b.arm();assert.equal(b.left(),290);
 load(a.store,a.now(),'/index.html');const c=load(a.store,a.now());
 assert.equal(c.street.noteExit(),60);c.arm();
 assert.equal(c.street.boundaryPlaybackSucceeded(),true);assert.equal(c.left(),300);
});
test('successful switch adds four minutes once per day; reload keeps the deadline and later exits follow the minute sequence',()=>{
 const a=load(); a.street.noteExit(); a.arm(); a.advance(3000);
 assert.equal(typeof a.street.boundaryPlaybackSucceeded,'function');
 const original=JSON.parse(a.store.get('inteonmteca-street-walk-v1')).deadline;
 assert.equal(a.street.boundaryPlaybackSucceeded(),true); assert.equal(a.left(),297);
 assert.equal(a.street.seconds(),300,'bonus is retained for this visit');
 const deadline=JSON.parse(a.store.get('inteonmteca-street-walk-v1')).deadline;
 assert.equal(deadline,original+240000,'elapsed seconds are preserved');a.advance(10000);
 const b=load(a.store,a.now()); b.arm(); assert.equal(b.left(),287);
 assert.equal(b.street.boundaryPlaybackSucceeded(),false); assert.equal(b.left(),287);
 assert.equal(b.street.seconds(),300,'a duplicate playback event does not grow the duration');
 load(a.store,a.now(),'/index.html');
 const c=load(a.store,a.now()); c.street.noteExit(); c.arm(); assert.equal(c.left(),120);
 assert.equal(c.street.boundaryPlaybackSucceeded(),false);
 assert.equal(c.street.noteExit(),180,'each later exit adds one minute according to its visit number');
 const d=load(a.store,new Date(2026,9,5,0,0,1).getTime()); d.street.noteExit();d.arm();
 assert.equal(d.left(),60,'the next day resets ordinary durations');
 assert.equal(d.street.boundaryPlaybackSucceeded(),true); assert.equal(d.left(),300);
});

test('a later ordinary visit gets four minutes in addition to its existing duration',()=>{
 const a=load();a.street.noteExit();a.street.noteExit();a.arm();a.advance(30000);
 assert.equal(a.street.boundaryPlaybackSucceeded(),true);assert.equal(a.left(),330);
 assert.equal(a.street.seconds(),360);
 assert.equal(a.street.noteExit(),180);
});

test('old daily rule resets its duration while retaining the already consumed daily bonus',()=>{
 const a=load();a.street.noteExit();a.arm();a.street.boundaryPlaybackSucceeded();
 a.store.set('inteonmteca-street-rule','10..65');a.store.set('inteonmteca-street-return-sec','65');
 load(a.store,a.now(),'/index.html');
 const b=load(a.store,a.now());assert.equal(b.street.noteExit(),60);b.arm();
 assert.equal(b.street.boundaryPlaybackSucceeded(),false);
 assert.equal(b.left(),60);
});

test('boundary bonus caps the total walk at fifteen minutes, including across reloads',()=>{
 const a=load();for(let i=0;i<14;i++)a.street.noteExit();a.arm();
 const started=a.now();a.advance(45000);
 assert.equal(a.street.boundaryPlaybackSucceeded(),true);
 assert.equal(a.street.seconds(),900);
 assert.equal(a.left(),855,'elapsed walking time is included in the cap');
 assert.equal(JSON.parse(a.store.get('inteonmteca-street-walk-v1')).deadline,started+900000);
 a.advance(120000);const b=load(a.store,a.now());b.arm();
 assert.equal(b.left(),735,'a reload retains the original absolute deadline');
 assert.equal(b.street.boundaryPlaybackSucceeded(),false);
 assert.equal(b.street.noteExit(),900);assert.equal(b.street.noteExit(),900);
});

test('a capped ordinary visit cannot be extended past fifteen minutes by the boundary bonus',()=>{
 const a=load();for(let i=0;i<15;i++)a.street.noteExit();a.arm();
 const original=JSON.parse(a.store.get('inteonmteca-street-walk-v1')).deadline;
 a.advance(10000);assert.equal(a.street.boundaryPlaybackSucceeded(),true);
 assert.equal(a.left(),890);assert.equal(a.street.seconds(),900);
 assert.equal(JSON.parse(a.store.get('inteonmteca-street-walk-v1')).deadline,original);
});
