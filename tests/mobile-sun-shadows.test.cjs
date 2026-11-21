const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('mobile quality switches solar filters without recompiling receivers or reallocating same-sized maps', async t => {
  const THREE = await import('../yard/vendor/three.module.js');
  const {createSolarLighting} = await import('../yard/solar-lighting.js');
  const canvas = {getContext: () => ({fillRect() {}, createRadialGradient: () => ({addColorStop() {}})})};
  const initialDocument = global.document, initialMedia = global.matchMedia;
  global.document = {documentElement:{dataset:{graphicsLevel:'3'}}, createElement: () => canvas};
  global.matchMedia = () => ({matches:true});
  t.after(() => {
    if (initialDocument === undefined) delete global.document; else global.document = initialDocument;
    if (initialMedia === undefined) delete global.matchMedia; else global.matchMedia = initialMedia;
  });
  const scene = new THREE.Scene(), material = new THREE.MeshLambertMaterial(), sun = new THREE.DirectionalLight();
  scene.add(new THREE.AmbientLight(),new THREE.HemisphereLight(),sun,new THREE.Mesh(new THREE.BoxGeometry(),material));
  const lighting = createSolarLighting({capabilities:{maxTextureSize:4096},shadowMap:{}},
    {scene,edgeEffect:{setSky() {}}},layout);
  const shader = {uniforms:{},fragmentShader:'#include <shadowmap_pars_fragment>\n#include <lights_fragment_begin>'};
  material.onBeforeCompile(shader);
  const filter = shader.uniforms.sunShadowCompact;
  assert.equal(sun.shadow.mapSize.x,1024);
  assert.equal(filter.value,true);
  const compiledVersion = material.version;
  let disposals = 0;
  const map = sun.shadow.map = {dispose() { disposals++; }};
  lighting.setQuality(4,true);
  assert.equal(filter.value,false);
  assert.equal(sun.shadow.map,map);
  lighting.setQuality(2,true);
  assert.equal(filter.value,true);
  assert.equal(disposals,0);
  lighting.setQuality(1,true);
  assert.equal(disposals,1);
  assert.equal(sun.shadow.mapSize.x,768);
  lighting.setQuality(1,false);
  assert.equal(filter.value,false);
  assert.equal(sun.shadow.mapSize.x,1024);
  assert.equal(material.version,compiledVersion);
  lighting.dispose();
});
