const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root,'yard/scene.js'),'utf8');
const code = source.slice(source.indexOf('export function drawScheme')).replace('export function','function');
const layout = JSON.parse(fs.readFileSync(path.join(root,'yard/data/site-layout.json'),'utf8'));
const main = fs.readFileSync(path.join(root,'yard/main.js'),'utf8');
for (const coarsePointer of [false, true]) {
  test(`minimap coalesces moving frames and skips stationary frames (touch=${coarsePointer})`, () => {
    const start = main.indexOf('    updateNear();') + '    updateNear();'.length;
    const end = main.indexOf('    const dirty = shouldRender', start);
    const update = new vm.Script('{' + main.slice(start, end) + '}');
    const draws = [];
    const scope = vm.createContext({coarsePointer, now:0, lastMapDraw:0, marked:null,
      body:{x:4,z:0,yaw:0}, schemeMap:{drawMarker:(...pose)=>draws.push(pose)}});
    for (const now of [0,16,32,48,64,120,240]) {
      scope.now=now;
      scope.body.yaw=now*.001;
      update.runInContext(scope);
    }
    assert.equal(draws.length,coarsePointer ? 2 : 3,'bounded redraw rate during rotation');
    scope.now=256;
    update.runInContext(scope);
    assert.equal(draws.length,coarsePointer ? 2 : 3,'stationary map does not redraw');
  });
}
function contextRecorder() {
  const calls=[];
  return new Proxy({calls}, {get(target,key) {
    if (key in target) return target[key];
    return (...args)=>calls.push([key,...args]);
  }});
}
function setup() {
  const context=contextRecorder();
  const baseContext=contextRecorder();
  const canvas={width:384,height:384,getContext:()=>context};
  const base={width:0,height:0,getContext:()=>baseContext};
  const scope={canvas,layout,document:{createElement:()=>base}};
  const map=vm.runInNewContext(code+'\ndrawScheme(canvas,layout);',scope);
  context.calls.length=0;
  return {map,context,base,baseContext};
}
test('minimap crops nearby geography rather than fitting the whole site',()=>{
  const {map,context,base}=setup();
  map.drawMarker(4,0,0);
  const image=context.calls.find(call=>call[0]==='drawImage');
  assert.equal(image.length,10,'uses source cropping');
  assert.ok(image[4] < base.width/2,'less than half of the world width is visible');
  assert.equal(image[4],image[5],'same world scale on both axes');
  assert.ok(context.calls.some(call=>call[0]==='clip'),'circular viewport clips map');
  assert.ok(context.calls.some(call=>call[0]==='arc'&&call[1]===192&&call[2]===192&&call[3]===192),'viewport centered circle');
});
test('moving player pans cached map while keeping the marker centered',()=>{
  const {map,context,baseContext}=setup();
  const baked=baseContext.calls.length;
  map.drawMarker(4,0,0);
  const first=context.calls.find(call=>call[0]==='drawImage');
  context.calls.length=0;
  map.drawMarker(24,12,Math.PI/2);
  const second=context.calls.find(call=>call[0]==='drawImage');
  assert.notEqual(first[2],second[2],'moving east pans source crop');
  assert.notEqual(first[3],second[3],'moving south pans source crop');
  assert.ok(context.calls.some(call=>call[0]==='translate'&&call[1]===192&&call[2]===192),'player stays in center');
  const rotation=context.calls.findIndex(call=>call[0]==='rotate'&&call[1]===Math.PI/2);
  const image=context.calls.findIndex(call=>call[0]==='drawImage');
  const marker=context.calls.findIndex(call=>call[0]==='moveTo');
  assert.ok(rotation>image && rotation<marker,'north-up map is drawn before rotating the direction arrow');
  assert.ok(!context.calls.slice(0,image).some(call=>call[0]==='rotate'),'static geography stays north-up');
  assert.ok(context.calls.slice(marker+1).some(call=>call[0]==='restore'),'arrow rotation is restored after painting');
  assert.equal(baseContext.calls.length,baked,'static geography is not repainted per frame');
});
