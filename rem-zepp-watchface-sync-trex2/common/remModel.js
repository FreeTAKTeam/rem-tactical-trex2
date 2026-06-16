import { formatDistanceMeters, formatLastSync } from "./formatters.js";

export const REM_CACHE_FIELDS = [
  "connection",
  "operator",
  "operatorStatus",
  "team",
  "lastSyncAge",
  "activeEvents",
  "priority",
  "alert",
  "mgrs",
  "waypoint",
  "waypointDistance",
  "waypointBearing",
  "updatedAt",
];

const REQUIRED_STRING_FIELDS = [
  "type",
  "operator_name",
  "team",
  "connection_state",
  "operator_status",
  "highest_priority",
  "alert_state",
];

function requireNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`REM status response is missing ${field}`);
  }
  return parsed;
}

export function validateRemWatchStatus(response) {
  if (!response || typeof response !== "object") {
    throw new Error("REM status response must be an object");
  }

  if (response.type !== "rem.watch.status") {
    throw new Error("REM status response has an unsupported type");
  }

  REQUIRED_STRING_FIELDS.forEach((field) => {
    if (typeof response[field] !== "string" || response[field].length === 0) {
      throw new Error(`REM status response is missing ${field}`);
    }
  });

  requireNumber(response.last_sync_age_seconds, "last_sync_age_seconds");
  requireNumber(response.active_events, "active_events");

  return response;
}

export function compactRemStatus(apiResponse, now = Date.now()) {
  const status = validateRemWatchStatus(apiResponse);
  const waypoint = status.waypoint || {};
  const position = status.position || {};
  const bearing = Number(waypoint.bearing_deg);

  return {
    connection: status.connection_state || "ERROR",
    operator: status.operator_name || "--",
    operatorStatus: status.operator_status || "UNKNOWN",
    team: status.team_status || status.team_eam || status.team || "UNKNOWN",
    teamStatus: status.team_status || status.team_eam || "UNKNOWN",
    lastSyncAge: formatLastSync(Number(status.last_sync_age_seconds)),
    activeEvents: Number(status.active_events) || 0,
    priority: status.highest_priority || "NORMAL",
    alert: status.alert_state || "NORMAL",
    mgrs: position.mgrs || "",
    waypoint: waypoint.id || "",
    waypointDistance: formatDistanceMeters(waypoint.distance_m),
    waypointBearing: Number.isFinite(bearing) ? `${Math.round(bearing)}\u00b0` : "--",
    updatedAt: Number(status.last_sync_epoch_ms) || now,
  };
}

function cleanCacheValue(value) {
  return String(value ?? "").replace(/\|/g, "/");
}

export function serializeRemStatus(status) {
  return REM_CACHE_FIELDS.map((field) => cleanCacheValue(status[field])).join("|");
}

export function parseRemStatusCache(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parts = value.split("|");
  if (parts.length !== REM_CACHE_FIELDS.length) {
    return null;
  }

  const parsed = REM_CACHE_FIELDS.reduce((status, field, index) => {
    status[field] = parts[index];
    return status;
  }, {});

  parsed.activeEvents = Number(parsed.activeEvents) || 0;
  parsed.updatedAt = Number(parsed.updatedAt) || 0;
  parsed.teamStatus = "UNKNOWN";
  return parsed;
}

export function isRemStatusStale(status, staleTimeoutSeconds, now = Date.now()) {
  if (!status || !Number.isFinite(Number(status.updatedAt))) {
    return true;
  }

  return now - Number(status.updatedAt) > Number(staleTimeoutSeconds) * 1000;
}

export function makeErrorStatus(kind, lastStatus, now = Date.now()) {
  return {
    connection: kind,
    operator: lastStatus?.operator || "--",
    operatorStatus: lastStatus?.operatorStatus || "UNKNOWN",
    team: lastStatus?.team || "UNKNOWN",
    teamStatus: lastStatus?.teamStatus || "UNKNOWN",
    lastSyncAge: lastStatus?.lastSyncAge || "--",
    activeEvents: lastStatus?.activeEvents || 0,
    priority: lastStatus?.priority || "NORMAL",
    alert: kind === "ERROR" ? "ERROR" : lastStatus?.alert || "NORMAL",
    mgrs: lastStatus?.mgrs || "",
    waypoint: lastStatus?.waypoint || "",
    waypointDistance: lastStatus?.waypointDistance || "--",
    waypointBearing: lastStatus?.waypointBearing || "--",
    updatedAt: now,
  };
}
