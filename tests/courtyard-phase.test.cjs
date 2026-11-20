const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clock = fs.readFileSync(path.join(__dirname,'../yard/solar-clock.js'),'utf8').replace(/^export /gm,'');
const redirect = fs.readFileSync(path.join(__dirname,'../yard/index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const site = 'https://inteonmteca.online', day = 20*60000, epoch = Date.UTC(2026,2,20);

function tabStorage() {
  const data = new Map();
  return {
    getItem:key=>data.get(key) ?? null,
    setItem:(key,value)=>data.set(key,value),
    removeItem:key=>data.delete(key),
  };
}

function open(storage, {random=.2,type='navigate',from='',newTab=false,isRedirect=false}={}) {
  const window = new EventTarget();
  Object.assign(window,{location:{origin:site,protocol:'https:',replace(){}},document:{referrer:from},
    performance:{getEntriesByType:()=>[{type}]},sessionStorage:storage,opener:newTab ? {} : null,history:{length:newTab ? 1 : 2}});
  const math = Object.create(Math);
  let draws=0;
  math.random=()=>{draws++; return random;};
  const scope=vm.createContext({window,location:window.location,document:window.document,
    performance:window.performance,sessionStorage:storage,Math:math});
  if (isRedirect) {vm.runInContext(redirect,scope); return;}
  vm.runInContext(clock,scope);
  const sample=(at,offset)=>Array.from(scope.courtyardSunForLocation({lat:51,lon:51},at,offset).direction);
  return {sample, draws:()=>draws, restore() {
    window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));
  }};
}

test('random visits cover all 24 hours and repeat after every twenty real minutes',()=>{
  for(let hour=0;hour<24;hour++) {
    const visit=open(tabStorage(),{random:hour/24});
    assert.equal(visit.draws(),1);
    assert.deepEqual(visit.sample(epoch),visit.sample(epoch,Math.floor(hour/24*day)));
    for(let cycles=1;cycles<=3;cycles++) {
      const distance=Math.hypot(...visit.sample(epoch+cycles*day).map((x,i)=>x-visit.sample(epoch)[i]));
      assert.ok(distance<.001);
    }
  }
});

test('reloads and direct or external entrances start a fresh day; internal and restored documents share it',()=>{
  const storage=tabStorage(), home=open(storage);
  const album=open(storage,{from:site+'/',random:.42});
  assert.equal(album.draws(),0);
  assert.deepEqual(album.sample(epoch+day/4),home.sample(epoch+day/4));
  const refreshed=open(storage,{type:'reload',from:site+'/',random:.66});
  assert.equal(refreshed.draws(),1);
  assert.notDeepEqual(refreshed.sample(epoch),home.sample(epoch));
  home.restore();
  assert.deepEqual(home.sample(epoch+day/3),refreshed.sample(epoch+day/3));
  assert.equal(open(storage,{type:'back_forward'}).draws(),0);
  for(const opts of [{from:''},{from:'https://example.org/'},{from:site+'/',newTab:true}]) {
    assert.equal(open(storage,opts).draws(),1);
  }
});

test('the yard redirect carries an internal visit and discards a stale phase on a fresh entrance',()=>{
  const storage=tabStorage(), previous=open(storage);
  open(storage,{isRedirect:true,from:site+'/listening-room.html'});
  const internal=open(storage,{from:site+'/yard/'});
  assert.equal(internal.draws(),0);
  assert.deepEqual(internal.sample(epoch),previous.sample(epoch));
  open(storage,{isRedirect:true});
  assert.equal(open(storage,{from:site+'/yard/index.html',random:.48}).draws(),1);
});

test('blocked storage leaves one uninterrupted clock within the document',()=>{
  const fail=()=>{throw Error('blocked');}, storage={getItem:fail,setItem:fail};
  const page=open(storage,{from:site+'/',random:.8});
  assert.equal(page.draws(),1);
  page.restore();
  assert.deepEqual(page.sample(epoch+day),page.sample(epoch+day,.8*day));
});
