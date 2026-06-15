export const remConfig = {
  baseUrl: "",
  apiToken: "",
  pollIntervalSeconds: 30,
  timeoutMs: 5000,
  staleTimeoutSeconds: 90,
  debugCoordinates: false,
  mockMode: true,
};

export function normalizeRemConfig(config = {}) {
  const merged = { ...remConfig, ...config };
  const pollIntervalSeconds = Number(merged.pollIntervalSeconds);
  return {
    ...merged,
    pollIntervalSeconds: Math.max(
      10,
      Number.isFinite(pollIntervalSeconds)
        ? Math.floor(pollIntervalSeconds)
        : remConfig.pollIntervalSeconds
    ),
    timeoutMs: Number.isFinite(Number(merged.timeoutMs))
      ? Number(merged.timeoutMs)
      : remConfig.timeoutMs,
    mockMode: merged.mockMode !== false || !merged.baseUrl,
  };
}
