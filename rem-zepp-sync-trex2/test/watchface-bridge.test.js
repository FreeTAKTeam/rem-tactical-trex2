import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

test("REM Sync companion app-side handles watchface status requests", async () => {
  const source = await readFile(
    path.join(projectRoot, "app-side", "index.js"),
    "utf8",
  );

  assert.match(source, /REM_MESSAGE_TYPES\.request/);
  assert.match(source, /REM_REQUEST_METHOD/);
  assert.match(source, /REM_DIAGNOSTICS_METHOD/);
  assert.match(source, /diagnosticsPayload/);
  assert.match(source, /ctx\.response/);
  assert.match(source, /data:\s*{\s*type:\s*REM_MESSAGE_TYPES\.response/s);
});

test("REM Sync companion uses the Watchdrip-style MessageBuilder on app-side", async () => {
  const source = await readFile(
    path.join(projectRoot, "app-side", "index.js"),
    "utf8",
  );

  assert.match(source, /from "\.\.\/shared\/message"/);
});

test("REM Sync companion declares BLE permission required by MessageBuilder bridge", () => {
  const appJson = JSON.parse(readFileSync(path.join(projectRoot, "app.json"), "utf8"));

  assert.ok(appJson.permissions.includes("device:os.ble"));
});

test("REM Sync companion injects the Zepp BLE module into MessageBuilder", async () => {
  const appSource = await readFile(path.join(projectRoot, "app.js"), "utf8");
  const messageSource = await readFile(path.join(projectRoot, "shared", "message.js"), "utf8");

  const runtimeSource = await readFile(path.join(projectRoot, "common", "deviceRuntime.js"), "utf8");
  assert.match(appSource, /from "\.\/common\/deviceRuntime\.js"/);
  assert.match(runtimeSource, /export const ble = typeof hmBle/);
  assert.match(appSource, /new MessageBuilder\(\{ appId, ble \}\)/);
  assert.match(messageSource, /this\.ble = ble \|\|/);
  assert.match(messageSource, /this\.ble\.createConnect/);
  assert.match(messageSource, /this\.ble\.send/);
  assert.doesNotMatch(messageSource, /hmBle\.send/);
});

test("REM Sync MessageBuilder tolerates simulator runtime without Logger", async () => {
  const messageSource = await readFile(path.join(projectRoot, "shared", "message.js"), "utf8");

  assert.match(messageSource, /const noopLogger/);
  assert.match(messageSource, /typeof Logger !== 'undefined'/);
  assert.match(messageSource, /return noopLogger/);
  assert.doesNotMatch(messageSource, /logger = Logger\.getLogger/);
});
