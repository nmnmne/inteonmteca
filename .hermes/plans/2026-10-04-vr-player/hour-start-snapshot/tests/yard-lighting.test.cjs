const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const lighting = await import('../yard/baked-lighting.js');
  const layout = {lighting:{fixedSun:{altitudeDeg:37.629, azimuthDegFromNorth:235.451}}};
  const first = lighting.fixedSunForLayout(layout);
  assert.deepEqual(first, lighting.fixedSunForLayout(layout), 'no dependency on current date/time');
  assert.ok(Math.abs(Math.hypot(...first.sunVectorXYZ)-1)<1e-8);
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../yard/data/shadows/manifest.json')));
  assert.equal(manifest.kind,'precomputed-projected-depth-not-UV-lightmaps');
  assert.equal(manifest.presets.length,12);
  const runtime=fs.readFileSync(path.join(__dirname,'../yard/shadow-atlas.js'),'utf8');
  for(const forbidden of ['new THREE.WebGLRenderTarget','renderer.render(', 'CanvasTexture','projectShadowFootprint']) assert.ok(!runtime.includes(forbidden),forbidden);
  assert.ok(runtime.includes('fetch(new URL(entry.file, base)'), 'only selected preset is loaded');
  console.log('PASS: actual offline shadow assets and no runtime rasterization');
})().catch(error=>{console.error(error);process.exitCode=1;});
