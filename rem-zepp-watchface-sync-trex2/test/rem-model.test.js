import test from "node:test";
import assert from "node:assert/strict";

import {
  compactRemStatus,
  isRemStatusStale,
  parseRemStatusCache,
  serializeRemStatus,
} from "../common/remModel.js";
import { formatDistanceMeters, formatLastSync } from "../common/formatters.js";
import { sanitizeForLog } from "../common/logging.js";

const apiStatus = {
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

test("formatLastSync returns compact age labels", () => {
  assert.equal(formatLastSync(30), "30s AGO");
  assert.equal(formatLastSync(120), "2m AGO");
  assert.equal(formatLastSync(3600), "1h AGO");
  assert.equal(formatLastSync(null), "--");
});

test("formatDistanceMeters returns compact waypoint distance", () => {
  assert.equal(formatDistanceMeters(250), "250 m");
  assert.equal(formatDistanceMeters(1200), "1.2 km");
  assert.equal(formatDistanceMeters(undefined), "--");
});

test("compactRemStatus normalizes REM northbound response", () => {
  assert.deepEqual(compactRemStatus(apiStatus), {
    connection: "CONNECTED",
    operator: "OP ALPHA-1",
    operatorStatus: "ACTIVE",
    team: "ALPHA",
    teamStatus: "UNKNOWN",
    lastSyncAge: "2m AGO",
    activeEvents: 3,
    priority: "HIGH",
    alert: "NORMAL",
    mgrs: "11S LT 12345 67890",
    waypoint: "WP-23",
    waypointDistance: "1.2 km",
    waypointBearing: "328\u00b0",
    updatedAt: 1760000000000,
  });
});

test("compactRemStatus rejects invalid API response", () => {
  assert.throws(
    () => compactRemStatus({ ...apiStatus, type: "wrong" }),
    /unsupported type/,
  );
  assert.throws(
    () => compactRemStatus({ ...apiStatus, operator_name: "" }),
    /operator_name/,
  );
});

test("serializeRemStatus roundtrips the pipe-delimited watch cache", () => {
  const status = compactRemStatus(apiStatus);
  const serialized = serializeRemStatus(status);

  assert.equal(
    serialized,
    "CONNECTED|OP ALPHA-1|ACTIVE|ALPHA|2m AGO|3|HIGH|NORMAL|11S LT 12345 67890|WP-23|1.2 km|328\u00b0|1760000000000",
  );
  assert.deepEqual(parseRemStatusCache(serialized), status);
});

test("isRemStatusStale uses updatedAt and stale timeout seconds", () => {
  const status = compactRemStatus(apiStatus);

  assert.equal(isRemStatusStale(status, 60, 1760000020000), false);
  assert.equal(isRemStatusStale(status, 60, 1760000090000), true);
  assert.equal(isRemStatusStale(null, 60, 1760000090000), true);
});

test("sanitizeForLog hides tokens and coordinates", () => {
  const logged = sanitizeForLog({
    apiToken: "secret-token",
    position: apiStatus.position,
    message: "ok",
  });

  assert.equal(logged.apiToken, "[REDACTED]");
  assert.equal(logged.position, "[REDACTED]");
  assert.equal(logged.message, "ok");
});
