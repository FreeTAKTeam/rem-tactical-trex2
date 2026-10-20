import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadBridge } from "./testing/message-harness.mjs";
import { createRadarPhoneClient, RADAR_METHOD } from "../rem-zepp-sync-trex2/common/radar/phoneClient.js";
import { createState, receiveSnapshot } from "../rem-zepp-sync-trex2/common/radar/state.js";

// Explicit input keeps cross-repository access narrow. The REM plugin's native
// test emits this controlled 50-marker source artifact, never real locations.
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the REM plugin build/outputs/radar-contract/snapshot.json artifact");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
assert.equal(source.markers.length, 50);
const requestId = source.requestId;
const side = loadBridge("rem-zepp-sync-trex2/shared", { side: true });
const watch = loadBridge("rem-zepp-sync-trex2/shared");
side.ready(); watch.ready();
let httpCalls = 0;
const client = createRadarPhoneClient({
  readConfig: () => JSON.stringify({ enabled: true, port: 29863, token: "a".repeat(64) }),
  fetchImpl: async (request) => {
    httpCalls++;
    assert.equal(request.headers["X-REM-Radar-Request"], requestId);
    return { status: 200, body: JSON.stringify(source) };
  },
});
side.bridge.on("request", (ctx) => {
  const request = side.bridge.buf2Json(ctx.request.payload);
  assert.equal(request.method, RADAR_METHOD);
  client.request(request.requestId).then((data) => ctx.response({ data }));
});
const pending = watch.bridge.request({ method: RADAR_METHOD, requestId }, { timeout: 8000 });
const result = watch.observe(pending);
watch.clock.tick();
for (const packet of watch.packets.filter((packet) => packet.readUInt16LE(2) === 4)) side.deliver(packet.subarray(16));
side.clock.tick();
await new Promise((resolve) => setImmediate(resolve));
side.clock.tick();
assert.equal(httpCalls, 1);
assert.ok(side.packets.length > 1);
const fragments = [...side.packets].reverse();
for (const fragment of fragments.slice(0, -1)) {
  watch.deliver(watch.bridge.buildData(fragment));
  watch.deliver(watch.bridge.buildData(fragment));
  watch.clock.tick();
  assert.equal(result.state, "pending", "no partial snapshot may settle the request");
}
watch.deliver(watch.bridge.buildData(fragments.at(-1)));
watch.clock.tick();
assert.equal(result.state, "fulfilled");
assert.equal(result.settlements, 1);
const state = receiveSnapshot(createState(), result.value.snapshot, 0, source.generatedAtUnixMs);
assert.equal(state.snapshot.markers.length, 50);
const sourceColors = new Map(source.markers.map((marker) => [marker.id, marker.color]));
for (const marker of state.snapshot.markers) assert.equal(marker.color, sourceColors.get(marker.id));
const colors = [...new Set(state.snapshot.markers.map((marker) => marker.color))].sort((a, b) => a - b);
assert.deepEqual(colors, [0x007aff, 0x00d43b, 0x64beff, 0xff303b, 0xffe600].sort((a, b) => a - b));
assert.equal(state.snapshot.observer.positionUpdatedAtUnixMs, source.observer.positionUpdatedAtUnixMs);
assert.equal(state.snapshot.observer.accuracyM, source.observer.accuracyM);
assert.equal(state.snapshot.observer.accuracyM, 12.5);
assert.equal(state.snapshot.markers[0].markerUpdatedAtUnixMs, source.markers[0].markerUpdatedAtUnixMs);
assert.equal(state.snapshot.truncated, true);
assert.equal(watch.bridge.sessionMgr.sessions.size, 0);
watch.clean();
client.stop(); side.bridge.disConnect(); watch.bridge.disConnect();
const evidence = {
  kind: "controlled-native-source-contract", sourceArtifact: path.resolve(sourcePath),
  markers: 50, colors: colors.map((color) => `#${color.toString(16).padStart(6, "0")}`), requestFrames: watch.requests().length,
  responseFragments: fragments.length, responseBytes: Buffer.byteLength(JSON.stringify(result.value)),
  atomicApplications: result.settlements, sourceAgesPreserved: true, sourceAccuracyPreserved: true, hardwareVerified: false,
};
await fs.mkdir(new URL("../dist/rem-radar-ui/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../dist/rem-radar-ui/source-contract-verification.json", import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
