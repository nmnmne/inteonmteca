const {test} = require('node:test');
const assert = require('node:assert/strict');

test('moving fronts share a normalized seasonal field across sound, precipitation and puddles', async () => {
  const {sampleWeather, weatherTexture} = await import('../yard/weather-field.js');
  const T = await import('../yard/vendor/three.module.js');
  const kinds = ['rain','snow','spring','summer','autumn'];
  const sample = {}, atWindow = new Set();
  for (let seconds = 0; seconds <= 240; seconds += 10) {
    const inYard = new Set();
    for (let x = -30; x <= 30; x += 3) for (let z = -30; z <= 30; z += 3) {
      assert.equal(sampleWeather(x,z,seconds,sample), sample);
      const weights = kinds.map(k => sample[k]);
      assert.ok(weights.every(w => w >= 0 && w <= 1));
      assert.ok(Math.abs(weights.reduce((n,w) => n+w)-1) < 1e-8);
      const core = weights.findIndex(w => w > .95);
      if (core >= 0) inYard.add(kinds[core]);
    }
    assert.equal(inYard.size,5, 'all five local seasons are present together');
    sampleWeather(0,0,seconds,sample);
    for (const kind of kinds) if (sample[kind] > .79) atWindow.add(kind);
  }
  assert.equal(atWindow.size,5,'each front passes a stationary listener');
  assert.equal(weatherTexture(T),weatherTexture(T),'the shaders share one static atlas');
});

test('touch and desktop render every seasonal front through one instanced draw, hidden outside the yard', async () => {
  const T = await import('../yard/vendor/three.module.js');
  const {addCourtyardWeather} = await import('../yard/courtyard-weather.js');
  const {weatherTexture} = await import('../yard/weather-field.js');
  const old = global.matchMedia;
  try {
    for (const compact of [false,true]) {
      global.matchMedia = query => ({matches: query.includes('pointer') && compact});
      const scene = new T.Scene();
      scene.userData.grassWind = {value:29};
      const pavement=new T.MeshStandardMaterial();
      addCourtyardWeather(scene,{},pavement);
      const shader={...T.ShaderLib.standard,uniforms:{}};
      pavement.onBeforeCompile(shader);
      assert.match(shader.fragmentShader,/\n[ \t]*#define STANDARD/,'the surface shader directive starts on its own line');
      const front=scene.getObjectByName('courtyard-weather-fronts');
      assert.equal(front.geometry.instanceCount,compact ? 830 : 1500);
      assert.equal(front.material.uniforms.weatherMap.value,weatherTexture(T));
      front.onBeforeRender();
      assert.equal(front.material.uniforms.seconds.value,29);
      scene.userData.virtuality=1;
      front.onBeforeRender();
      assert.equal(front.material.uniforms.visibility.value,0);
    }
  } finally {
    if (old === undefined) delete global.matchMedia;
    else global.matchMedia = old;
  }
});
