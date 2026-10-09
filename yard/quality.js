/** Frame-interval notes for the gray yard. Not a GPU timer. */

export function createQualityMeter() {
  const samples = [];
  const limit = 240;
  let last = 0;
  let longTasks = 0;

  const tick = (now) => {
    if (last > 0) {
      const interval = now - last;
      if (document.hidden) {
        last = now;
        return;
      }
      samples.push(interval);
      if (samples.length > limit) samples.shift();
      if (interval > 50) longTasks += 1;
    }
    last = now;
  };

  const percentile = (sorted, p) => {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
  };

  const snapshot = () => {
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
      frames: sorted.length,
      meanMs: sorted.length ? sum / sorted.length : 0,
      medianMs: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      longIntervalsOver50: longTasks,
    };
  };

  return { tick, snapshot };
}

export function pixelRatioCap() {
  const mobile = window.matchMedia("(max-width: 800px), (pointer: coarse)").matches;
  const cap = mobile ? 1 : 1.25;
  return Math.min(window.devicePixelRatio || 1, cap);
}

// The courtyard is static: only pose, viewport and the async logo texture
// change its image. Keep input/minimap polling independent of GPU submissions.
export function createRenderGate() {
  let previous = "";
  return (pose, width, height, textureVersion) => {
    const key = `${pose.x},${pose.z},${pose.yaw},${pose.pitch},${width},${height},${textureVersion}`;
    if (key === previous) return false;
    previous = key;
    return true;
  };
}

// Resolution adapts to sustained active-frame pressure, never by limiting FPS.
// Idle gaps, shader startup and isolated stalls must not lower visual quality.
export function createAdaptiveQuality(cap, mobile) {
  let ratio = cap, last = 0, activeSince = 0, changedAt = 0;
  const samples = [];
  const floor = Math.min(cap, 0.7);
  const reset = () => { last = 0; activeSince = 0; samples.length = 0; };
  return {
    reset,
    resize(nextCap) { cap = nextCap; ratio = Math.min(ratio, cap); reset(); return ratio; },
    snapshot: () => ({ pixelRatio: ratio, cap, samples: samples.length }),
    sample(now, active) {
      if (!active) { reset(); return null; }
      const interval = last ? now - last : 0;
      last = now;
      if (!activeSince) activeSince = now;
      if (interval <= 0 || interval > 100) { samples.length = 0; return null; }
      if (now - activeSince < 2500 || now - changedAt < 5000) return null;
      samples.push(interval);
      if (samples.length < 90) return null;
      const sorted = samples.splice(0).sort((a,b) => a-b);
      const p80 = sorted[Math.floor(sorted.length * .8)];
      let next = ratio;
      if (p80 > (mobile ? 28 : 22)) next = Math.max(floor, ratio - .15);
      else if (p80 < 17.5 && ratio < cap) next = Math.min(cap, ratio + .15);
      next = Math.round(next * 100) / 100;
      if (next === ratio) return null;
      ratio = next;
      changedAt = now;
      return ratio;
    },
  };
}
