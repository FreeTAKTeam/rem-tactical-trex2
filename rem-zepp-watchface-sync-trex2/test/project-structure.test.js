import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

test("app.json declares a T-Rex 2 watchface package with app-side bridge", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, "app.json"), "utf8"),
  );
  const trex2 = manifest.targets.trex2;

  assert.equal(manifest.app.appId, 306967170);
  assert.equal(manifest.app.appType, "watchface");
  assert.equal(manifest.runtime.apiVersion.target, "1.0.1");
  assert.equal(trex2.designWidth, 454);
  assert.equal(trex2.module.watchface.path, "watchface/trex2/index");
  assert.equal(trex2.module["app-side"].path, "app-side/index");
  assert.deepEqual(
    trex2.platforms.map((platform) => platform.deviceSource),
    [418, 419],
  );
});

test("watchface bridge targets the REM Sync companion app", async () => {
  const source = await readFile(
    path.join(projectRoot, "common", "messageTypes.js"),
    "utf8",
  );

  assert.match(source, /REM_SYNC_APP_ID = 306967169/);
});

test("watchface source contains REM proof diagnostics", async () => {
  const source = await readFile(
    path.join(projectRoot, "watchface", "trex2", "index.js"),
    "utf8",
  );

  assert.match(source, /REM_STATUS_REQUEST/);
  assert.match(source, /CACHE/);
  assert.match(source, /BRIDGE/);
  assert.match(source, /LOCAL CACHE/);
  assert.doesNotMatch(source, /@zos\/fs/);
});
