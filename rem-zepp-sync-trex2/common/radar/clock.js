// API 2.1 does not document a monotonic clock. Use one only when the runtime
// exposes performance.now; a wall-clock fallback never earns a live/age claim.
export function createReceiptClock(wall = Date.now, monotonic = typeof performance !== "undefined" && typeof performance.now === "function"
  ? () => performance.now() : null) {
  let last = monotonic ? monotonic() : wall();
  let elapsed = 0;
  let reliable = Boolean(monotonic);
  return {
    get reliable() { return reliable; },
    now() {
      const value = monotonic ? monotonic() : wall();
      const delta = value - last;
      last = value;
      if (!Number.isFinite(delta) || delta < 0) reliable = false;
      else elapsed += delta;
      return elapsed;
    },
  };
}
