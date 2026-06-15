import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const statusPage = fs.readFileSync("page/status/index.js", "utf8");

test("status page does not draw an opaque full-screen button over the UI", () => {
  assert.doesNotMatch(statusPage, /normal_color:\s*COLORS\.background/);
  assert.doesNotMatch(statusPage, /press_color:\s*COLORS\.background/);
  assert.match(statusPage, /normal_src:\s*"transparent-touch\.png"/);
});

test("status page does not run the failed shared-storage proof", () => {
  assert.doesNotMatch(statusPage, /writeRemStatusForFace/);
  assert.doesNotMatch(statusPage, /createDeviceStorageAdapter/);
  assert.match(statusPage, /CACHE OFF/);
});
