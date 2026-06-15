import { compactRemStatus, makeErrorStatus } from "./remModel.js";

export const MOCK_STATE_NAMES = [
  "normal",
  "stale",
  "high",
  "emergency",
  "api-error",
  "no-events",
];

const BASE_RESPONSE = {
  type: "rem.watch.status",
  operator_id: "operator-alpha",
  operator_name: "OP ALPHA-1",
  team: "ALPHA",
  team_status: "GREEN",
  connection_state: "CONNECTED",
  operator_status: "ACTIVE",
  operator_eam: "Green",
  last_sync_epoch_ms: 1760000000000,
  last_sync_age_seconds: 0,
  active_events: 0,
  highest_priority: "NORMAL",
  alert_state: "NORMAL",
  battery_hint: null,
  position: {
    lat: 34.0522,
    lon: -118.2437,
    mgrs: "11S LT 12345 67890",
  },
  waypoint: {
    id: "WP-23",
    distance_m: 1200,
    bearing_deg: 328,
  },
  latest_event: {
    severity: "SAFETY",
    category: "POSITION / MOVE",
    title: "stranded / stuck",
    source: "Zappa",
    time: "7:16 PM",
  },
};

export function mockApiResponse(stateName = "normal") {
  const response = JSON.parse(JSON.stringify(BASE_RESPONSE));

  if (stateName === "stale") {
    response.connection_state = "STALE";
    response.team_status = "YELLOW";
    response.last_sync_age_seconds = 600;
    response.active_events = 1;
    response.highest_priority = "NORMAL";
    response.latest_event = {
      severity: "ROUTINE",
      category: "RESPONSE",
      title: "acknowledged",
      source: "Zappa",
      time: "7:09 PM",
    };
  } else if (stateName === "high") {
    response.team_status = "YELLOW";
    response.highest_priority = "HIGH";
    response.active_events = 7;
    response.latest_event = {
      severity: "URGENT",
      category: "RESPONSE",
      title: "help coming",
      source: "Poco",
      time: "9:09 PM",
    };
  } else if (stateName === "emergency") {
    response.team_status = "RED";
    response.operator_status = "ALERT";
    response.operator_eam = "Red";
    response.highest_priority = "EMERGENCY";
    response.alert_state = "EMERGENCY";
    response.active_events = 5;
    response.latest_event = {
      severity: "EMERGENCY",
      category: "RESPONSE",
      title: "medical priority",
      source: "REM",
      time: "NOW",
    };
  } else if (stateName === "no-events") {
    response.team_status = "GREEN";
    response.highest_priority = "NORMAL";
    response.active_events = 0;
    response.alert_state = "NORMAL";
    response.latest_event = null;
  }

  return response;
}

export function mockCompactStatus(stateName = "normal") {
  if (stateName === "api-error") {
    return makeErrorStatus("ERROR");
  }

  return compactRemStatus(mockApiResponse(stateName));
}

export function nextMockState(currentState) {
  const index = MOCK_STATE_NAMES.indexOf(currentState);
  return MOCK_STATE_NAMES[(index + 1 + MOCK_STATE_NAMES.length) % MOCK_STATE_NAMES.length];
}
