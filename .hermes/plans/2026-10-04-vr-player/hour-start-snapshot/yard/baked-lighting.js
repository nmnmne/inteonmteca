import * as THREE from "./vendor/three.module.js";
import { loadBakedShadows } from "./shadow-atlas.js";


const DEFAULT_FIXED_SUN = Object.freeze({
  localMoment: "20 April 16:20",
  timeZone: "Asia/Oral",
  altitudeDeg: 37.629,
  azimuthDegFromNorth: 235.451,
  sunVectorXYZ: [-0.65231, 0.61055, 0.44914],
  shadowDirectionXZ: [0.65231, -0.44914],
  skyColor: "#a4bec9",
  fogColor: "#a4bec9",
  ambientIntensity: 0.56,
  hemisphereIntensity: 0.4,
  sunIntensity: 1.18,
  phantomLengthScale: 0.47,
});

function numberArray(value, count, fallback) {
  if (!Array.isArray(value) || value.length !== count || value.some((item) => !Number.isFinite(Number(item)))) value = fallback;
  const numbers = value.map(Number);
  const length = count === 3 ? Math.hypot(...numbers) : 1;
  return numbers.map(item => item / (length || 1));
}

export function fixedSunForLayout(layout) {
  const source = layout?.lighting?.fixedSun || {};
  return {
    ...DEFAULT_FIXED_SUN,
    ...source,
    sunVectorXYZ: numberArray(source.sunVectorXYZ, 3, DEFAULT_FIXED_SUN.sunVectorXYZ),
    shadowDirectionXZ: numberArray(source.shadowDirectionXZ, 2, DEFAULT_FIXED_SUN.shadowDirectionXZ),
  };
}

export const LIGHTING_CYCLE_KEY = "inteon.yard.lighting.next.v1";
const SLOT_COUNT = 12;

// Read storage lazily: even accessing localStorage can throw in private/sandboxed pages.
export function createLightingCycle(storage = () => globalThis.localStorage) {
  let nextIndex = 0;
  let storageFailed = false;
  return {
    next(layout) {
      try {
        const saved = storageFailed ? null : storage()?.getItem(LIGHTING_CYCLE_KEY);
        if (saved !== null && saved !== undefined) {
          nextIndex = /^(?:[0-9]|1[01])$/.test(saved) ? Number(saved) : 0;
        }
      } catch { /* Continue the in-memory cycle when storage is unavailable. */ }
      const preset = lightingPresetForLayout(layout, nextIndex);
      nextIndex = (nextIndex + 1) % SLOT_COUNT;
      try {
        if (!storageFailed) storage()?.setItem(LIGHTING_CYCLE_KEY, String(nextIndex));
      } catch { storageFailed = true; /* Do not re-read a stale value after a failed write. */ }
      return preset;
    },
  };
}

export function lightingPresetForLayout(layout, index = 0) {
  const base = fixedSunForLayout(layout);
  const slot = Number.isInteger(index) && index >= 0 && index < SLOT_COUNT ? index : 0;
  const minutes = 16 * 60 + 20 + slot * 20;
  // Advance the existing NOAA-style 20 April 2026 / Asia/Oral reference,
  // not today's wall clock. Earth's polar axis in X-east / Y-up / Z-south
  // coordinates rotates this fixed-declination sun westward by 5° per slot.
  // This preserves the reference exactly; intraday declination drift is omitted.
  const latitude = THREE.MathUtils.degToRad(layout.origin.lat);
  const axis = new THREE.Vector3(0, Math.sin(latitude), -Math.cos(latitude));
  const vector = new THREE.Vector3(...base.sunVectorXYZ).applyAxisAngle(axis, -THREE.MathUtils.degToRad(slot * 5));
  const t = slot / (SLOT_COUNT - 1);
  const color = (from, to) => `#${new THREE.Color(from).lerp(new THREE.Color(to), t).getHexString()}`;
  return {
    ...base,
    presetIndex: slot,
    localMoment: `${base.localMoment.replace(/\s+\d{2}:\d{2}$/, "")} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    sunVectorXYZ: vector.toArray(),
    shadowDirectionXZ: [-vector.x, -vector.z],
    altitudeDeg: slot ? THREE.MathUtils.radToDeg(Math.asin(vector.y)) : base.altitudeDeg,
    azimuthDegFromNorth: slot ? (THREE.MathUtils.radToDeg(Math.atan2(vector.x, -vector.z)) + 360) % 360 : base.azimuthDegFromNorth,
    skyColor: color(base.skyColor, "#777f99"),
    fogColor: color(base.fogColor, "#a08c96"),
    sunColor: color("#fff1d6", "#ffad70"),
    ambientColor: color("#fff6ea", "#b9bfdc"),
    hemisphereSkyColor: color("#bfd8ee", "#8b9bc4"),
    hemisphereGroundColor: color("#8d7048", "#675564"),
    ambientIntensity: base.ambientIntensity * (1 - t * 0.42),
    hemisphereIntensity: base.hemisphereIntensity * (1 - t * 0.3),
    sunIntensity: base.sunIntensity * (1 - t * 0.72),
    shadowOpacity: 0.3 * (1 - t * 0.4),
  };
}

export async function addBakedLighting(scene, materials, layout, preset = lightingPresetForLayout(layout, 0)) {
  return loadBakedShadows(scene, preset);
}
