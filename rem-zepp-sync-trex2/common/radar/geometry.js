export const RANGE_M = 500;
export const MAX_MARKERS = 50;
export const RADAR = { cx: 227, cy: 227, radius: 208, size: 454, coneWidth: 164 };

export function wrap360(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? ((value % 360) + 360) % 360 : null;
}

// Average on the unit circle: 359 and 1 degrees must not become 180.
export function smoothHeading(previous, next, weight = 0.35) {
  const angle = wrap360(next);
  if (angle === null) return previous;
  if (wrap360(previous) === null) return angle;
  const delta = ((angle - previous + 540) % 360) - 180;
  if (Math.abs(delta) < 1) return previous;
  return wrap360(previous + weight * delta);
}

export function project(bearing, distance, heading, radius = RADAR.radius) {
  if (!Number.isFinite(distance) || distance < 0 || distance > RANGE_M) return null;
  if (distance < 0.5) return { x: RADAR.cx, y: RADAR.cy };
  if (wrap360(bearing) === null || wrap360(heading) === null) return null;
  const theta = (bearing - heading) * Math.PI / 180;
  const r = radius * distance / RANGE_M;
  return { x: RADAR.cx + r * Math.sin(theta), y: RADAR.cy - r * Math.cos(theta) };
}

export function visibleMarkers(markers, heading) {
  return markers.map((marker) => ({ ...marker, point: project(marker.bearingDegTrue, marker.distanceM, heading) }))
    .filter((marker) => marker.point !== null);
}

export function hitCandidates(markers, heading, x, y) {
  return visibleMarkers(markers, heading)
    .filter(({ point }) => Math.hypot(point.x - x, point.y - y) <= 24)
    .sort((a, b) => a.distanceM - b.distanceM || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id }) => id);
}

export function formatDistance(value) {
  if (!Number.isFinite(value)) return "--";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

export function formatBearing(value) {
  const normalized = wrap360(value);
  return normalized === null ? "--" : `${String(Math.round(normalized) % 360).padStart(3, "0")}°`;
}

export function shortText(value, length = 18) {
  const chars = Array.from(String(value || "Unnamed marker").replace(/[\u0000-\u001f\u007f-\u009f]/g, " "));
  return chars.length > length ? `${chars.slice(0, length - 1).join("")}…` : chars.join("");
}
