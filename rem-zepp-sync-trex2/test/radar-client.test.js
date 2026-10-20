import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createRadarPhoneClient, decodeRadarResponse, parsePhoneConfig, RADAR_METHOD, RADAR_CONFIG_KEY, RADAR_ERROR } from "../common/radar/phoneClient.js";
import { fixtureSnapshot } from "../common/radar/fixtures.js";
const wall = 1792493152000;
const token = "a".repeat(64);
const config = JSON.stringify({ enabled: true, port: 29863, token });
const response = (id) => ({ status: 200, body: JSON.stringify({ ...fixtureSnapshot(wall), requestId: id }) });

function harness(fetchImpl) {
  let raw = config;
  let nextTimer = 0;
  let channels = 0;
  const timers = new Map();
  const client = createRadarPhoneClient({ readConfig: () => raw, fetchImpl,
    setTimer(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimer(id) { timers.delete(id); }, channelId: () => `channel-${channels++}` });
  return { client, timers, change(value) { raw = value; } };
}

test("phone-owned settings require opt-in and a bounded port and scoped token", () => {
  assert.deepEqual(parsePhoneConfig(config), { port: 29863, token });
  for (const raw of [null, "{", "{}", JSON.stringify({ enabled: true, port: 80, token }), JSON.stringify({ enabled: true, port: 29863, token: "wrong" })]) {
    assert.throws(() => parsePhoneConfig(raw), /NotConfigured/);
  }
});

test("actual phone request shape fixes loopback route and returns no credential or raw source fields", async () => {
  let request;
  const h = harness(async (value) => { request = value; return response("r-1"); });
  const reply = await h.client.request("r-1");
  assert.equal(request.url, "http://127.0.0.1:29863/northbound/watch/radar");
  assert.equal(request.headers.Authorization, `Bearer ${token}`);
  assert.equal(request.headers["X-REM-Radar-Request"], "r-1");
  assert.equal(reply.snapshot.markers.length, 5);
  assert.equal(reply.requestId, "r-1");
  assert.equal(JSON.stringify(reply).includes(token), false);
  assert.equal(h.timers.size, 0, "native timer handle zero is released");
});

test("phone rejects mismatched IDs, invalid snapshots, oversized UTF-8 and authentication failures", async () => {
  await assert.rejects(decodeRadarResponse(response("other"), "r"), /InvalidSnapshot/);
  await assert.rejects(decodeRadarResponse({ body: "救".repeat(23000) }, "r"), /ResponseTooLarge/);
  await assert.rejects(decodeRadarResponse({ body: "{broken" }, "r"), /InvalidSnapshot/);
  for (const status of [401, 403]) await assert.rejects(decodeRadarResponse({ status }, "r"), /PermissionDenied/);
  await assert.rejects(decodeRadarResponse({ status: 429 }, "r"), /Busy/);
  await assert.rejects(decodeRadarResponse({ status: 503, body: { protocolVersion: 1, requestId: "r", ok: false, error: { code: "HostTimeout" } } }, "r"), /SourceUnavailable/);
  await assert.rejects(decodeRadarResponse({ body: { protocolVersion: 1, requestId: "r", ok: false, error: { code: "SessionExpired" } } }, "r"), /PermissionDenied/);
  await assert.rejects(decodeRadarResponse({ status: 400, body: { protocolVersion: 1, requestId: "r", ok: false, error: { code: "InvalidRequest" } } }, "r"), /InvalidRequest/);
});

test("credential changes and service stop suppress in-flight HTTP successes", async () => {
  for (const mutation of ["config", "stop"]) {
    let resolve;
    const h = harness(() => new Promise((done) => { resolve = done; }));
    const pending = h.client.request("r");
    const rejected = assert.rejects(pending, mutation === "stop" ? /PhoneStopped/ : /ConfigurationChanged/);
    if (mutation === "stop") h.client.stop(); else h.change(JSON.stringify({ enabled: false }));
    resolve(response("r"));
    await rejected;
    assert.equal(h.timers.size, 0);
  }
});

test("a timed-out fetch retains its single slot until settlement and leaks no exception details", async () => {
  let reject;
  let calls = 0;
  const h = harness(() => { calls++; return new Promise((_, fail) => { reject = fail; }); });
  const first = h.client.request("r1");
  await assert.rejects(h.client.request("r2"), /Busy/);
  const timeout = assert.rejects(first, /TransportTimeout/);
  const fn = h.timers.get(0); h.timers.delete(0); fn();
  await timeout;
  await assert.rejects(h.client.request("r3"), /Busy/);
  assert.equal(calls, 1);
  reject(new Error(`dangerous transport detail ${token}`));
  await new Promise((resolve) => setImmediate(resolve));
  const next = h.client.request("r4");
  reject(new Error(`dangerous transport detail ${token}`));
  await assert.rejects(next, /^Error: TransportUnavailable$/);
  assert.equal(h.timers.size, 0);
});

test("Side Service radar handler ignores a watch-supplied destination and token", async () => {
  let side;
  let handler;
  let fetched;
  const replies = [];
  const source = fs.readFileSync(new URL("../app-side/index.js", import.meta.url), "utf8").replace(/^import\s[\s\S]*?;\r?\n/gm, "");
  class Builder {
    listen() {} on(event, callback) { if (event === "request") handler = callback; }
    buf2Json(value) { return value; } disConnect() {}
  }
  vm.runInNewContext(source, { MessageBuilder: Builder, createRadarPhoneClient, RADAR_METHOD, RADAR_CONFIG_KEY, RADAR_ERROR,
    settings: { settingsStorage: { getItem: () => config } },
    fetch: async (value) => { fetched = value; return response("watch-1"); },
    AppSideService(value) { side = value; }, setTimeout, clearTimeout,
  });
  side.onInit();
  handler({ request: { payload: { method: RADAR_METHOD, requestId: "watch-1", params: { config: { baseUrl: "https://untrusted.example", apiToken: "watch-secret" } } } }, response: ({ data }) => replies.push(data) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetched.url, "http://127.0.0.1:29863/northbound/watch/radar");
  assert.equal(fetched.headers.Authorization, `Bearer ${token}`);
  assert.equal(replies.length, 1);
  assert.equal(JSON.stringify(replies).includes(token), false);
  side.onDestroy();
});
