import assert from "node:assert/strict";
import test from "node:test";
import { fixtureSnapshot, fixtureState } from "../common/radar/fixtures.js";
import { createState, reduce, receiveSnapshot, validateSnapshot, ages, sourceStatus } from "../common/radar/state.js";
import { createWristCompass } from "../common/radar/compass.js";
const wall = 1790000000000;
const snapshot = () => fixtureSnapshot(wall);
const loaded = () => fixtureState("radar", 0, wall);

test("first launch cannot report live data; an empty valid response is connected", () => {
  assert.equal(sourceStatus(createState(), 0), "REM NOT CONNECTED");
  assert.equal(sourceStatus(fixtureState("empty", 0, wall), 0), "REM CONNECTED");
});

test("contract accepts zero, one and fifty markers but rejects oversized or malformed snapshots atomically", () => {
  assert.ok(validateSnapshot({ ...snapshot(), markers: [] }));
  assert.ok(validateSnapshot({ ...snapshot(), markers: [snapshot().markers[0]] }));
  const fifty = fixtureState("maximum", 0, wall).snapshot;
  assert.equal(validateSnapshot(fifty).markers.length, 50);
  assert.equal(validateSnapshot({ ...fifty, markers: [...fifty.markers, { ...fifty.markers[0], id: "51" }] }), null);
  const invalids = [
    { ...snapshot(), protocolVersion: 2 },
    { ...snapshot(), generatedAtUnixMs: NaN },
    { ...snapshot(), markers: [{ ...snapshot().markers[0], distanceM: Infinity }] },
    { ...snapshot(), markers: [{ ...snapshot().markers[0], color: -1 }] },
    { ...snapshot(), markers: [{ ...snapshot().markers[0], bearingDegTrue: 360 }] },
    { ...snapshot(), markers: [snapshot().markers[0], snapshot().markers[0]] },
  ];
  for (const value of invalids) {
    const state = loaded();
    const result = receiveSnapshot(state, value, 100, wall);
    assert.equal(result.snapshot, state.snapshot);
    assert.equal(sourceStatus(result, 100), "SNAPSHOT REJECTED");
  }
});

test("no unverified notes or extra payload data survive the UI boundary", () => {
  const raw = snapshot();
  raw.markers[0].notes = "not a verified source field";
  raw.markers[0].token = "do not copy";
  const normalized = validateSnapshot(raw);
  assert.equal(normalized.markers[0].notes, undefined);
  assert.equal(normalized.markers[0].token, undefined);
});

test("source accuracy stays nullable and unavailable positions cannot carry relative contacts", () => {
  const raw = snapshot();
  assert.equal(validateSnapshot(raw).observer.accuracyM, 12.5);
  delete raw.observer.accuracyM;
  assert.equal(validateSnapshot(raw).observer.accuracyM, null);
  for (const accuracyM of [null, 0, 25.75]) {
    raw.observer.accuracyM = accuracyM;
    assert.equal(validateSnapshot(raw).observer.accuracyM, accuracyM);
  }
  for (const accuracyM of [-1, Infinity, "12"]) {
    raw.observer.accuracyM = accuracyM;
    assert.equal(validateSnapshot(raw), null);
  }
  raw.observer.accuracyM = null;
  raw.observer.positionValid = false;
  assert.equal(validateSnapshot(raw), null);
  raw.markers = [];
  assert.ok(validateSnapshot(raw));
});

test("stale observer remains stale despite fresh successful transport", () => {
  const state = fixtureState("stale", 0, wall);
  assert.equal(state.transport, "connected");
  assert.equal(sourceStatus(state, 0), "POSITION STALE");
  assert.deepEqual(ages(state, 3000), { position: 95000, source: 4000, link: 3000, marker: 5000 });
});

test("disconnect retains contacts and their exact REM colours; permission denial clears them", () => {
  const state = loaded();
  const disconnected = reduce(state, { type: "DISCONNECT" });
  assert.equal(disconnected.snapshot, state.snapshot);
  assert.equal(sourceStatus(disconnected, 32000), "REM DISCONNECTED");
  const denied = reduce(disconnected, { type: "DENIED" });
  assert.equal(denied.snapshot, null);
  assert.equal(denied.selectedId, null);
  assert.equal(sourceStatus(denied, 32000), "ACCESS DENIED");
});

test("revoking REM access preserves the independent compass even when unchanged readings are suppressed", () => {
  let state = { ...loaded(), demo: false, view: "details", candidates: ["alpha"] };
  let changed;
  let time = 100;
  let emitted = 0;
  const sensor = { calibration_status: 1, direction_angle: 123, start() {}, stop() {},
    addEventListener(event, callback) { changed = callback; }, removeEventListener() {} };
  const compass = createWristCompass({
    sensorApi: { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => sensor },
    now: () => time,
    emit(action) { emitted++; state = reduce(state, action); },
  });
  compass.start();
  assert.equal(state.heading, 123);
  state = reduce(state, { type: "DENIED" });
  time += 500;
  changed(sensor);
  assert.equal(emitted, 1, "the unchanged sensor sample is intentionally suppressed");
  assert.equal(state.heading, 123);
  assert.equal(state.headingState, "valid");
  assert.equal(state.headingReference, "unverified");
  assert.equal(state.snapshot, null);
  assert.deepEqual(state.candidates, []);
  assert.equal(state.selectedId, null);
  compass.stop();
  const demoDenied = reduce(loaded(), { type: "DENIED" });
  assert.equal(demoDenied.heading, null, "fixture heading must be cleared with demo data");
});

test("a connection alone never clears stale data; duplicate/out-of-order/session traffic cannot replace a snapshot", () => {
  const state = loaded();
  assert.equal(receiveSnapshot(state, snapshot(), 100, wall), state);
  assert.equal(receiveSnapshot(state, { ...snapshot(), sequence: 0 }, 100, wall), state);
  assert.equal(receiveSnapshot(state, { ...snapshot(), sessionId: "old" }, 100, wall), state);
  const reconnect = reduce(reduce(state, { type: "DISCONNECT" }), { type: "RECONNECT" });
  assert.equal(reconnect.snapshot, state.snapshot);
  assert.equal(sourceStatus(reconnect, 0), "REM DISCONNECTED");
  const next = receiveSnapshot(reconnect, { ...snapshot(), sessionId: "new" }, 100, wall);
  assert.equal(next.snapshot.sessionId, "new");
  assert.equal(receiveSnapshot(next, { ...snapshot(), sequence: 99 }, 110, wall), next);
});

test("selection follows stable id across reorder and becomes unavailable after deletion", () => {
  const state = { ...loaded(), view: "details" };
  const reordered = receiveSnapshot(state, { ...snapshot(), sequence: 2, markers: [...snapshot().markers].reverse() }, 1, wall);
  assert.equal(reordered.selectedId, "alpha");
  assert.equal(reordered.view, "details");
  const deleted = receiveSnapshot(reordered, { ...snapshot(), sequence: 3, markers: snapshot().markers.slice(1) }, 2, wall);
  assert.equal(deleted.selectedId, null);
  assert.equal(deleted.view, "removed");
});

test("missing source ages and a skewed phone clock never become zero-age data", () => {
  assert.equal(sourceStatus(fixtureState("unknown-age", 0, wall), 0), "POSITION AGE UNKNOWN");
  const raw = snapshot(); raw.generatedAtUnixMs = wall + 10000;
  assert.equal(sourceStatus(receiveSnapshot(createState(), raw, 0, wall), 0), "CHECK PHONE CLOCK");
  const state = loaded();
  assert.equal(ages(state, -100).link, 0);
  assert.equal(sourceStatus(state, 16000), "POSITION STALE");
});

test("heading calibration freezes orientation; accepted watch readings rotate without claiming true north", () => {
  const state = loaded();
  const invalid = reduce(state, { type: "HEADING", status: "calibration" });
  assert.equal(invalid.orientation, state.orientation);
  assert.equal(invalid.headingState, "calibration");
  const magnetic = reduce(state, { type: "HEADING", status: "valid", value: 180, reference: "magnetic", weight: 1 });
  assert.equal(magnetic.orientation, 180);
  assert.equal(magnetic.headingReference, "unverified");
});

test("crowded contact paging reaches every candidate and wraps without skipping", () => {
  let state = { ...loaded(), candidates: ["1", "2", "3", "4", "5", "6", "7"], view: "candidates" };
  const offsets = [];
  for (let i = 0; i < 4; i++) { offsets.push(state.candidateOffset); state = reduce(state, { type: "MORE" }); }
  assert.deepEqual(offsets, [0, 3, 6, 0]);
  assert.equal(reduce(createState(), { type: "MORE" }).candidateOffset, 0);
});

test("heading reference changes reset smoothing instead of mixing true and magnetic angles", () => {
  let state = loaded();
  state = reduce(state, { type: "HEADING", status: "valid", value: 180, reference: "magnetic", weight: 1 });
  assert.equal(state.orientation, 180);
  state = reduce(state, { type: "HEADING", status: "valid", value: 45, reference: "true" });
  assert.equal(state.heading, 45);
  assert.equal(state.orientation, 45);
});

test("refreshing an open candidate list reconciles stable IDs instead of leaving an empty screen", () => {
  const state = { ...loaded(), view: "candidates", candidates: ["alpha", "bravo"] };
  const next = receiveSnapshot(state, { ...snapshot(), sequence: 2, markers: snapshot().markers.slice(1) }, 1, wall);
  assert.deepEqual(next.candidates, ["bravo"]);
  assert.equal(next.view, "candidates");
  const empty = receiveSnapshot(next, { ...snapshot(), sequence: 3, markers: [] }, 2, wall);
  assert.equal(empty.view, "radar");
});
