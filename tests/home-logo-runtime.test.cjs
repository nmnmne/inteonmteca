const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n};', start) + 3);
}

test('logo canvas draws cached geometry and gradients, refreshes size, and skips hidden low quality', () => {
  const bounds = {left: 10, top: 20, width: 200, height: 40};
  let layoutReads = 0;
  const gradients = [], strokes = [], fills = [];
  let currentPath = [], transform, savedAlpha;
  const ctx = {
    globalAlpha: 1,
    setTransform(...args) { transform = args; }, clearRect() {},
    save() { savedAlpha = this.globalAlpha; }, restore() { this.globalAlpha = savedAlpha; },
    beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push([x, y]); }, lineTo(x, y) { currentPath.push([x, y]); },
    arc(...args) { currentPath.push(args); },
    createLinearGradient(...args) {
      const gradient = {args, transform, stops: [], addColorStop(...stop) { this.stops.push(stop); }};
      gradients.push(gradient);
      return gradient;
    },
    stroke() { strokes.push({path: currentPath, alpha: this.globalAlpha, gradient: this.strokeStyle, shadow: this.shadowColor}); },
    fill() { fills.push({alpha: this.globalAlpha, color: this.fillStyle}); },
  };
  const context = vm.createContext({
    logoWrap: {getBoundingClientRect() { layoutReads++; return {...bounds}; }},
    logoReactiveCanvas: {width: 0, height: 0, getBoundingClientRect() { layoutReads++; return {...bounds}; }},
    logoReactiveContext: ctx, logoCanvasMetrics: null, logoPointerBounds: null, logoFilamentGradients: null,
    isMobileViewport: false, animationQuality: 'high', isListeningRoom: true, devicePixelRatio: 2,
    logoReactiveState: {x: 0, y: 0, proximity: 0, hoverX: 0, hoverY: 0},
    logoFilamentSeeds: [{x: .5, y: .5, band: 1, phase: 0, size: 1}],
    profile: {bass: .3, mid: .2, high: .1, flux: .05},
  });
  vm.runInContext(['refreshLogoPointerBounds', 'resizeLogoCanvas', 'updateLogoPointer', 'drawLogoFilaments'].map(functionSource).join('\n'), context);
  vm.runInContext('resizeLogoCanvas(); drawLogoFilaments(1000, profile);', context);
  assert.equal(layoutReads, 2);
  assert.equal(context.logoReactiveCanvas.width, 150);
  assert.equal(context.logoReactiveCanvas.height, 30);
  assert.equal(gradients.length, 2);
  assert.equal(strokes.length, 10, 'nine strands plus one energetic particle trail are still drawn');
  for (let index = 0; index < 9; index++) {
    const stroke = strokes[index];
    const green = index % 3 === 0;
    assert.equal(stroke.path.length, 65);
    assert.equal(stroke.path[0][0], 16);
    assert.ok(Math.abs(stroke.path.at(-1)[0] - 184) < 1e-9);
    const alpha = .025 + (green ? context.profile.high * .18 : context.profile.mid * .14);
    assert.equal(stroke.alpha, alpha);
    assert.deepEqual(stroke.gradient.stops, [
      [0, `rgba(${green ? '204,255,105' : '224,112,64'},0)`],
      [.22, `rgba(${green ? '204,255,105' : '224,112,64'},1)`],
      [.78, `rgba(${green ? '204,255,105' : '224,112,64'},1)`],
      [1, `rgba(${green ? '204,255,105' : '224,112,64'},0)`],
    ]);
  }
  assert.equal(fills[0].alpha, 1, 'strand opacity does not leak into particles');
  assert.equal(strokes[9].alpha, 1, 'particle trail retains its own alpha');
  vm.runInContext('for (let i=0;i<60;i++) { updateLogoPointer({clientX:110,clientY:40}); drawLogoFilaments(1017+i*17, profile); }', context);
  assert.equal(layoutReads, 2, 'render and pointer frames never measure DOM');
  assert.equal(gradients.length, 2, 'gradients are reused across animation frames');
  assert.equal(context.logoReactiveState.hoverX, 0);
  assert.equal(context.logoReactiveState.hoverY, 0);
  bounds.width = 400;
  vm.runInContext('resizeLogoCanvas(); drawLogoFilaments(2200, profile);', context);
  assert.equal(layoutReads, 4);
  assert.equal(gradients.length, 4, 'new size rebuilds gradients');
  assert.equal(context.logoReactiveCanvas.width, 300);
  const before = strokes.length;
  context.animationQuality = 'low';
  vm.runInContext('drawLogoFilaments(2400, profile);', context);
  assert.equal(strokes.length, before, 'CSS-hidden desktop canvas has no rendering work');
});

test('unchanged SVG attributes do not dirty the logo, changed values still apply', () => {
  const attributes = new Map();
  let writes = 0;
  const element = {getAttribute: name => attributes.get(name), setAttribute(name, value) { writes++; attributes.set(name, value); }};
  const context = vm.createContext({element});
  vm.runInContext(functionSource('writeLogoAttribute') + '\nwriteLogoAttribute(element,"scale","1.4"); writeLogoAttribute(element,"scale","1.4");', context);
  assert.equal(writes, 1);
  vm.runInContext('writeLogoAttribute(element,"scale","2.8");', context);
  assert.equal(writes, 2);
  assert.equal(attributes.get('scale'), '2.8');
});

test('quality ignores isolated stalls, adapts after sustained slow frames, and restores with hysteresis', () => {
  let now = 0;
  const changed = [];
  const context = vm.createContext({
    animationQuality: 'high', slowFrameScore: 0, stableFrameTime: 0, qualityCooldownUntil: 0,
    lowPowerDevice: false, document: {hidden: false, documentElement: {dataset: {}}},
    performance: {now: () => now}, rebuildQualityDependentState() { changed.push(context.animationQuality); },
  });
  vm.runInContext(functionSource('setAnimationQuality') + '\n' + functionSource('recordFramePacing'), context);
  const frame = (delta) => { now += delta; vm.runInContext(`recordFramePacing(${delta});`, context); };
  frame(500);
  frame(80);
  for (let i = 0; i < 120; i++) frame(16);
  assert.deepEqual(changed, [], 'single stalls do not lower quality');
  for (let i = 0; i < 59; i++) frame(34);
  assert.equal(context.animationQuality, 'low');
  assert.deepEqual(changed, ['low']);
  for (let i = 0; i < 800; i++) frame(16);
  assert.equal(context.animationQuality, 'low', 'cooldown plus sustained recovery prevents toggling');
  for (let i = 0; i < 30; i++) frame(16);
  assert.equal(context.animationQuality, 'high');
  assert.deepEqual(changed, ['low', 'high']);
  context.document.hidden = true;
  now += 6000;
  for (let i = 0; i < 100; i++) frame(34);
  assert.equal(context.animationQuality, 'high', 'hidden tabs never influence quality');
  context.document.hidden = false;
  context.animationQuality = 'low';
  context.lowPowerDevice = true;
  for (let i = 0; i < 1000; i++) frame(16);
  assert.equal(context.animationQuality, 'low', 'known low-power devices retain their conservative initial quality');
});
