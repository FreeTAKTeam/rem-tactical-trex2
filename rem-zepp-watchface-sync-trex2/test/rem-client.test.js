import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRemHeaders,
  buildRemStatusUrl,
  fetchRemWatchStatus,
} from "../common/remClient.js";

test("buildRemStatusUrl appends northbound status endpoint", () => {
  assert.equal(
    buildRemStatusUrl("https://rem.example.local/api/"),
    "https://rem.example.local/api/northbound/watch/status",
  );
});

test("buildRemHeaders includes optional bearer token", () => {
  assert.deepEqual(buildRemHeaders({ apiToken: "" }), {
    Accept: "application/json",
  });
  assert.deepEqual(buildRemHeaders({ apiToken: "abc" }), {
    Accept: "application/json",
    Authorization: "Bearer abc",
  });
});

test("fetchRemWatchStatus compacts a successful response", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        type: "rem.watch.status",
        operator_name: "OP ALPHA-1",
        team: "ALPHA",
        connection_state: "CONNECTED",
        operator_status: "ACTIVE",
        last_sync_epoch_ms: 1760000000000,
        last_sync_age_seconds: 30,
        active_events: 0,
        highest_priority: "NORMAL",
        alert_state: "NORMAL",
      }),
    };
  };

  const result = await fetchRemWatchStatus(
    {
      baseUrl: "https://rem.example.local/api",
      apiToken: "abc",
      timeoutMs: 5000,
    },
    fetchImpl,
  );

  assert.equal(calls[0].url, "https://rem.example.local/api/northbound/watch/status");
  assert.equal(calls[0].options.headers.Authorization, "Bearer abc");
  assert.equal(result.connection, "CONNECTED");
  assert.equal(result.activeEvents, 0);
});
