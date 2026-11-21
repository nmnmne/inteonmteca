const radians = Math.PI / 180;
const minuteMs = 60000;
const dayMs = 24 * 60 * minuteMs;
const entryLag = 20 * minuteMs;
const firstLap = 5 * minuteMs;
const secondLap = firstLap / 2;
const thirdLap = secondLap / 2;
const effectSecondMs = 72000; // One shader second represents 72 simulated seconds.
const repeatMs = secondLap + thirdLap + firstLap;
const visitKey = 'inteon.courtyard.visit-clock-v2';
// The courtyard in Oral uses UTC+5. Its civil clock follows the visitor's
// wall clock at entry, while the sun still uses the courtyard's coordinates.
const courtyardUtcOffsetMinutes = 5 * 60;
export const COURTYARD_ORIGIN = Object.freeze({lat:51.230186, lon:51.439256});

function timeOfDay(ms) {
  return ((ms % dayMs) + dayMs) % dayMs;
}

export function createVisitClock(startEpochMs) {
  const offset = new Date(startEpochMs).getTimezoneOffset();
  const syncOffset = new Date(startEpochMs + firstLap).getTimezoneOffset();
  return {
    startEpochMs,
    firstLapMs:firstLap,
    startTimeMs:timeOfDay(startEpochMs - offset * minuteMs - entryLag),
    // Travel backward to the device's civil time at the end of the first lap,
    // including any daylight-saving transition between entry and that instant.
    firstAdvanceMs:-dayMs + entryLag + firstLap + (offset - syncOffset) * minuteMs,
  };
}

function readVisit() {
  try {
    const visit = JSON.parse(window.sessionStorage.getItem(visitKey));
    if (visit && Number.isSafeInteger(visit.startEpochMs) &&
        Number.isInteger(visit.startTimeMs) && visit.startTimeMs >= 0 && visit.startTimeMs < dayMs &&
        Number.isInteger(visit.firstAdvanceMs) && Math.abs(visit.firstAdvanceMs) < 3 * dayMs) {
      // Older visits retain their original entrance. Recalculate the
      // time-zone offset for the new rendezvous.
      if (visit.firstLapMs !== firstLap) {
        const updated = createVisitClock(visit.startEpochMs);
        visit.firstAdvanceMs = updated.firstAdvanceMs;
        visit.firstLapMs = firstLap;
      }
      if (visit.firstAdvanceMs < 0 && visit.firstAdvanceMs > -3 * dayMs) return visit;
    }
  } catch { /* A document can run the clock without storage. */ }
  return null;
}

let visitClock;
if (typeof window !== 'undefined') {
  const navigation = window.performance?.getEntriesByType?.('navigation')[0]?.type;
  const internal = window.document.referrer.startsWith(window.location.origin+'/');
  const newTab = window.opener && window.history.length===1;
  const continuing = navigation==='back_forward' || (navigation!=='reload' && internal && !newTab);
  visitClock = (continuing ? readVisit() : null) ?? createVisitClock(Date.now());
  try { window.sessionStorage.setItem(visitKey,JSON.stringify(visitClock)); } catch { /* Keep the local anchor. */ }
  window.addEventListener('pageshow',event => {
    if (event.persisted) visitClock = readVisit() ?? visitClock;
  }, {capture:true});
} else {
  visitClock = createVisitClock(Date.now());
}

function courtyardTimeline(epochMs, visit) {
  const elapsed = Math.max(0, epochMs - visit.startEpochMs);
  if (elapsed < firstLap) {
    return visit.startTimeMs + visit.firstAdvanceMs * (elapsed / firstLap);
  }
  // Once synchronized, whole rotations return to the same civil time.
  // Absolute elapsed time also accounts for time spent in a background tab.
  const sinceSync = elapsed - firstLap;
  let wholeLaps = Math.floor(sinceSync / repeatMs) * 3;
  let within = sinceSync % repeatMs;
  let lap = secondLap;
  if (within >= secondLap + thirdLap) {
    wholeLaps += 2;
    within -= secondLap + thirdLap;
    lap = firstLap;
  } else if (within >= secondLap) {
    wholeLaps++;
    within -= secondLap;
    lap = thirdLap;
  }
  return visit.startTimeMs + visit.firstAdvanceMs - dayMs * (wholeLaps + within / lap);
}

export function courtyardClockTime(epochMs, visit=visitClock) {
  return timeOfDay(courtyardTimeline(epochMs, visit));
}

// Keep the scale of the weather effects independent of lap length. Elapsed whole
// laps stay in the phase so rain and ripples accelerate smoothly across midnight.
export function courtyardEffectSeconds(epochMs, visit=visitClock) {
  return courtyardTimeline(epochMs, visit) / effectSecondMs;
}

function smooth(value, low, high) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

// NOAA solar equations. UTC plus geographic longitude keeps the scene on the
// courtyard's clock even when the listener is in a different time zone.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function sunForLocation({lat, lon}, epochMs) {
  return solarPosition(lat, lon, epochMs, timeOfDay(epochMs) / minuteMs);
}

// Declination follows the actual season. Only the clock used for the angular
// position of the sun, shadows and poster runs on the accelerated schedule.
export function courtyardSunForLocation({lat, lon}, epochMs, visit=visitClock) {
  const utcMinutes = courtyardClockTime(epochMs, visit) / minuteMs - courtyardUtcOffsetMinutes;
  return solarPosition(lat, lon, epochMs, utcMinutes);
}

function solarPosition(lat, lon, epochMs, utcMinutes) {
  const year = new Date(epochMs).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const yearDays = (Date.UTC(year + 1, 0, 1) - start) / dayMs;
  const gamma = 2 * Math.PI / yearDays * ((epochMs - start) / dayMs - .5);
  const correction = 229.18 * (.000075 + .001868*Math.cos(gamma) - .032077*Math.sin(gamma)
    - .014615*Math.cos(2*gamma) - .040849*Math.sin(2*gamma));
  const declination = .006918 - .399912*Math.cos(gamma) + .070257*Math.sin(gamma)
    - .006758*Math.cos(2*gamma) + .000907*Math.sin(2*gamma)
    - .002697*Math.cos(3*gamma) + .00148*Math.sin(3*gamma);
  const hourAngle = ((utcMinutes + correction + 4 * lon) / 4 - 180) * radians;
  const latitude = lat * radians;
  const meridian = Math.cos(declination) * Math.cos(hourAngle);
  const up = Math.sin(latitude)*Math.sin(declination) + Math.cos(latitude)*meridian;
  const direction = [
    -Math.cos(declination)*Math.sin(hourAngle), up,
    Math.sin(latitude)*meridian - Math.cos(latitude)*Math.sin(declination),
  ];
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, up))) / radians;
  return {direction, elevationDeg, daylight:smooth(elevationDeg, -.83, 7),
    night:1 - smooth(elevationDeg, -7, 3)};
}

// These are display-space sky colours; Three converts the packed sRGB samples
// to linear light when assigning them to the atmosphere and light sources.
function mixRGB(a, b, amount) {
  let rgb = 0;
  for (const shift of [16, 8, 0]) {
    const from = (a >> shift) & 255, to = (b >> shift) & 255;
    rgb |= Math.round(from + (to - from) * amount) << shift;
  }
  return rgb;
}

export function solarLighting({direction, elevationDeg, daylight}) {
  const twilight = smooth(elevationDeg, -12, -.5);
  const highSun = smooth(elevationDeg, -1, 17);
  const evening = smooth(-direction[0], 0, .4) * smooth(elevationDeg, -11, -2) * (1-highSun);
  function sky(night, dusk, day) {
    return mixRGB(mixRGB(night, dusk, twilight), day, highSun);
  }
  return {
    sunVectorXYZ: direction,
    skyColor: mixRGB(sky(0x1d2d48, 0x8994b1, 0xa7c9e3), 0x966eaf, evening*.83),
    fogColor: mixRGB(sky(0x29364b, 0xd9a296, 0xc6d7de), 0xee9b9e, evening*.73),
    sunColor: mixRGB(0xff9357, 0xfff0d8, highSun),
    sunIntensity: daylight * (1.65 + .48 * smooth(elevationDeg, 4, 45)),
    ambientColor: sky(0x9db3db, 0xe8c3c0, 0xfff2e3),
    ambientIntensity: .20 + .28*twilight + .10*highSun,
    hemisphereSkyColor: sky(0x839bce, 0xc0afc3, 0xc1dcf1),
    hemisphereGroundColor: sky(0x4c546b, 0x927479, 0xa19170),
    hemisphereIntensity: .32 + .55*twilight + .22*highSun,
    cloudColor: mixRGB(sky(0x333e55, 0xc59eaa, 0xf3f5fa), 0xec9eb7, evening*.73),
    reflectionTint: mixRGB(sky(0x334661, 0xc5a9aa, 0xffffff), 0xef9eb7, evening*.58),
  };
}
