export function formatLastSync(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }

  const rounded = Math.floor(seconds);
  if (rounded < 60) {
    return `${rounded}s AGO`;
  }

  const minutes = Math.floor(rounded / 60);
  if (minutes < 60) {
    return `${minutes}m AGO`;
  }

  return `${Math.floor(minutes / 60)}h AGO`;
}

export function formatDistanceMeters(meters) {
  if (!Number.isFinite(meters) || meters < 0) {
    return "--";
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}
