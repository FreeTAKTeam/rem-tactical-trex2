import assert from "node:assert/strict";
import test from "node:test";

import { formatDistanceMeters, formatLastSync } from "../common/formatters.js";
import { redactSensitive } from "../common/logging.js";
import { compactRemStatus, validateRemWatchStatus } from "../common/remModel.js";
import { mockCompactStatus } from "../common/mockRem.js";

const apiResponse = {
  type: "rem.watch.status",
  operator_id: "operator-alpha",
  operator_name: "OP ALPHA-1",
  team: "ALPHA",
  connection_state: "CONNECTED",
  operator_status: "ACTIVE",
  last_sync_epoch_ms: 1760000000000,
  last_sync_age_seconds: 120,
  active_events: 3,
  highest_priority: "HIGH",
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
};

test("formatLastSync formats seconds, minutes, and hours", () => {
  assert.equal(formatLastSync(30), "30s AGO");
  assert.equal(formatLastSync(120), "2m AGO");
  assert.equal(formatLastSync(3600), "1h AGO");
});

test("formatDistanceMeters formats meters and kilometers", () => {
  assert.equal(formatDistanceMeters(1200), "1.2 km");
  assert.equal(formatDistanceMeters(250), "250 m");
});

test("compactRemStatus maps northbound response to watch status", () => {
  assert.deepEqual(compactRemStatus({ ...apiResponse, team_status: "Yellow" }), {
    connection: "CONNECTED",
    operator: "OP ALPHA-1",
    operatorStatus: "ACTIVE",
    operatorEam: "ACTIVE",
    team: "ALPHA",
    teamStatus: "Yellow",
    lastSyncAge: "2m AGO",
    activeEvents: 3,
    priority: "HIGH",
    alert: "NORMAL",
    waypoint: "WP-23 / 1.2 km / 328\u00b0",
    bearing: 328,
  });
});

test("compactRemStatus uses UNKNOWN when team EAM is omitted", () => {
  assert.equal(compactRemStatus(apiResponse).teamStatus, "UNKNOWN");
});

test("validateRemWatchStatus rejects invalid payloads", () => {
  assert.throws(
    () => validateRemWatchStatus({ ...apiResponse, active_events: undefined }),
    /active_events/
  );
});

test("redactSensitive removes bearer tokens and apiToken values", () => {
  const redacted = redactSensitive({
    headers: { Authorization: "Bearer secret-token" },
    apiToken: "secret-token",
  });
  assert.doesNotMatch(redacted, /secret-token/);
  assert.match(redacted, /\[REDACTED\]/);
});

test("mock statuses expose visibly distinct watchface values", () => {
  assert.equal(mockCompactStatus("normal").activeEvents, 0);
  assert.equal(mockCompactStatus("normal").priority, "NORMAL");
  assert.equal(mockCompactStatus("stale").connection, "STALE");
  assert.equal(mockCompactStatus("stale").activeEvents, 1);
  assert.equal(mockCompactStatus("high").activeEvents, 7);
  assert.equal(mockCompactStatus("high").priority, "HIGH");
  assert.equal(mockCompactStatus("emergency").activeEvents, 5);
  assert.equal(mockCompactStatus("emergency").priority, "EMERGENCY");
});
