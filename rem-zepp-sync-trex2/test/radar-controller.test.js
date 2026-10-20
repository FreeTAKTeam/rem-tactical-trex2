import assert from "node:assert/strict";
import test from "node:test";
import { createRadarController } from "../common/radar/controller.js";
import { createState, reduce, ages, sourceStatus } from "../common/radar/state.js";
import { fixtureSnapshot } from "../common/radar/fixtures.js";
import { createWristCompass } from "../common/radar/compass.js";
import { createReceiptClock } from "../common/radar/clock.js";
const wall = 1792493152000;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  let state = createState();
  let now = 0;
  let nextId = 0;
  let nextTimer = 0;
  let cancels = 0;
  const timers = new Map();
  const requests = [];
  const bridge = { request(payload, options) {
    let resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    pending.cancel = () => { cancels++; reject(new Error("Cancelled")); };
    requests.push({ payload, options, resolve, reject });
    return pending;
  } };
  const controller = createRadarController({ bridge,
    emit: (action) => { state = reduce(state, action); }, clock: { now: () => now, reliable: true }, wallNow: () => wall + now,
    makeId: () => `request-${nextId++}`, setTimer(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; }, clearTimer(id) { timers.delete(id); } });
  function reply(index, overrides = {}) {
    const id = requests[index].payload.requestId;
    requests[index].resolve({ type: "rem.radar.response", requestId: id, channelId: "phone-1",
      snapshot: { ...fixtureSnapshot(wall), requestId: id, ...overrides } });
  }
  function tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); now += timer.delay; timer.fn(); }
  return { controller, requests, timers, reply, tick, state: () => state, cancels: () => cancels };
}

test("poller has one request, accepts a complete correlated response and cancels its own retry timer", async () => {
  const h = harness(); h.controller.start();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.timeout, 8000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.state().snapshot, null);
  h.reply(0); await flush();
  assert.equal(h.state().snapshot.markers.length, 5);
  assert.equal(h.timers.size, 1);
  h.controller.stop();
  assert.equal(h.timers.size, 0);
});

test("destroy cancels only its pending bridge request and late completion cannot update state", async () => {
  const h = harness(); h.controller.start();
  h.controller.stop(); h.reply(0); await flush();
  assert.equal(h.cancels(), 1);
  assert.equal(h.state().snapshot, null);
  assert.equal(h.timers.size, 0);
});

test("transient disconnect keeps contacts while terminal denial clears contacts and stops retries", async () => {
  const h = harness(); h.controller.start(); h.reply(0); await flush();
  h.tick(); h.requests[1].reject(new Error("Disconnected")); await flush();
  assert.equal(h.state().transport, "disconnected");
  assert.equal(h.state().snapshot.markers.length, 5);
  h.tick();
  h.requests[2].resolve({ type: "rem.radar.error", requestId: h.requests[2].payload.requestId, code: "PermissionDenied" });
  await flush();
  assert.equal(h.state().snapshot, null);
  assert.equal(h.state().error, "PERMISSION_DENIED");
  assert.equal(h.timers.size, 0);
});

test("reconnect accepts a new source session and rejects a delayed retired-session payload", async () => {
  const h = harness(); h.controller.start(); h.reply(0, { sessionId: "source-A" }); await flush();
  h.controller.start(); h.reply(1, { sessionId: "source-B", sequence: 1 }); await flush();
  assert.equal(h.state().snapshot.sessionId, "source-B");
  h.tick(); h.reply(2, { sessionId: "source-A", sequence: 100 }); await flush();
  assert.equal(h.state().snapshot.sessionId, "source-B");
  assert.equal(h.state().error, "INVALID_SNAPSHOT");
  h.controller.stop();
});

test("wrong request IDs and older sequences never refresh source or reception age", async () => {
  const h = harness(); h.controller.start(); h.reply(0); await flush();
  h.tick(); h.reply(1, { sequence: 0 }); await flush();
  assert.equal(h.state().receipt, 0);
  assert.equal(h.state().snapshot.sequence, 1);
  assert.equal(h.timers.size, 0, "rejected contracts require explicit retry");
  h.controller.start(); h.requests[2].resolve({ type: "rem.radar.error", requestId: "other", code: "PermissionDenied" }); await flush();
  assert.equal(h.state().snapshot.sequence, 1);
  h.controller.stop();
});

test("legacy compass supports zero IDs, immediate calibration, capped updates and stale-listener teardown", () => {
  let callback, removed, starts = 0, stops = 0, time = 0;
  const events = [];
  const sensor = { calibration_status: true, direction_angle: 359,
    start() { starts++; }, stop() { stops++; }, addEventListener(id, fn) { assert.equal(starts, stops + 1, "legacy compass starts before subscription"); assert.equal(id, 0); callback = fn; },
    removeEventListener(id, fn) { removed = fn; } };
  const compass = createWristCompass({ sensorApi: { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => sensor }, emit: (event) => events.push(event), now: () => time });
  compass.start(); compass.start();
  assert.equal(starts, 1);
  assert.equal(events.at(-1).reference, "unverified");
  assert.equal(events.at(-1).value, 359);
  sensor.direction_angle = 2; time = 100; callback();
  assert.equal(events.length, 1);
  time = 200; callback(); assert.equal(events.at(-1).value, 2);
  sensor.calibration_status = false; callback(); assert.equal(events.at(-1).status, "calibration");
  const old = callback;
  compass.stop(); assert.equal(removed, old); assert.equal(stops, 1);
  const count = events.length; old(sensor); assert.equal(events.length, count);
  sensor.calibration_status = true; compass.start(); old(sensor);
  assert.equal(events.length, count + 1);
  compass.stop();
});

test("missing compass features degrade without starting a sensor or inventing heading", () => {
  for (const sensorApi of [null, {}, { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => ({ start() { throw new Error("must not start"); } }) }]) {
    const events = [];
    const compass = createWristCompass({ sensorApi, emit: (event) => events.push(event) });
    compass.start(); compass.stop();
    assert.equal(events.at(-1).status, "unavailable");
    assert.equal(events.at(-1).value, undefined);
  }
});

test("legacy sensors without unsubscribe reuse one App registration across page owners", () => {
  const bindings = new Map();
  let callback, creates = 0, adds = 0, starts = 0, stops = 0;
  const sensor = { calibration_status: true, direction_angle: "42", start() { starts++; }, stop() { stops++; },
    addEventListener(event, handler) { adds++; callback = handler; } };
  const sensorApi = { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor() { creates++; return sensor; } };
  for (let i = 0; i < 5; i++) {
    const events = [];
    const compass = createWristCompass({ sensorApi, bindings, emit: (event) => events.push(event) });
    compass.start();
    assert.equal(events.at(-1).value, 42);
    compass.stop();
    const count = events.length; callback({ calibration_status: true, direction_angle: 999 });
    assert.equal(events.length, count, "a stopped page receives no events");
  }
  assert.equal(creates, 1); assert.equal(adds, 1);
  assert.equal(starts, 5); assert.equal(stops, 5);
  const oldEvents = [], newEvents = [];
  let time = 0;
  const old = createWristCompass({ sensorApi, bindings, now: () => time, emit: (event) => oldEvents.push(event) });
  const current = createWristCompass({ sensorApi, bindings, now: () => time, emit: (event) => newEvents.push(event) });
  old.start(); current.start();
  old.stop();
  assert.equal(stops, 5, "late teardown cannot stop the current native sensor owner");
  sensor.direction_angle = "180"; time += 250; callback({ calibration_status: true, direction_angle: 42 });
  assert.equal(newEvents.at(-1).value, 180, "reused registration reads the current native sample");
  assert.equal(oldEvents.length, 1);
  current.stop();
  assert.equal(stops, 6);
});

test("legacy numeric strings and signal-only events use native compass readings without inventing zero", () => {
  let callback, time = 0;
  const events = [];
  const sensor = { calibration_status: true, direction_angle: "359", start() {}, stop() {},
    addEventListener(event, handler) { callback = handler; }, removeEventListener() {} };
  const compass = createWristCompass({ sensorApi: { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => sensor },
    now: () => time, emit: (event) => events.push(event) });
  compass.start(); assert.equal(events.at(-1).value, 359);
  sensor.direction_angle = "90"; time += 250; callback({ type: "change" });
  assert.equal(events.at(-1).value, 90);
  for (const value of ["INVALID", "", null, false]) {
    sensor.direction_angle = value; time += 250; callback(1);
    assert.equal(events.at(-1).status, "unavailable");
    assert.equal(events.at(-1).value, null);
  }
  compass.stop();
});

test("removable legacy sensors keep the new page's lease through late teardown", () => {
  const bindings = new Map();
  const callbacks = [];
  let creates = 0, starts = 0, stops = 0, removes = 0, time = 0;
  let nativeActive = false;
  const sensor = { calibration_status: true, direction_angle: 30,
    start() { starts++; nativeActive = true; }, stop() { stops++; nativeActive = false; },
    addEventListener(event, handler) { callbacks.push(handler); },
    removeEventListener(event, handler) { removes++; assert.equal(handler, callbacks.at(-1)); } };
  const sensorApi = { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor() { creates++; return sensor; } };
  const oldEvents = [], currentEvents = [];
  const old = createWristCompass({ sensorApi, bindings, now: () => time, emit: (event) => oldEvents.push(event) });
  const current = createWristCompass({ sensorApi, bindings, now: () => time, emit: (event) => currentEvents.push(event) });
  old.start(); current.start(); old.stop();
  assert.equal(nativeActive, true);
  assert.equal(creates, 1); assert.equal(starts, 1); assert.equal(stops, 0); assert.equal(removes, 0);
  assert.equal(callbacks.length, 1);
  sensor.direction_angle = 120; time += 250; callbacks[0]();
  assert.equal(currentEvents.at(-1).value, 120);
  assert.equal(oldEvents.length, 1);
  current.stop();
  assert.equal(nativeActive, false); assert.equal(stops, 1); assert.equal(removes, 1);
  current.start();
  const count = currentEvents.length;
  time += 250; callbacks[0]({ calibration_status: true, direction_angle: 240 });
  assert.equal(currentEvents.length, count, "a removed registration cannot forward into a new page generation");
  callbacks[1]({ calibration_status: true, direction_angle: 300 });
  assert.equal(currentEvents.at(-1).value, 300);
  current.stop();
  assert.equal(starts, 2); assert.equal(stops, 2); assert.equal(removes, 2);
});

test("a partially started legacy sensor is stopped even without an unsubscribe method", () => {
  let stops = 0;
  const events = [];
  const sensor = { start() { throw new Error("start failed"); }, stop() { stops++; }, addEventListener() {} };
  createWristCompass({ sensorApi: { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => sensor },
    emit: (event) => events.push(event) }).start();
  assert.equal(stops, 1);
  assert.equal(events.at(-1).status, "unavailable");
});

test("failed legacy subscriptions can retry and deliver subsequent native changes", () => {
  for (const removable of [false, true]) {
    let callback, adds = 0, stops = 0, time = 0;
    const events = [];
    const sensor = { calibration_status: true, direction_angle: 10, start() {}, stop() { stops++; },
      addEventListener(event, handler) { if (++adds === 1) throw new Error("subscription failed"); callback = handler; } };
    if (removable) sensor.removeEventListener = () => {};
    const compass = createWristCompass({ sensorApi: { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => sensor },
      bindings: new Map(), now: () => time, emit: (event) => events.push(event) });
    compass.start();
    assert.equal(events.at(-1).status, "unavailable"); assert.equal(stops, 1);
    compass.start();
    assert.equal(adds, 2); assert.equal(events.at(-1).value, 10);
    sensor.direction_angle = 100; time += 250; callback();
    assert.equal(events.at(-1).value, 100);
    compass.stop(); assert.equal(stops, 2);
  }
});

test("compass readings after a long gap or clock rollback reset smoothing without changing geographic reference", () => {
  let callback;
  let time = 0;
  let state = createState();
  const sensor = { calibration_status: true, direction_angle: 359, start() {}, stop() {},
    addEventListener(id, fn) { callback = fn; }, removeEventListener() {} };
  const compass = createWristCompass({ sensorApi: { id: { COMPASS: 0 }, event: { CHANGE: 0 }, createSensor: () => sensor },
    emit: (event) => { state = reduce(state, event); }, now: () => time });
  compass.start();
  time = 1000; callback();
  time = 2000; callback();
  time = 3000; sensor.direction_angle = 1; callback();
  assert.notEqual(state.heading, 1, "continuous unchanged readings do not count as a sensor gap");
  time = 6001; sensor.direction_angle = 90; callback();
  assert.equal(state.heading, 90, "a resumed reading does not interpolate from the old pose");
  time = 100; sensor.direction_angle = 180; callback();
  assert.equal(state.heading, 180);
  assert.equal(state.headingReference, "unverified");
  assert.equal(state.orientation, 0, "no true-north reference has been proved");
  compass.stop();
});

test("wall-clock fallback and backward monotonic time cannot claim reliable ages", () => {
  let wallTime = wall;
  const fallback = createReceiptClock(() => wallTime, null);
  wallTime -= 60000;
  assert.equal(fallback.now(), 0);
  assert.equal(fallback.reliable, false);
  let mono = 100;
  const trusted = createReceiptClock(() => wallTime, () => mono);
  mono += 200; assert.equal(trusted.now(), 200); assert.equal(trusted.reliable, true);
  mono -= 1; trusted.now(); assert.equal(trusted.reliable, false);
  const state = reduce(createState(), { type: "SNAPSHOT", snapshot: fixtureSnapshot(wall), now: 0, wall, clockReliable: false });
  assert.equal(ages(state, 1000).link, null);
  assert.equal(ages(state, 1000).position, null);
  assert.equal(sourceStatus(state, 1000), "WATCH CLOCK UNVERIFIED");
});
