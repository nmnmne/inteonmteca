const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

(async () => {
  const { COURTYARD_ORIGIN, createVisitClock, courtyardClockTime, courtyardSunForLocation, sunForLocation, solarLighting } = await import('../yard/solar-clock.js');
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
  // The accelerated clock supplies civil hours in the yard. The ephemeris
  // still uses the real season, even after a suspended tab advances many laps.
  const dayMs = 86400000, minuteMs = 60000, oralOffset = 5 * 60 * minuteMs;
  const distance = (a, b) => Math.hypot(...a.direction.map((axis, i) => axis - b.direction[i]));
  for (const date of ['2026-03-20', '2026-06-21', '2026-12-21', '2028-02-29']) {
    const visitStart = Date.parse(date + 'T05:00:00Z');
    const visit = createVisitClock(visitStart);
    for (const elapsed of [0, 10, 19.5, 20, 22.5, 25, 29, 30, 32, 35, 45, 55, 35 * 1000 + 20]) {
      const epoch = visitStart + elapsed * minuteMs;
      const fast = courtyardSunForLocation(layout.origin, epoch, visit);
      const simulatedUtc = (courtyardClockTime(epoch, visit) - oralOffset + dayMs) % dayMs;
      // Take the closest instant with this time of day to minimize the small
      // effect its different seasonal timestamp has on the reference direction.
      const delta = (simulatedUtc - epoch % dayMs + dayMs * 1.5) % dayMs - dayMs / 2;
      const real = sunForLocation(layout.origin, epoch + delta);
      assert.ok(distance(fast, real) < .005, date + ' after ' + elapsed + ' real minutes');
    }
    for (const elapsed of [20, 30, 35, 55, 65]) {
      const boundary = visitStart + elapsed * minuteMs;
      const before = courtyardSunForLocation(layout.origin, boundary - 1, visit);
      const after = courtyardSunForLocation(layout.origin, boundary + 1, visit);
      assert.ok(distance(before, after) < 2 * Math.PI * 2 / (5 * minuteMs) + 1e-8);
    }
  }
  console.log('PASS solar azimuth, seasonal elevation, polar-axis orientation, twilight and continuous leap day');
  console.log('PASS courtyard sunlight follows the accelerated local clock across all three rotation lengths');
})().catch(error => { console.error(error); process.exitCode = 1; });
