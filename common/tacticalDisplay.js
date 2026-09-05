export function normalizeHeading(value) {
  if (value === null || value === undefined || value === "" || value === "INVALID") {
    return null;
  }
  const angle = Number(value);
  return Number.isFinite(angle) ? ((Math.round(angle) % 360) + 360) % 360 : null;
}
