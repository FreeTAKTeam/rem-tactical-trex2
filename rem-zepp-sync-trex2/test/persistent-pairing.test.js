import assert from "node:assert/strict";
import test from "node:test";
import { loadBridge } from "../../scripts/testing/message-harness.mjs";
import { createRadarPhoneClient, RADAR_ERROR } from "../common/radar/phoneClient.js";
import { createRadarController } from "../common/radar/controller.js";
import { createState, reduce } from "../common/radar/state.js";
import { fixtureSnapshot } from "../common/radar/fixtures.js";

const wall = 1792493152000;
const token = "a".repeat(64);
const saved = JSON.stringify({ enabled: true, port: 29863, token });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("an old concurrent deadline cannot reset a recovered native side port or replay sent requests", () => {
  const h = loadBridge("rem-zepp-sync-trex2/shared");
  h.ready();
  const first = h.observe(h.bridge.request({ read: 1 }, { timeout: 10 }));
  const second = h.observe(h.bridge.request({ read: 2 }, { timeout: 30 }));
  h.clock.tick();
  assert.equal(h.requests().length, 2);
  h.clock.tick(10);
  assert.equal(first.state, "rejected");
  assert.equal(h.bridge.appSidePort, 0);
  h.deliver(h.bridge.buildBin({ flag: 1, version: 1, type: 1, port1: 20, port2: 47,
    appId: 123, extra: 0, payload: Buffer.from([123]) }));
  h.clock.tick();
  const recovered = h.bridge.waitingShakePromise;
  assert.equal(h.requests().length, 2, "already-sent requests are not replayed");
  const fresh = h.observe(h.bridge.request({ read: 3 }, { timeout: 10 }));
  h.clock.tick();
  h.respond(h.requests()[2].traceId, { ok: true }); h.clock.tick();
  assert.equal(fresh.state, "fulfilled");
  h.clock.tick(20);
  assert.equal(second.state, "rejected");
  assert.equal(h.bridge.waitingShakePromise, recovered);
  assert.equal(h.bridge.appSidePort, 47);
  h.clean();
});

// Exercise the real phone client, controller and both fragmented MessageBuilders.
// Only native Bluetooth, HTTP and clocks are supplied by the harness.
for (const outage of [false, true]) test(`saved pairing recovers from source and phone-service restarts (outage=${outage})`, async () => {
  let side = loadBridge("rem-zepp-sync-trex2/shared", { side: true });
  const watch = loadBridge("rem-zepp-sync-trex2/shared");
  side.ready(); watch.ready();
  let source = "source-A", sequence = 0, offline = false, denied = false;
  let nativePort = 31, handshakes = 0;
  let nextId = 0, nextTimer = 0, channels = 0;
  let state = createState();
  const timers = new Map();
  const credentials = [];
  function phone() {
    return createRadarPhoneClient({ readConfig: () => saved, channelId: () => `phone-${channels++}`,
      fetchImpl: async (request) => {
        credentials.push(request.headers.Authorization);
        if (offline) return { status: 503, body: { protocolVersion: 1,
          requestId: request.headers["X-REM-Radar-Request"], ok: false, error: { code: "HostUnavailable" } } };
        if (denied) return { status: 403 };
        return { status: 200, body: { ...fixtureSnapshot(wall), sessionId: source,
          sequence: ++sequence, requestId: request.headers["X-REM-Radar-Request"] } };
      } });
  }
  let client = phone();
  function attachSide() { side.bridge.on("request", (ctx) => {
    const request = side.bridge.buf2Json(ctx.request.payload);
    client.request(request.requestId).then((data) => ctx.response({ data }),
      (error) => ctx.response({ data: { type: RADAR_ERROR, requestId: request.requestId, code: error.code } }));
  }); }
  attachSide();
  const controller = createRadarController({ bridge: watch.bridge,
    emit: (action) => { state = reduce(state, action); }, clock: { now: () => 0, reliable: true }, wallNow: () => wall,
    makeId: () => `restart-${nextId++}`,
    setTimer(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimer(id) { timers.delete(id); } });
  async function transfer() {
    watch.clock.tick();
    for (const packet of watch.packets.splice(0)) {
      if (packet.readUInt16LE(2) === 1) {
        handshakes++;
        watch.deliver(watch.bridge.buildBin({ flag: 1, version: 1, type: 1,
          port1: 20, port2: nativePort, appId: 123, extra: 0, payload: Buffer.from([123]) }));
      } else if (packet.readUInt16LE(2) === 4 && packet.readUInt16LE(6) === nativePort) {
        side.deliver(packet.subarray(16));
      }
    }
    side.clock.tick();
    await flush();
    side.clock.tick();
    for (const fragment of side.packets.splice(0).reverse()) watch.deliver(watch.bridge.buildData(fragment));
    watch.clock.tick();
  }
  async function nextPoll() {
    assert.equal(timers.size, 1, "reconnect continues without a user action");
    const [id, timer] = timers.entries().next().value;
    timers.delete(id); timer.fn(); await transfer();
  }
  try {
    controller.start(); await transfer();
    assert.equal(state.snapshot.sessionId, "source-A");
    if (outage) {
      offline = true; await nextPoll();
      assert.equal(state.transport, "disconnected");
      assert.equal(state.snapshot.sessionId, "source-A");
      offline = false;
    }
    source = "source-B"; sequence = 0;
    await nextPoll();
    assert.equal(state.transport, "connected");
    assert.equal(state.snapshot.sessionId, "source-B");
    assert.equal(state.snapshot.sequence, 1);
    client.stop(); side.bridge.disConnect(); side.clock.tick(); side.clean();
    client = phone();
    side = loadBridge("rem-zepp-sync-trex2/shared", { side: true });
    side.ready(); attachSide(); nativePort = 47; // Phone restart replaces the native port and Side MessageBuilder.
    source = "source-C"; sequence = 0;
    await nextPoll();
    assert.equal(timers.size, 0, "first request is waiting at the stale native port");
    watch.clock.tick(8000); await transfer();
    assert.equal(state.transport, "disconnected");
    assert.equal(watch.bridge.appSidePort, nativePort, "deadline rediscovers the new native side port");
    await nextPoll();
    assert.equal(state.transport, "connected");
    assert.equal(state.snapshot.sessionId, "source-C");
    assert.equal(watch.connects, 1, "the watch app and native connection remain open");
    assert.ok(handshakes >= 2);
    assert.ok(credentials.every((value) => value === `Bearer ${token}`));
    assert.equal(JSON.stringify(state).includes(token), false);
    source = "source-B"; // A retired public session cannot be restored by a new channel.
    await nextPoll();
    assert.equal(state.snapshot.sessionId, "source-C");
    assert.equal(state.error, "INVALID_SNAPSHOT");
    assert.equal(timers.size, 0);
    controller.start(); denied = true; await transfer();
    assert.equal(state.snapshot, null);
    assert.equal(state.error, "PERMISSION_DENIED");
    assert.equal(timers.size, 0);
  } finally {
    controller.stop(); client.stop(); side.bridge.disConnect(); watch.bridge.disConnect();
    side.clock.tick(); watch.clock.tick(); side.clean(); watch.clean();
  }
});
