import { formatDistanceMeters, formatLastSync } from "./formatters.js";

const REQUIRED_STRING_FIELDS = [
  "type",
  "operator_name",
  "team",
  "connection_state",
  "operator_status",
  "highest_priority",
  "alert_state",
];

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

  if (!Number.isFinite(Number(response.last_sync_age_seconds))) {
    throw new Error("REM status response is missing last_sync_age_seconds");
  }

  if (!Number.isFinite(Number(response.active_events))) {
    throw new Error("REM status response is missing active_events");
  }

  return response;
}

export function compactRemStatus(apiResponse) {
  const status = validateRemWatchStatus(apiResponse);
  const waypoint = status.waypoint || {};
  const position = status.position || {};
  const latestEvent = status.latest_event || status.last_event || null;
  const waypointLabel =
    waypoint.id && Number.isFinite(Number(waypoint.distance_m))
      ? `${waypoint.id} / ${formatDistanceMeters(Number(waypoint.distance_m))} / ${
          Number.isFinite(Number(waypoint.bearing_deg))
            ? `${Math.round(Number(waypoint.bearing_deg))}\u00b0`
            : "--"
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
    position: compactPosition(position),
    bearing: Number.isFinite(Number(waypoint.bearing_deg))
      ? Math.round(Number(waypoint.bearing_deg))
      : null,
    lastEvent: compactLastEvent(latestEvent, status),
    updatedAt: Number(status.last_sync_epoch_ms) || Date.now(),
  };
}

function compactPosition(position) {
  const lat = Number(position.lat);
  const lon = Number(position.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return "";
  }

  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
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

export function makeErrorStatus(kind, lastStatus) {
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
    position: lastStatus?.position || "",
    bearing: lastStatus?.bearing ?? null,
    lastEvent: lastStatus?.lastEvent || null,
    updatedAt: Date.now(),
  };
}
