const radians = Math.PI / 180;
const dayMs = 86400000;
const courtyardDayMs = 20 * 60000;
const phaseKey = 'inteon.courtyard.phase-ms';
// Matches data/site-layout.json. Also available before the 3D layout has loaded.
export const COURTYARD_ORIGIN = Object.freeze({lat:51.230186, lon:51.439256});

function readPhase() {
  try {
    const stored = window.sessionStorage.getItem(phaseKey);
    if (stored !== null && /^\d+$/.test(stored) && Number(stored)<courtyardDayMs) return Number(stored);
  } catch { /* The document keeps its own phase if storage is unavailable. */ }
  return null;
}

let visitPhase = 0;
if (typeof window !== 'undefined') {
  const navigation = window.performance?.getEntriesByType?.('navigation')[0]?.type;
  const internal = window.document.referrer.startsWith(window.location.origin+'/');
  const newTab = window.opener && window.history.length===1;
  const continuing = navigation==='back_forward' || (navigation!=='reload' && internal && !newTab);
  visitPhase = (continuing ? readPhase() : null) ?? Math.floor(Math.random()*courtyardDayMs);
  try { window.sessionStorage.setItem(phaseKey,String(visitPhase)); } catch { /* Keep this document running. */ }
  window.addEventListener('pageshow',event => {
    // A later page may have started a fresh day. Restore it before the poster's
    // pageshow listener samples the sky for the first visible frame.
    if (event.persisted) visitPhase = readPhase() ?? visitPhase;
  }, {capture:true});
}

function smooth(value, low, high) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

// NOAA solar equations. UTC plus geographic longitude keeps the scene on the
// courtyard's clock even when the listener is in a different time zone.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function sunForLocation({lat, lon}, epochMs) {
  return solarPosition(lat, lon, epochMs, dayMs);
}

// The whole visit shares one accelerated rotation. Declination still follows
// the real seasonal calendar in Uralsk, including across virtual midnights.
export function courtyardSunForLocation({lat, lon}, epochMs, phaseMs = visitPhase) {
  return solarPosition(lat, lon, epochMs, courtyardDayMs, phaseMs);
}

function solarPosition(lat, lon, epochMs, rotationMs, phaseMs = 0) {
  const year = new Date(epochMs).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const yearDays = (Date.UTC(year + 1, 0, 1) - start) / dayMs;
  const gamma = 2 * Math.PI / yearDays * ((epochMs - start) / dayMs - .5);
  const correction = 229.18 * (.000075 + .001868*Math.cos(gamma) - .032077*Math.sin(gamma)
    - .014615*Math.cos(2*gamma) - .040849*Math.sin(2*gamma));
  const declination = .006918 - .399912*Math.cos(gamma) + .070257*Math.sin(gamma)
    - .006758*Math.cos(2*gamma) + .000907*Math.sin(2*gamma)
    - .002697*Math.cos(3*gamma) + .00148*Math.sin(3*gamma);
  const rotated = epochMs + phaseMs;
  const intoRotation = rotated - Math.floor(rotated / rotationMs) * rotationMs;
  const utcMinutes = intoRotation * 1440 / rotationMs;
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
