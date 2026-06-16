const SECRET_KEYS = ["apitoken", "authorization", "token"];
const COORDINATE_KEYS = ["position", "lat", "lon", "latitude", "longitude"];

export function sanitizeForLog(value, options = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, options));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value).reduce((sanitized, key) => {
    const normalized = key.toLowerCase();
    if (SECRET_KEYS.includes(normalized)) {
      sanitized[key] = "[REDACTED]";
    } else if (!options.debugCoordinates && COORDINATE_KEYS.includes(normalized)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeForLog(value[key], options);
    }
    return sanitized;
  }, {});
}

export function logRemDebug(label, value) {
  try {
    console.log(`[REM] ${label}`, JSON.stringify(sanitizeForLog(value)));
  } catch (error) {
    console.log(`[REM] ${label}`);
  }
}
