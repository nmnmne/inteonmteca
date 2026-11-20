const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

(async () => {
  const { COURTYARD_ORIGIN, sunForLocation, solarLighting } = await import('../yard/solar-clock.js');
  const {lat, lon} = layout.origin;
  assert.deepEqual(COURTYARD_ORIGIN, {lat, lon});
  const sample = iso => sunForLocation({lat, lon}, Date.parse(iso));
  const solarNoon = sample('2026-03-20T08:42:00Z');
  assert.ok(Math.abs(solarNoon.direction[0]) < .03 && solarNoon.direction[2] > .7);
  assert.ok(solarNoon.elevationDeg > 37 && solarNoon.elevationDeg < 40);
  assert.ok(sample('2026-03-20T04:00Z').direction[0] > .9);
  assert.ok(sample('2026-03-20T13:20Z').direction[0] < -.9);
  assert.ok(sample('2026-06-21T08:35Z').elevationDeg > 61);
  assert.ok(sample('2026-12-21T08:35Z').elevationDeg < 16);
  const midnight = sample('2026-03-20T20:35Z');
  assert.equal(solarLighting(midnight).sunIntensity, 0);
  assert.equal(midnight.night, 1);
  assert.equal(solarNoon.night, 0);
  const start = Date.parse('2028-02-29T00:00Z');
  let previous = null;
  for (let minute = 0; minute <= 1440; minute++) {
    const sun = sunForLocation({lat,lon}, start + minute * 60000);
    const {daylight, night, direction, elevationDeg} = sun;
    assert.ok(daylight >= 0 && daylight <= 1 && night >= 0 && night <= 1);
    assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-10);
    if (previous !== null) assert.ok(Math.abs(elevationDeg - previous) < .2);
    previous = elevationDeg;
  }
  console.log('PASS solar azimuth, seasonal elevation, polar-axis orientation, twilight and continuous leap day');
})().catch(error => { console.error(error); process.exitCode = 1; });
