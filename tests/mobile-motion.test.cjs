const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8');
function extract(file,start,end){const s=source(file);assert.ok(s.includes(start),`missing ${start}`);return vm.runInNewContext(s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)))+'\n'+start.match(/const (\w+)/)[1]);}
test('mobile text work is bounded independently of playlist size and quality preserves cadence',()=>{
 const budget=extract('text-waves.js','const textWorkBudget =','const audioMotion =');
 for(const level of [1,3,5,10]){const b=budget(true,level);assert.ok(b.candidates<=64);assert.ok(b.writes<=24);assert.ok(b.writes>=12);}
 assert.ok(budget(true,1).candidates<budget(true,10).candidates);
});
test('mobile text keeps a sixty-update floor without changing elapsed-time wave travel',()=>{
 const create=extract('text-waves.js','const createTextAudioMotion =','const textWorkBudget =');
 const motion=create(60);motion.update(0,{playing:false});
 for(let i=1;i<=60;i++)motion.update(i*1000/60,{playing:false});
 assert.equal(motion.state.targetFps,60);assert.ok(Math.abs(motion.state.motionTime-1000)<.01);
});
test('each mobile logo cycle has exactly five scatters, five dissolves and one recursion',()=>{
 const create=extract('mobile-logo-effects.js','const createMobileLogoCycle =','const mobile=');
 const cycle=create();const counts={};
 for(let i=0;i<110;i++){const name=cycle.peek();assert.equal(cycle.peek(),name,'retry does not spend a slot');counts[name]=(counts[name]||0)+1;cycle.advance();}
 assert.deepEqual(counts,{scatter:50,dissolve:50,recursion:10});
});
test('live mobile controller preserves 5:5:1 through contention and manual previews',()=>{
 const counts={scatter:0,dissolve:0,recursion:0};let active=null;
 const wrap={dataset:{},append(){}};
 const effects={claim(name){if(active)return false;active=name;if(name==='mobile-scatter')counts.scatter++;return true;},release(name){if(active===name)active=null;},get active(){return active},setMotionTimeout(){return 1},clearMotionTimeout(){},setLogoScattered(){}};
 const effect=name=>{if(active)return null;active=name;counts[name]++;return {then(cb){active=null;cb();}}};
 const window={inteonHomeEffects:effects,inteonLogoAcid:{run:()=>effect('dissolve'),stop(){}},inteonLogoMaterials:{run:()=>effect('recursion'),stop(){}},addEventListener(){}};
 const document={hidden:false,documentElement:{dataset:{graphicsLevel:'3'}},querySelector:()=>wrap,addEventListener(){},createElement:()=>({dataset:{},style:{},setAttribute(){},append(){},remove(){},animate:()=>({cancel(){},playState:'running'})})};
 vm.runInNewContext(source('mobile-logo-effects.js'),{window,document,matchMedia:q=>({matches:!q.includes('reduced'),addEventListener(){}}),setTimeout:()=>1,clearTimeout(){}});
 const api=window.inteonMobileLogo;
 for(let i=0;i<11;i++){
  active='alternate-logo';assert.equal(api.run(),false);active=null;
  assert.equal(api.run(),true);api.stop();
 }
 assert.deepEqual(counts,{scatter:5,dissolve:5,recursion:1});
 api.run('recursion');api.stop();
 const before=counts.scatter;api.run();api.stop();assert.equal(counts.scatter,before+1,'manual preview does not consume an automatic scatter slot');
});
test('collapsed or hidden chat owns no polling timer and expansion restarts once',()=>{
 const s=source('script.js');assert.ok(s.includes('const syncChatPolling ='));
 const start=s.indexOf('const syncChatPolling ='),end=s.indexOf('\n};',start)+3;
 let calls=0,next=0;const timers=new Set();const ctx={chatTimer:0,chatAnimationFrame:0,chatWorkVisible:()=>false,loadChat:()=>calls++,cancelAnimationFrame(){},window:{clearInterval:id=>timers.delete(id),setInterval:()=>{timers.add(++next);return next;}}};
 vm.createContext(ctx);vm.runInContext(s.slice(start,end)+'\nthis.sync=syncChatPolling;',ctx);
 ctx.sync();assert.equal(timers.size,0);assert.equal(calls,0);ctx.chatWorkVisible=()=>true;ctx.sync();ctx.sync();assert.equal(timers.size,1);assert.equal(calls,1);ctx.chatWorkVisible=()=>false;ctx.sync();assert.equal(timers.size,0);
});
test('mobile resident guard does no periodic obstacle layout reads',()=>{
 const s=source('room-resident.js');const start=s.indexOf('const guardSpace =');let reads=0;
 const guard=vm.runInNewContext(s.slice(start,s.indexOf('\n  };',start)+5)+'\nguardSpace;',{blocked:false,cinematic:false,document:{hidden:false},compact:{matches:true},refreshObstacles:()=>reads++,center:()=>({}),safe:()=>true,resident:{},journey:null});guard();assert.equal(reads,0);
});
test('mobile dissolve clock is foreground wall time even in decorative rest',()=>{
 const s=source('logo-acid.js');const begin=s.indexOf('const motionNow =');const end=s.indexOf('const motionTimeout =',begin);
 const clock=vm.runInNewContext(s.slice(begin,end)+'\nmotionNow;',{window:{inteonHomeEffects:{ambientNow:()=>5000}},performance:{now:()=>10000},foreground:true});
 assert.equal(clock(),10000);
});
test('mobile recursion renders real contours, owns the shared slot, and finishes across ambient rest',async()=>{
 let now=0,frame,deadline,active=null;const children=[];
 const make=()=>({dataset:{},classList:{add(){}},setAttribute(){},append(el){children.push(el)},remove(){}});
 const wrap=make();wrap.querySelector=()=>make();
 const effects={ambientPaused:true,ambientBlocked:false,claim(name){if(active)return false;active=name;return true},release(name){if(active===name)active=null},watch(){},beat(){},ambientNow:()=>0};
 const window={inteonHomeEffects:effects,addEventListener(){}};
 vm.runInNewContext(source('logo-materials.js'),{window,document:{querySelector:()=>wrap,documentElement:{dataset:{graphicsLevel:'3'}},createElementNS:make,addEventListener(){},hidden:false},matchMedia:q=>({matches:!q.includes('reduced'),addEventListener(){}}),performance:{now:()=>now},getComputedStyle:()=>({getPropertyValue:()=> '200,220,180'}),requestAnimationFrame:fn=>{frame=fn;return 1},cancelAnimationFrame(){},setTimeout(fn,ms){assert.equal(ms,6600);deadline=fn;return 1},clearTimeout(){}});
 const done=window.inteonLogoMaterials.run('recursion');assert.ok(done?.then,'mobile returns completion promise');assert.equal(active,'recursion');assert.ok(children.length>=3,'real SVG contour layer');
 now=6600;assert.equal(typeof deadline,"function","wall deadline must survive a stalled RAF");deadline();await done;assert.equal(active,null);assert.equal(wrap.dataset.materialPreview,undefined);
});
