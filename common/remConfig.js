export const MIN_POLL_INTERVAL_SECONDS = 10;

export const remConfig = {
  baseUrl: "",
  apiToken: "",
  mockMode: true,
  pollIntervalSeconds: 60,
  timeoutMs: 5000,
  staleTimeoutSeconds: 120,
  debugCoordinates: false,
};

export function normalizeRemConfig(config = {}) {
  const merged = { ...remConfig, ...config };
  const pollIntervalSeconds = Math.max(
    MIN_POLL_INTERVAL_SECONDS,
    Number(merged.pollIntervalSeconds) || remConfig.pollIntervalSeconds,
  );

  return {
    ...merged,
    baseUrl: String(merged.baseUrl || "").trim(),
    apiToken: String(merged.apiToken || "").trim(),
    pollIntervalSeconds,
    timeoutMs: Number(merged.timeoutMs) || remConfig.timeoutMs,
    staleTimeoutSeconds:
      Number(merged.staleTimeoutSeconds) || remConfig.staleTimeoutSeconds,
    mockMode: Boolean(merged.mockMode || !String(merged.baseUrl || "").trim()),
  };
}
