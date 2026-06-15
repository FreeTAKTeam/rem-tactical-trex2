import { REM_STATUS_CACHE_FILE, REM_STORAGE_KEYS } from "./storageKeys.js";

export function compactStatusToKeyValues(status) {
  return {
    [REM_STORAGE_KEYS.connection]: status.connection || "",
    [REM_STORAGE_KEYS.operator]: status.operator || "",
    [REM_STORAGE_KEYS.team]: status.team || "",
    [REM_STORAGE_KEYS.operatorState]: status.operatorStatus || "",
    [REM_STORAGE_KEYS.lastSync]: status.lastSyncAge || "",
    [REM_STORAGE_KEYS.activeEvents]: String(status.activeEvents ?? 0),
    [REM_STORAGE_KEYS.priority]: status.priority || "",
    [REM_STORAGE_KEYS.alert]: status.alert || "",
    [REM_STORAGE_KEYS.waypoint]: status.waypoint || "",
    [REM_STORAGE_KEYS.bearing]: status.bearing === null ? "" : String(status.bearing ?? ""),
  };
}

export function keyValuesToCompactStatus(values = {}) {
  return {
    connection: values[REM_STORAGE_KEYS.connection] || "",
    operator: values[REM_STORAGE_KEYS.operator] || "",
    team: values[REM_STORAGE_KEYS.team] || "",
    operatorStatus: values[REM_STORAGE_KEYS.operatorState] || "",
    lastSyncAge: values[REM_STORAGE_KEYS.lastSync] || "",
    activeEvents: Number(values[REM_STORAGE_KEYS.activeEvents] || 0),
    priority: values[REM_STORAGE_KEYS.priority] || "",
    alert: values[REM_STORAGE_KEYS.alert] || "",
    waypoint: values[REM_STORAGE_KEYS.waypoint] || "",
    bearing: values[REM_STORAGE_KEYS.bearing]
      ? Number(values[REM_STORAGE_KEYS.bearing])
      : null,
  };
}

export function writeRemStatusForFace(status, adapter) {
  if (!adapter || typeof adapter.writeTextFile !== "function") {
    return {
      ok: false,
      unsupported: true,
      reason: "No shared storage adapter is available in this runtime",
    };
  }

  try {
    const keyValues = compactStatusToKeyValues(status);
    Object.keys(keyValues).forEach((key) => {
      if (typeof adapter.setItem === "function") {
        adapter.setItem(key, keyValues[key]);
      }
    });
    adapter.writeTextFile(REM_STATUS_CACHE_FILE, JSON.stringify({ status, keyValues }));
    return { ok: true, unsupported: false };
  } catch (error) {
    return { ok: false, unsupported: false, reason: String(error) };
  }
}

export function readRemStatusForFace(adapter) {
  if (!adapter || typeof adapter.readTextFile !== "function") {
    return {
      ok: false,
      unsupported: true,
      reason: "No shared storage adapter is available in this runtime",
    };
  }

  try {
    const raw = adapter.readTextFile(REM_STATUS_CACHE_FILE);
    if (!raw) {
      return { ok: false, unsupported: false, reason: "No REM status cache exists" };
    }
    const parsed = JSON.parse(raw);
    return { ok: true, unsupported: false, status: parsed.status };
  } catch (error) {
    return { ok: false, unsupported: false, reason: String(error) };
  }
}
