import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

test("REM Sync companion app-side handles watchface status requests", async () => {
  const source = await readFile(
    path.join(projectRoot, "app-side", "index.js"),
    "utf8",
  );

  assert.match(source, /REM_STATUS_REQUEST/);
  assert.match(source, /rem\.status\.get/);
  assert.match(source, /ctx\.response/);
});

test("REM Sync companion uses the Watchdrip-style MessageBuilder on app-side", async () => {
  const source = await readFile(
    path.join(projectRoot, "app-side", "index.js"),
    "utf8",
  );

  assert.match(source, /from "\.\.\/shared\/message"/);
});
