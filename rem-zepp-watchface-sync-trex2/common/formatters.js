export function formatLastSync(seconds) {
  if (seconds === undefined || seconds === null || seconds === "") {
    return "--";
  }

  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) {
    return "--";
  }

  if (value < 60) {
    return `${Math.round(value)}s AGO`;
  }

  if (value < 3600) {
    return `${Math.round(value / 60)}m AGO`;
  }

  return `${Math.round(value / 3600)}h AGO`;
}

export function formatDistanceMeters(meters) {
  if (meters === undefined || meters === null || meters === "") {
    return "--";
  }

  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) {
    return "--";
  }

  if (value < 1000) {
    return `${Math.round(value)} m`;
  }

  return `${(Math.round((value / 1000) * 10) / 10).toFixed(1)} km`;
}
