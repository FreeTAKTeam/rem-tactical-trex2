import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { COLORS, LAYOUT } from "../page/status/index.style.js";
import { fromNativePanel, toNativePanel } from "../common/radar/widgetRenderer.js";

const statusPage = fs.readFileSync("page/status/index.js", "utf8");
const statusStyle = fs.readFileSync("page/status/index.style.js", "utf8");
const appJson = JSON.parse(fs.readFileSync("app.json", "utf8"));
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("status page leaves native scrolling unobstructed and uses physical SELECT to refresh", () => {
  assert.doesNotMatch(statusPage, /normal_color:\s*COLORS\.background/);
  assert.doesNotMatch(statusPage, /press_color:\s*COLORS\.background/);
  assert.doesNotMatch(statusPage, /widget\.BUTTON|transparent-touch/);
  assert.match(statusPage, /key === KEY_SELECT/);
  assert.match(statusPage, /setScrollView\(true, px\(454\), 5, true\)/);
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

test("large-type status reaches its fifth panel with keys and releases its widgets", () => {
  const widgets = []; let page, key, nativePanel = 1, scrollPages = 0;
  const ui = {
    widget: { TEXT: "TEXT", IMG: "IMG", FILL_RECT: "FILL_RECT" },
    align: { LEFT: 0, CENTER_H: 1, CENTER_V: 2 }, text_style: { WRAP: 1, NONE: 0 }, prop: { MORE: "MORE" },
    createWidget(type, props) {
      const widget = { type, props, deleted: false, setProperty(name, value) { Object.assign(props, value); } };
      widgets.push(widget); return widget;
    },
    deleteWidget(widget) { widget.deleted = true; }, setScrollView(enabled, height, pages) { scrollPages = pages; },
    setLayerScrolling() {}, getScrollCurrentPage: () => nativePanel, scrollToPage(value) { nativePanel = value; },
  };
  const context = {
    ui, COLORS, LAYOUT, fromNativePanel, toNativePanel, px: (n) => n,
    Page(value) { page = value; }, getApp: () => ({ _options: { globalData: { messageBuilder: null } } }),
    makeErrorStatus: () => ({ connection: "OFFLINE" }), remConfig: {},
    acquireInput(handlers) { key = handlers.key; return () => true; }, resetLayerOffset() {},
    KEY_UP: "up", KEY_DOWN: "down", KEY_SELECT: "select", KEY_EVENT_CLICK: "click",
    REM_MESSAGE_TYPES: {}, REM_DIAGNOSTICS_RESPONSE: "diagnostics", REM_REQUEST_METHOD: "status", setTimeout, clearTimeout,
  };
  vm.runInNewContext(statusPage.replace(/^import\s[\s\S]*?;\r?\n/gm, ""), context);
  page.build();
  assert.equal(scrollPages, 5);
  for (let index = 0; index < 6; index++) key("down", "click");
  assert.equal(nativePanel, 5, "diagnostics remains reachable after adding the separate team panel");
  assert.ok(widgets.filter((widget) => widget.type === "TEXT").every((widget) => widget.props.text_size >= 22));
  key("up", "click"); assert.equal(nativePanel, 4);
  page.onDestroy();
  assert.ok(widgets.every((widget) => widget.deleted));
});
