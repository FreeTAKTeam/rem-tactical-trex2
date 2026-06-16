import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compactRemStatus,
  isRemStatusStale,
  makeErrorStatus,
  parseRemStatusCache,
  serializeRemStatus,
} from "../common/remModel.js";
import { parseMecpEventTitle } from "../common/remEventDisplay.js";

const apiStatus = {
  type: "rem.watch.status",
  version: 1,
  connection_state: "CONNECTED",
  operator_name: "OP ALPHA-1",
  operator_status: "ACTIVE",
  operator_eam: "Green",
  team: "ALPHA",
  team_status: "Yellow",
  last_sync_epoch_ms: 1760000000000,
  last_sync_age_seconds: 120,
  active_events: 3,
  highest_priority: "HIGH",
  alert_state: "NORMAL",
  latest_event: {
    severity: "HIGH",
    category: "RESPONSE",
    title: "help coming",
    source: "Poco",
    time: "21:09",
  },
};

test("compact status carries deterministic updatedAt for stale checks", () => {
  const status = compactRemStatus(apiStatus, 1760000010000);

  assert.equal(status.updatedAt, 1760000000000);
  assert.equal(isRemStatusStale(status, 90, 1760000089000), false);
  assert.equal(isRemStatusStale(status, 90, 1760000091000), true);
});

test("pipe cache roundtrips compact watch status with latest event fields", () => {
  const status = compactRemStatus(apiStatus);
  const serialized = serializeRemStatus(status);

  assert.equal(serialized.includes("|help coming|Poco|21:09|1760000000000"), true);
  assert.deepEqual(parseRemStatusCache(serialized), status);
});

test("error and offline states preserve cached operator team and event detail", () => {
  const cached = compactRemStatus(apiStatus);

  assert.deepEqual(makeErrorStatus("ERROR", cached).lastEvent, cached.lastEvent);
  assert.equal(makeErrorStatus("ERROR", cached).teamStatus, "Yellow");
  assert.equal(makeErrorStatus("ERROR", cached).alert, "ERROR");
  assert.equal(makeErrorStatus("OFFLINE", cached).operator, "OP ALPHA-1");
});

test("production face is wired to watchface-owned cache before bridge requests", async () => {
  const source = await readFile(
    path.join(process.cwd(), "watchface", "trex2", "legacy.js"),
    "utf8",
  );

  assert.match(source, /readRemStatusCache/);
  assert.match(source, /writeRemStatusCache/);
  assert.match(source, /isRemStatusStale/);
  assert.match(source, /REM_REQUEST_METHOD/);
});

test("MECP event title exposes rail alert level and visible code", () => {
  assert.deepEqual(parseMecpEventTitle("MECP/0/P01"), {
    alertLevel: 0,
    title: "P01",
  });
  assert.deepEqual(parseMecpEventTitle("MECP/1/P01"), {
    alertLevel: 1,
    title: "P01",
  });
  assert.deepEqual(parseMecpEventTitle("MECP/2/P01"), {
    alertLevel: 2,
    title: "P01",
  });
  assert.deepEqual(parseMecpEventTitle("MECP/3/D01"), {
    alertLevel: 3,
    title: "D01",
  });
});
