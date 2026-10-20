import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const statusPage = fs.readFileSync("page/status/index.js", "utf8");
const statusStyle = fs.readFileSync("page/status/index.style.js", "utf8");
const appJson = JSON.parse(fs.readFileSync("app.json", "utf8"));
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("status page leaves native scrolling unobstructed and uses physical SELECT to refresh", () => {
  assert.doesNotMatch(statusPage, /normal_color:\s*COLORS\.background/);
  assert.doesNotMatch(statusPage, /press_color:\s*COLORS\.background/);
  assert.doesNotMatch(statusPage, /widget\.BUTTON|transparent-touch/);
  assert.match(statusPage, /key === KEY_SELECT/);
  assert.match(statusPage, /setScrollView\(true, px\(454\), 4, true\)/);
});

test("status page does not run the failed shared-storage proof", () => {
  assert.doesNotMatch(statusPage, /writeRemStatusForFace/);
  assert.doesNotMatch(statusPage, /createDeviceStorageAdapter/);
  assert.match(statusPage, /SIDE \$\{lastSideState\}/);
});

test("status page requests live app-side status instead of local mock cycling", () => {
  assert.doesNotMatch(statusPage, /mockCompactStatus/);
  assert.doesNotMatch(statusPage, /nextMockState/);
  assert.doesNotMatch(statusPage, /SET_MOCK_STATE/);
  assert.match(statusPage, /REM_REQUEST_METHOD/);
  assert.match(statusPage, /REM_DIAGNOSTICS_RESPONSE/);
  assert.match(statusPage, /BRIDGE_WATCHDOG_MS/);
  assert.match(statusPage, /BRIDGE HANDSHAKE TIMEOUT/);
  assert.match(statusPage, /messageBuilder\s*\.\s*request/);
});

test("status page shows package version and icon near the title", () => {
  assert.match(statusPage, new RegExp(`APP_VERSION\\s*=\\s*"${escapeRegExp(appJson.app.version.name)}"`));
  assert.match(statusPage, /text:\s*`v\$\{APP_VERSION\}`/);
  assert.match(statusPage, /src:\s*"icon\.png"/);
});

test("status page rows align with REM watch status JSON fields", () => {
  assert.match(statusPage, /LATEST EVENT/);
  assert.match(statusStyle, /position/);
  assert.match(statusStyle, /side/);
  assert.match(statusStyle, /error/);
  assert.match(statusPage, /EAM \$\{status\.operatorEam/);
  assert.match(statusPage, /lastEvent/);
  assert.match(statusPage, /TEAM \$\{status\.team/);
  assert.match(statusPage, /EV \$\{status\.activeEvents/);
  assert.doesNotMatch(statusStyle, /WAYPOINT/);
});
