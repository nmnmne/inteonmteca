const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'development-debug.js'), 'utf8');

async function fixture({mobile = false, stored = null, gpu = null, runtime = {debug:true}, ok = true, networkError = false} = {}) {
  const all = [], calls = [];
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(name, callback) {if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback);},
      async emit(name, values = {}) {for (const callback of listeners.get(name) || []) await callback({type:name,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...values});},
      dispatchEvent(event) {this.emit(event.type, event);},
    };
  };
  const element = tag => {
    const classes = new Set();
    const el = Object.assign(eventTarget(), {tagName:tag, children:[], dataset:{}, attributes:{}, isConnected:true, hidden:false, style:{setProperty() {}},
      classList:{add(name) {classes.add(name);}, remove(name) {classes.delete(name);},
        toggle(name, on) {if (on) classes.add(name); else classes.delete(name);}, contains:name=>classes.has(name)},
      append(...children) {this.children.push(...children); children.forEach(c=>c.parent=this);},
      setAttribute(name, value) {this.attributes[name]=value;}, removeAttribute(name) {delete this.attributes[name];},
      contains(target) {return this === target || this.children.some(child=>child.contains?.(target));},
      querySelector() {return null;}, querySelectorAll() {const descendants=this.children.flatMap(c=>[c,...c.querySelectorAll()]);return descendants.filter(c=>['button','input','summary'].includes(c.tagName));},
      closest:()=>null, checkVisibility() {let p=this;while(p){if(p.hidden)return false;p=p.parent;}return true;}, getBoundingClientRect:()=>({left:10,bottom:52,right:120,top:30}),getAnimations:()=>[],focus() {this.focused=true;document.activeElement=this;},
    });
    if (tag === 'canvas' && gpu) el.getContext = gpu;
    all.push(el); return el;
  };
  const copy=element('span'), root=element('html'), body=element('body'), head=element('head');
  const document=Object.assign(eventTarget(), {documentElement:root,body,head,createElement:element,
    querySelector: selector => selector === '.hero-intro .topline' ? copy : null});
  const compact=Object.assign(eventTarget(),{matches:mobile});
  const window=eventTarget();
  const storage=new Map(stored===null?[]:[['inteonmteca-debug-enabled',stored]]);
  Object.assign(window,{inteonGraphicsQuality:{level:5,fps:60,mode:'auto',state:'waiting',snapshot:()=>({}),
    setManualLevel:value=>calls.push(['manual',value]),recalibrate:value=>calls.push(['recalibrate',value])},
    inteonMobileLogo:{stop:()=>calls.push(['mobile-stop']),run:name=>calls.push(['mobile-run',name])}});
  const context={window,document,matchMedia:()=>compact,Event:class{constructor(type){this.type=type;}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    navigator:{hardwareConcurrency:8},innerWidth:mobile?390:1440,innerHeight:900,devicePixelRatio:1,
    setTimeout,clearTimeout,fetch:async (url, options)=>{
      assert.equal(url,'/api/runtime'); assert.equal(options.cache,'no-store');
      if (networkError) throw Error('offline');
      return {ok, redirected:false, headers:{get:()=> 'application/json'}, json:async()=>runtime};
    }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'popup-coordinator.js'), 'utf8'),context);
  vm.runInNewContext(source,context);
  assert.equal(await window.inteonDebugReady, !networkError && ok && runtime?.debug === true);
  return {all,root,body,head,document,compact,window,calls,storage,
    master:all.find(el=>el.className==='development-debug-toggle development-debug-master'),
    effects:all.find(el=>el.attributes['aria-controls']==='development-animation-menu'),
    quality:all.find(el=>el.id==='development-quality'),
    menu:all.find(el=>el.id==='development-animation-menu'),
    slider:all.find(el=>el.className==='development-quality-slider')};
}

test('static, production, malformed and unreachable runtimes never create debug controls', async () => {
  for (const options of [{runtime:{debug:false}}, {runtime:{}}, {runtime:{debug:'true'}}, {ok:false}, {networkError:true}]) {
    const run = await fixture({...options, stored:'1'});
    assert.equal(run.master,undefined);
    assert.equal(run.quality,undefined);
    assert.equal(run.menu,undefined);
    assert.equal(run.root.dataset.debugEnabled,'false');
  }
});

test('GPU diagnostics create and release one default context only after an explicit click', async () => {
  const calls=[]; let released=0;
  const run=await fixture({gpu:(type,options)=>{
    calls.push([type,options.powerPreference]);
    return {getExtension:name=>name==='WEBGL_lose_context'?{loseContext:()=>released++}:null};
  }});
  assert.equal(calls.length,0);
  const button=run.all.find(el=>el.textContent==='Проверить доступный GPU');
  await button.emit('click'); await button.emit('click');
  assert.deepEqual(calls,[['webgl2','default']]); assert.equal(released,1);
  assert.equal(button.disabled,true);
  assert.deepEqual(run.calls,[['recalibrate','gpu-probe']]);
});

test('actual development server starts off and permits opt-in controls', async () => {
  const run=await fixture();
  assert.equal(run.root.dataset.debugEnabled,'false');
  assert.equal(run.master.attributes.role,'switch');
  assert.equal(run.master.attributes['aria-checked'],'false');
  await run.master.emit('click');
  assert.equal(run.root.dataset.debugEnabled,'true');
  assert.equal(run.master.attributes['aria-checked'],'true');
  assert.ok(run.body.contains(run.quality));
  assert.equal(run.menu.children.length,6);
  assert.ok(run.menu.children.every(entry=>!entry.disabled));
  run.slider.value='7'; await run.slider.emit('input');
  assert.deepEqual(run.calls,[['manual',7]],'existing one-minute controller receives the choice');
});

for (const mobile of [false, true]) {
  test(`new visits ignore previously enabled debug (${mobile ? 'mobile' : 'desktop'})`, async () => {
    const first = await fixture({mobile, stored:'1'});
    assert.equal(first.root.dataset.debugEnabled,'false');
    await first.master.emit('click');
    assert.equal(first.root.dataset.debugEnabled,'true');
    const reload = await fixture({mobile, stored:first.storage.get('inteonmteca-debug-enabled')});
    assert.equal(reload.root.dataset.debugEnabled,'false');
    await reload.window.emit('storage',{key:'inteonmteca-debug-enabled',newValue:'1'});
    assert.equal(reload.root.dataset.debugEnabled,'false','another tab cannot enable debug');
  });
  test(`back-forward restored visits reset debug (${mobile ? 'mobile' : 'desktop'})`, async () => {
    const run = await fixture({mobile});
    await run.master.emit('click');
    await run.effects.emit('click');
    assert.equal(run.root.dataset.debugEnabled,'true');
    assert.equal(run.menu.hidden,false);
    await run.window.emit('pageshow',{persisted:true});
    assert.equal(run.root.dataset.debugEnabled,'false');
    assert.equal(run.root.dataset.debugCompactOpen,'false');
    assert.equal(run.menu.hidden,true);
    await run.master.emit('click');
    assert.equal(run.root.dataset.debugEnabled,'true','manual toggle still works after return');
  });
}

test('mobile keeps a compact closed drawer, opens controls and dismisses outside or with Escape', async () => {
  const run=await fixture({mobile:true});
  assert.equal(run.root.dataset.debugCompactOpen,'false');
  assert.equal(run.master.attributes.role,'button');
  assert.equal(run.master.attributes['aria-expanded'],'false');
  await run.master.emit('click');
  assert.equal(run.root.dataset.debugCompactOpen,'true');
  assert.equal(run.master.attributes['aria-expanded'],'true');
  await run.effects.emit('click'); assert.equal(run.menu.hidden,false);
  await run.document.emit('pointerdown',{target:run.body});
  assert.equal(run.root.dataset.debugCompactOpen,'false');
  assert.equal(run.master.textContent,'debug');
  assert.equal(run.menu.hidden,true);
  await run.master.emit('click');
  await run.window.emit('keydown',{key:'Escape'});
  assert.equal(run.root.dataset.debugCompactOpen,'false');
  assert.equal(run.master.focused,true);
  assert.equal(run.menu.children.find(entry=>entry.textContent==='Распад на кусочки').disabled,false);
  assert.equal(run.menu.children.find(entry=>entry.textContent==='Рекурсия').disabled,false);
  assert.equal(run.menu.children.find(entry=>entry.textContent==='Растворение').disabled,false);
  assert.equal(run.menu.children.find(entry=>entry.textContent==='Разлёт и гроза').disabled,true);
});

test('quality copy stays dormant while hidden and refreshes when debug opens', async () => {
  const run=await fixture({mobile:true});
  const qualityCopy=()=>run.all.some(el=>String(el.textContent||'').startsWith('Графика '));
  assert.equal(qualityCopy(),false);
  await run.window.emit('inteon-quality-state');
  assert.equal(qualityCopy(),false,'hidden quality events do not rewrite detached copy');
  await run.master.emit('click');
  assert.equal(qualityCopy(),true,'opening diagnostics performs one current refresh');
});

test('compact debug Escape is hierarchical and another popup closes the drawer', async () => {
  const run=await fixture({mobile:true});
  await run.master.emit('click');
  await run.effects.emit('click');
  await run.menu.parent.emit('keydown',{key:'Escape',preventDefault(){this.defaultPrevented=true;},stopPropagation(){}});
  assert.equal(run.menu.hidden,true,'first Escape closes the effects menu');
  assert.equal(run.root.dataset.debugCompactOpen,'true','drawer remains available');
  assert.equal(run.effects.focused,true);
  await run.window.emit('keydown',{key:'Escape',preventDefault(){this.defaultPrevented=true;}});
  assert.equal(run.root.dataset.debugCompactOpen,'false','second Escape closes the drawer');
  await run.master.emit('click');
  await run.window.emit('inteon-popup-open',{detail:{owner:'theme'}});
  assert.equal(run.root.dataset.debugCompactOpen,'false');
});

test('mobile debug routes scatter, dissolve and recursion through the compact effect owner', async () => {
  const run=await fixture({mobile:true});
  await run.master.emit('click');
  for (const [label,name] of [['Распад на кусочки','scatter'],['Растворение','dissolve'],['Рекурсия','recursion']]) {
    await run.menu.children.find(entry=>entry.textContent===label).emit('click');
    assert.deepEqual(run.calls.filter(call=>call[0]==='mobile-run').at(-1),['mobile-run',name]);
  }
});

test('desktop toggle is visit-local and a compact user can still open diagnostics', async () => {
  const run=await fixture({stored:'0'});
  assert.equal(run.root.dataset.debugEnabled,'false');
  await run.master.emit('click');
  assert.equal(run.root.dataset.debugEnabled,'true');
  assert.equal(run.storage.get('inteonmteca-debug-enabled'),'0');
  run.compact.matches=true; await run.compact.emit('change');
  assert.equal(run.root.dataset.debugCompactOpen,'false');
  assert.equal(run.master.attributes.role,'button');
  await run.master.emit('click');
  assert.equal(run.root.dataset.debugCompactOpen,'true');
  run.compact.matches=false; await run.compact.emit('change');
  assert.equal(run.master.attributes.role,'switch');
  assert.equal(run.root.dataset.debugCompactOpen,'false');
  assert.ok(run.menu.children.every(entry=>!entry.disabled));
});
