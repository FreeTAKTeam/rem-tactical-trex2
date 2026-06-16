const REQUIRED_STRING_FIELDS = [
  "type",
  "operator_name",
  "team",
  "connection_state",
  "operator_status",
  "highest_priority",
  "alert_state",
];

export const REM_CACHE_FIELDS = [
  "connection",
  "operator",
  "operatorStatus",
  "operatorEam",
  "team",
  "teamStatus",
  "lastSyncAge",
  "activeEvents",
  "priority",
  "alert",
  "waypoint",
  "bearing",
  "eventSeverity",
  "eventCategory",
  "eventTitle",
  "eventSource",
  "eventTime",
  "updatedAt",
];

function formatLastSync(seconds) {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "--";
  }
  if (parsed < 60) {
    return `${Math.floor(parsed)}s AGO`;
  }
  if (parsed < 3600) {
    return `${Math.floor(parsed / 60)}m AGO`;
  }
  return `${Math.floor(parsed / 3600)}h AGO`;
}

function formatDistanceMeters(meters) {
  const parsed = Number(meters);
  if (!Number.isFinite(parsed)) {
    return "--";
  }
  if (parsed >= 1000) {
    return `${(parsed / 1000).toFixed(1)} km`;
  }
  return `${Math.round(parsed)} m`;
}

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
  const latestEvent = status.latest_event || status.last_event || null;
  const bearing = Number(waypoint.bearing_deg);
  const waypointLabel =
    waypoint.id && Number.isFinite(Number(waypoint.distance_m))
      ? `${waypoint.id} / ${formatDistanceMeters(Number(waypoint.distance_m))} / ${
          Number.isFinite(bearing) ? `${Math.round(bearing)}\u00b0` : "--"
        }`
      : "";

  return {
    connection: status.connection_state,
    operator: status.operator_name,
    operatorStatus: status.operator_status,
    operatorEam: status.operator_eam || status.operator_status,
    team: status.team,
    teamStatus: status.team_status || status.team_eam || "UNKNOWN",
    lastSyncAge: formatLastSync(Number(status.last_sync_age_seconds)),
    activeEvents: Number(status.active_events),
    priority: status.highest_priority,
    alert: status.alert_state,
    waypoint: waypointLabel,
    bearing: Number.isFinite(bearing) ? Math.round(bearing) : null,
    lastEvent: compactLastEvent(latestEvent, status),
    updatedAt: Number(status.last_sync_epoch_ms) || now,
  };
}

function compactLastEvent(event, status) {
  if (!event || typeof event !== "object" || !event.title) {
    return null;
  }

  return {
    severity: event.severity || event.priority || status.highest_priority || "NORMAL",
    category: event.category || event.type || "",
    title: event.title,
    source: event.source || event.operator || status.operator_name || "",
    time: event.time || event.time_label || "",
  };
}

function cleanCacheValue(value) {
  return String(value ?? "").replace(/\|/g, "/");
}

function cacheValue(status, field) {
  const event = status?.lastEvent || {};
  if (field === "eventSeverity") {
    return event.severity || "";
  }
  if (field === "eventCategory") {
    return event.category || "";
  }
  if (field === "eventTitle") {
    return event.title || "";
  }
  if (field === "eventSource") {
    return event.source || "";
  }
  if (field === "eventTime") {
    return event.time || "";
  }
  return status?.[field];
}

export function serializeRemStatus(status) {
  return REM_CACHE_FIELDS.map((field) => cleanCacheValue(cacheValue(status, field))).join("|");
}

export function parseRemStatusCache(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parts = value.split("|");
  if (parts.length !== REM_CACHE_FIELDS.length) {
    return null;
  }

  const raw = REM_CACHE_FIELDS.reduce((status, field, index) => {
    status[field] = parts[index];
    return status;
  }, {});

  const parsed = {
    connection: raw.connection || "OFFLINE",
    operator: raw.operator || "--",
    operatorStatus: raw.operatorStatus || "UNKNOWN",
    operatorEam: raw.operatorEam || "UNKNOWN",
    team: raw.team || "--",
    teamStatus: raw.teamStatus || "UNKNOWN",
    lastSyncAge: raw.lastSyncAge || "--",
    activeEvents: Number(raw.activeEvents) || 0,
    priority: raw.priority || "NORMAL",
    alert: raw.alert || "NORMAL",
    waypoint: raw.waypoint || "",
    bearing: raw.bearing === "" ? null : Number(raw.bearing),
    lastEvent: raw.eventTitle
      ? {
          severity: raw.eventSeverity || "NORMAL",
          category: raw.eventCategory || "",
          title: raw.eventTitle,
          source: raw.eventSource || "",
          time: raw.eventTime || "",
        }
      : null,
    updatedAt: Number(raw.updatedAt) || 0,
  };

  if (!Number.isFinite(parsed.bearing)) {
    parsed.bearing = null;
  }

  return parsed;
}

export function isRemStatusStale(status, staleTimeoutSeconds, now = Date.now()) {
  if (!status || !Number.isFinite(Number(status.updatedAt)) || Number(status.updatedAt) <= 0) {
    return true;
  }

  return now - Number(status.updatedAt) > Number(staleTimeoutSeconds) * 1000;
}

export function makeErrorStatus(kind, lastStatus, now = Date.now()) {
  return {
    connection: kind,
    operator: lastStatus?.operator || "--",
    operatorStatus: lastStatus?.operatorStatus || "UNKNOWN",
    operatorEam: lastStatus?.operatorEam || "UNKNOWN",
    team: lastStatus?.team || "--",
    teamStatus: lastStatus?.teamStatus || "UNKNOWN",
    lastSyncAge: lastStatus?.lastSyncAge || "--",
    activeEvents: lastStatus?.activeEvents || 0,
    priority: lastStatus?.priority || "NORMAL",
    alert: kind === "ERROR" ? "ERROR" : lastStatus?.alert || "NORMAL",
    waypoint: lastStatus?.waypoint || "",
    bearing: lastStatus?.bearing ?? null,
    lastEvent: lastStatus?.lastEvent || null,
    updatedAt: now,
  };
}
