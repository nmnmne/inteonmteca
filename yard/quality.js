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
      medianMs: sorted.length ? sum / sorted.length : 0,
      p95Ms: percentile(sorted, 95),
      longIntervalsOver50: longTasks,
    };
  };

  return { tick, snapshot };
}

export function pixelRatioCap() {
  const mobile = window.matchMedia("(max-width: 800px)").matches;
  const cap = mobile ? 1 : 1.25;
  return Math.min(window.devicePixelRatio || 1, cap);
}
