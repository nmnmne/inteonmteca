// The walk clock is supplied by the existing armReturn callback in index.html.
export const LIGHTING_HOLD_MS = 10_000;

export function createWalkLightingTimeline(enteredAt) {
  const holdUntil = enteredAt + LIGHTING_HOLD_MS;
  let deadline = null;
  let anchorTime = holdUntil;
  let anchorProgress = 0;
  const progressAt = now => {
    if (deadline === null || deadline <= holdUntil || now <= holdUntil) return 0;
    if (now >= deadline) return 1;
    return anchorProgress + (1 - anchorProgress) * Math.max(0, now - anchorTime) / (deadline - anchorTime);
  };
  return {
    holdUntil,
    sample(now, nextDeadline) {
      // Ignore sub-millisecond rounding in seconds -> milliseconds conversion.
      if (Number.isFinite(nextDeadline) && (deadline === null || Math.abs(nextDeadline - deadline) > 2)) {
        anchorProgress = progressAt(now);
        anchorTime = deadline === null ? holdUntil : Math.max(now, holdUntil);
        deadline = nextDeadline;
      }
      return { progress: progressAt(now), deadline, holdUntil,
        durationMs: deadline === null ? 0 : Math.max(0, deadline - holdUntil) };
    },
  };
}
