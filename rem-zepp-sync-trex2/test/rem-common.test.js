import assert from "node:assert/strict";
import test from "node:test";

import { formatDistanceMeters, formatLastSync } from "../common/formatters.js";
import { redactSensitive } from "../common/logging.js";
import { compactRemStatus, validateRemWatchStatus } from "../common/remModel.js";
import { mockCompactStatus } from "../common/mockRem.js";
import { fetchRemWatchStatus } from "../common/remClient.js";

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
    position: "34.05220, -118.24370",
    bearing: 328,
    lastEvent: null,
    updatedAt: 1760000000000,
  });
});

test("REM Sync defaults to the Android loopback watch server without mock mode", async () => {
  const { remConfig, normalizeRemConfig } = await import("../common/remConfig.js");

  assert.equal(remConfig.baseUrl, "http://localhost:29863");
  assert.equal(remConfig.mockMode, false);
  assert.equal(normalizeRemConfig().mockMode, false);
  assert.equal(normalizeRemConfig({ mockMode: true }).mockMode, true);
});

test("fetchRemWatchStatus uses Zepp side-service fetch request shape", async () => {
  const calls = [];
  const status = await fetchRemWatchStatus(
    {
      baseUrl: "http://localhost:29863",
      mockMode: false,
      timeoutMs: 5000,
    },
    async (request) => {
      calls.push(request);
      return {
        body: {
          ...apiResponse,
          operator_name: "Poco",
          team_status: "Red",
          active_events: 127,
        },
      };
    },
  );

  assert.deepEqual(calls, [
    {
      url: "http://localhost:29863/northbound/watch/status",
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  ]);
  assert.equal(status.operator, "Poco");
  assert.equal(status.activeEvents, 127);
});

test("compactRemStatus maps latest event for the watchface panel", () => {
  const compact = compactRemStatus({
    ...apiResponse,
    latest_event: {
      severity: "URGENT",
      category: "RESPONSE",
      title: "help coming",
      source: "Poco",
      time: "9:09 PM",
    },
  });

  assert.deepEqual(compact.lastEvent, {
    severity: "URGENT",
    category: "RESPONSE",
    title: "help coming",
    source: "Poco",
    time: "9:09 PM",
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
  assert.equal(mockCompactStatus("high").lastEvent.title, "help coming");
  assert.equal(mockCompactStatus("emergency").activeEvents, 5);
  assert.equal(mockCompactStatus("emergency").priority, "EMERGENCY");
  assert.equal(mockCompactStatus("no-events").lastEvent, null);
});
