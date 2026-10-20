import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { EventBus } from "../shared/event.js";
import * as messageTypes from "../common/messageTypes.js";
import { remConfig } from "../common/remConfig.js";
import { makeErrorStatus } from "../common/remModel.js";
import { COLORS, LAYOUT } from "../page/status/index.style.js";
import { createDisplaySession } from "../common/displaySession.js";
import { fromNativePanel, toNativePanel } from "../common/radar/widgetRenderer.js";

// Execute the production lifecycle hooks with device imports supplied by the
// harness. Use the real EventBus so listener ownership matches the bridge.
function loadDeviceModule(file, globals) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(/^import\s[\s\S]*?;\r?\n/gm, "");
  vm.runInNewContext(source, globals, { filename: file });
}

class FakeBridge extends EventBus {
  constructor(options) {
    super();
    this.options = options;
    this.requests = [];
    this.connects = 0;
    this.disconnects = 0;
    this.decodes = 0;
  }

  connect() { this.connects += 1; }
  disConnect() { this.disconnects += 1; }
  buf2Json(payload) { this.decodes += 1; return payload; }

  request(data, options) {
    if (this.requestError) throw this.requestError;
    return new Promise((resolve, reject) => {
      this.requests.push({ data, options, resolve, reject });
    });
  }
}

function createPageHarness(bridge = new FakeBridge()) {
  let page;
  let nextTimer = 0;
  let input;
  let nativePanel = 1;
  const timers = new Map();
  const createdWidgets = [];
  const globalData = { messageBuilder: bridge };
  const ui = {
    widget: { TEXT: "text", BUTTON: "button" },
    prop: { MORE: "more" },
    align: {},
    text_style: { WRAP: "wrap" },
    setScrollView() {}, setLayerScrolling() {},
    scrollToPage(index) { nativePanel = index; }, getScrollCurrentPage() { return nativePanel; },
    createWidget(type, options) {
      const widget = {
        type, options, writes: [],
        setProperty(property, value) { this.writes.push({ property, ...value }); },
      };
      createdWidgets.push(widget);
      return widget;
    },
  };
  loadDeviceModule("../page/status/index.js", {
    ...messageTypes, remConfig, makeErrorStatus, COLORS, LAYOUT, ui,
    px: (value) => value, resetLayerOffset() {}, fromNativePanel, toNativePanel,
    KEY_UP: "up", KEY_DOWN: "down", KEY_SELECT: "select", KEY_EVENT_CLICK: "click",
    acquireInput(callbacks) { input = callbacks; let active = true; return () => { if (!active) return false; active = false; return true; }; },
    getApp: () => ({ _options: { globalData } }),
    Page: (options) => { page = options; },
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => assert.fail("The app must remain request-driven"),
  });
  return {
    page, bridge, globalData, timers, createdWidgets,
    click: () => input.key("select", "click"),
    captureSelect: () => { const callback = input.key; return () => callback("select", "click"); },
    writes: () => createdWidgets.reduce((count, widget) => count + widget.writes.length, 0),
    text: () => createdWidgets.flatMap((widget) => widget.writes.map((write) => write.text)).join("\n"),
    expire() {
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers][0];
      timers.delete(id);
      timer.callback();
    },
  };
}

const status = (operator) => ({ connection: "ONLINE", operator });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("page fetches on build and taps only, coalescing taps while pending", async () => {
  const h = createPageHarness();
  h.page.build();
  assert.equal(h.bridge.requests.length, 1);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 7000);
  assert.equal(h.bridge.requests[0].data.method, messageTypes.REM_REQUEST_METHOD);
  assert.equal(h.bridge.requests[0].options.timeout, Number(remConfig.timeoutMs) || 5000);
  h.click();
  h.click();
  assert.equal(h.bridge.requests.length, 1);
  h.bridge.requests[0].resolve({
    type: messageTypes.REM_MESSAGE_TYPES.response,
    data: status("ALPHA"), fetchedAt: "12:34",
    diagnostics: { type: messageTypes.REM_DIAGNOSTICS_RESPONSE, fetchAvailable: true, appVersion: "1" },
  });
  await flush();
  assert.match(h.text(), /ALPHA/);
  assert.match(h.text(), /SIDE OK v1/);
  assert.equal(h.timers.size, 0);
  assert.equal(h.bridge.requests.length, 1);
  h.click();
  assert.equal(h.bridge.requests.length, 2);
  h.page.onDestroy();
});

for (const outcome of ["resolve", "reject"]) {
  test(`destroy releases listeners and timer and ignores late ${outcome}`, async () => {
    const h = createPageHarness();
    const otherListener = () => {};
    h.bridge.on("call", otherListener);
    h.page.build();
    const queuedCall = h.bridge.map.get("call")[1];
    const queuedTimeout = [...h.timers.values()][0].callback;
    const writes = h.writes();
    h.page.onDestroy();
    h.page.onDestroy();
    assert.equal(h.timers.size, 0); // Includes timer id zero.
    assert.deepEqual(h.bridge.map.get("call"), [otherListener]);
    queuedCall({ payload: status("LATE") });
    queuedTimeout();
    h.click();
    h.bridge.requests[0][outcome](outcome === "resolve" ? status("LATE") : new Error("late"));
    await flush();
    assert.equal(h.writes(), writes);
    assert.equal(h.bridge.decodes, 0);
    assert.equal(h.bridge.requests.length, 1);
  });

  test(`timed-out request ${outcome} cannot clear a retry watchdog or change its UI`, async () => {
    const h = createPageHarness();
    h.page.build();
    const oldTimeout = [...h.timers.values()][0].callback;
    h.expire();
    assert.match(h.text(), /BRIDGE HANDSHAKE TIMEOUT/);
    assert.equal(h.bridge.requests.length, 1);
    h.click();
    const retryTimer = [...h.timers.keys()][0];
    const writes = h.writes();
    oldTimeout();
    h.bridge.requests[0][outcome](outcome === "resolve" ? status("OLD") : new Error("old"));
    await flush();
    assert.equal(h.writes(), writes);
    assert.deepEqual([...h.timers.keys()], [retryTimer]);
    h.click();
    assert.equal(h.bridge.requests.length, 2);
    h.bridge.requests[1].resolve(status("NEW"));
    await flush();
    assert.match(h.text(), /NEW/);
    assert.equal(h.timers.size, 0);
    h.page.onDestroy();
  });

  test(`rebuild ignores old ${outcome}, queued notifications, taps and watchdogs`, async () => {
    const h = createPageHarness();
    h.page.build();
    const oldCall = h.bridge.map.get("call")[0];
    const oldClick = h.captureSelect();
    const oldTimeout = [...h.timers.values()][0].callback;
    h.page.onDestroy();
    h.page.build();
    const writes = h.writes();
    oldCall({ payload: status("OLD") });
    oldClick();
    oldTimeout();
    h.bridge.requests[0][outcome](outcome === "resolve" ? status("OLD") : new Error("old"));
    await flush();
    assert.equal(h.writes(), writes);
    assert.equal(h.bridge.count("call"), 1);
    assert.equal(h.timers.size, 1);
    assert.equal(h.bridge.requests.length, 2);
    h.bridge.requests[1].resolve(status("CURRENT"));
    await flush();
    assert.match(h.text(), /CURRENT/);
    h.page.onDestroy();
  });
}

test("repeated builds replace the listener and watchdog; current notifications still render", () => {
  const h = createPageHarness();
  for (let i = 0; i < 5; i += 1) {
    h.page.build();
    assert.equal(h.bridge.count("call"), 1);
    assert.equal(h.timers.size, 1);
  }
  h.bridge.emit("call", { payload: status("NOTIFY") });
  assert.match(h.text(), /NOTIFY/);
  h.page.onDestroy();
  assert.equal(h.bridge.count("call"), 0);
  assert.equal(h.timers.size, 0);
});

test("bridge replacement invalidates callbacks even before page teardown", async () => {
  const h = createPageHarness();
  h.page.build();
  const writes = h.writes();
  h.globalData.messageBuilder = new FakeBridge();
  h.bridge.emit("call", { payload: status("OLD") });
  h.bridge.requests[0].resolve(status("OLD"));
  h.click();
  h.expire();
  await flush();
  assert.equal(h.writes(), writes);
  assert.equal(h.bridge.decodes, 0);
  assert.equal(h.bridge.requests.length, 1);
  h.page.onDestroy();
  assert.equal(h.bridge.count("call"), 0);
});

test("synchronous and asynchronous bridge errors release the watchdog and permit retry", async () => {
  const h = createPageHarness();
  h.bridge.requestError = new Error("sync failure");
  assert.doesNotThrow(() => h.page.build());
  assert.equal(h.timers.size, 0);
  assert.match(h.text(), /sync failure/);
  h.bridge.requestError = null;
  h.click();
  h.bridge.requests[0].reject(new Error("async failure"));
  await flush();
  assert.equal(h.timers.size, 0);
  assert.match(h.text(), /async failure/);
  h.click();
  assert.equal(h.bridge.requests.length, 2);
  h.page.onDestroy();
});

test("missing bridge preserves offline behavior without scheduling work", () => {
  const h = createPageHarness(null);
  h.page.build();
  h.click();
  assert.match(h.text(), /NO BRIDGE/);
  assert.equal(h.timers.size, 0);
  h.page.onDestroy();
});

test("app connects once, disconnects once, and creates a fresh bridge on recreation", () => {
  let app;
  const ble = {};
  const manifest = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  loadDeviceModule("../app.js", {
    ble, ...messageTypes, MessageBuilder: FakeBridge, createDisplaySession,
    getPackageInfo: () => ({ appId: manifest.app.appId }),
    console: { log() {} },
    App: (options) => { app = options; },
  });
  assert.equal(app.globalData.messageBuilder, null);
  app.onDestroy();
  app.onCreate();
  const first = app.globalData.messageBuilder;
  assert.equal(first.options.appId, manifest.app.appId);
  assert.equal(first.options.ble, ble);
  app.onCreate();
  assert.equal(first.connects, 1);
  app.onDestroy();
  app.onDestroy();
  assert.equal(first.disconnects, 1);
  assert.equal(app.globalData.messageBuilder, null);
  app.onCreate();
  assert.notEqual(app.globalData.messageBuilder, first);
  assert.equal(app.globalData.messageBuilder.connects, 1);
  app.onDestroy();
});

test("app routes the handshake with the runtime package ID, including remapped previews", () => {
  let app;
  const runtimeAppId = 2222222;
  loadDeviceModule("../app.js", {
    ble: {}, MessageBuilder: FakeBridge, createDisplaySession,
    getPackageInfo: () => ({ appId: runtimeAppId }),
    console: { log() {} },
    App: (options) => { app = options; },
  });
  app.onCreate();
  assert.equal(app.globalData.messageBuilder.options.appId, runtimeAppId);
  app.onDestroy();
});
