import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import { createState, reduce, ages, sourceStatus } from "../common/radar/state.js";
import { activate } from "../common/radar/navigation.js";
import { fixtureState } from "../common/radar/fixtures.js";
import { radarScene, actionAt } from "../common/radar/view.js";
import { project } from "../common/radar/geometry.js";

function harness() {
  let page;
  let key;
  let gesture;
  let offKeys = 0;
  let offGestures = 0;
  let draws = 0;
  let destroys = 0;
  let id = 0;
  let tap;
  let emit;
  let controllerClock;
  let sourceTime = 0;
  let nativePanel = null;
  const timers = new Map();
  const routes = [];
  const source = fs.readFileSync(new URL("../page/radar/index.js", import.meta.url), "utf8").replace(/^import\s[\s\S]*?;\r?\n/gm, "");
  vm.runInNewContext(source, {
    ui: {}, px: (n) => n, createState, reduce, fixtureState, radarScene, actionAt, sourceStatus, activate, resetLayerOffset() {},
    createRadarController: (options) => { emit = options.emit; controllerClock = options.clock; return { start() {}, stop() {} }; },
    createReceiptClock: () => { const start = sourceTime; return { now: () => sourceTime - start, reliable: true }; },
    createWristCompass: () => ({ start() {}, stop() {} }),
    getApp: () => ({ _options: { globalData: { messageBuilder: null } } }),
    push: (route) => routes.push(route),
    createWidgetRenderer(ui, px, onTap) { tap = onTap; return { render() { draws++; }, destroy() { destroys++; }, clear() { destroys++; }, panel() { return nativePanel === null ? page.state.panel : nativePanel; } }; },
    acquireInput(callbacks) { key = callbacks.key; gesture = callbacks.gesture; let owned = true; return () => { if (!owned) return false; owned = false; offKeys++; offGestures++; return true; }; },
    KEY_BACK: "back", KEY_UP: "up", KEY_DOWN: "down", KEY_SELECT: "select", KEY_EVENT_CLICK: "click", GESTURE_RIGHT: "right", GESTURE_UP: "swipe-up", GESTURE_DOWN: "swipe-down",
    setTimeout(callback) { const token = id++; timers.set(token, callback); return token; },
    clearTimeout(token) { timers.delete(token); }, Page(value) { page = value; },
  });
  page.onInit(); page.build();
  return { page, timers, routes, setTime: (time) => { sourceTime = time; }, setNativePanel: (panel) => { nativePanel = panel; }, controllerNow: () => controllerClock.now(), emit: (action) => emit(action), tap: (x, y) => tap(x, y), key: (...args) => key(...args), gesture: (value) => gesture(value), stats: () => ({ offKeys, offGestures, draws, destroys }) };
}

test("app launch contains no fabricated contacts, heading, polling or timers; Status opens the existing page", () => {
  const h = harness();
  assert.equal(h.page.state.snapshot, null);
  assert.equal(h.page.state.heading, null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.key("back", "click"), false);
  assert.equal(h.gesture("right"), false);
  h.key("select", "click"); h.key("select", "click");
  h.key("down", "click"); h.key("select", "click");
  assert.equal(h.routes[0].url, "page/status/index");
});

test("explicit demo, marker details, Back and demo reset work through production page handlers", () => {
  const h = harness();
  h.key("select", "click"); h.key("select", "click");
  h.key("down", "click"); h.key("down", "click"); h.key("select", "click");
  assert.equal(h.page.state.demo, true);
  assert.equal(h.timers.size, 1);
  const point = project(90, 280, 45);
  h.tap(point.x, point.y);
  assert.equal(h.page.state.view, "details");
  assert.equal(h.key("back", "click"), true);
  assert.equal(h.page.state.view, "radar");
  assert.equal(h.gesture("right"), true);
  assert.equal(h.page.state.selectedId, null);
  assert.equal(h.gesture("right"), true);
  assert.equal(h.page.state.snapshot, null);
  assert.equal(h.timers.size, 0);
});

test("destroy removes timer zero and input handlers; queued taps and callbacks cannot redraw", () => {
  const h = harness();
  h.page.dispatch({ type: "DEMO" });
  const tick = h.timers.get(0);
  h.page.onDestroy();
  const stats = h.stats();
  tick(); h.tap(227, 315);
  assert.equal(h.timers.size, 0);
  assert.equal(h.stats().draws, stats.draws);
  assert.equal(h.stats().offKeys, 1);
  assert.equal(h.stats().offGestures, 1);
  assert.equal(h.stats().destroys, 1);
  assert.equal(h.page.state.snapshot, null);
});

test("connecting from demo resets its heading and clock; a queued demo tick cannot overwrite the live timer", () => {
  const h = harness();
  h.page.dispatch({ type: "DEMO" });
  const oldTick = h.timers.get(0);
  h.setTime(30000);
  assert.equal(h.page.state.orientation, 45);
  h.page.dispatch({ type: "CONNECT" });
  assert.equal(h.page.state.demo, false);
  assert.equal(h.page.state.heading, null);
  assert.equal(h.page.state.orientation, 0);
  h.emit({ type: "SNAPSHOT", snapshot: fixtureState("radar", 0).snapshot, now: h.controllerNow(), wall: Date.now(), clockReliable: true });
  assert.equal(h.page.state.demo, false);
  assert.equal(h.timers.size, 1);
  oldTick();
  assert.equal(h.timers.size, 1);
  h.setTime(35000);
  const [liveId, tick] = h.timers.entries().next().value;
  h.timers.delete(liveId); tick();
  assert.equal(ages(h.page.state, h.page.clock).link, 5000);
  h.page.onDestroy();
  assert.equal(h.timers.size, 0);
});

test("touch-scroll then physical SELECT uses the visible panel and releases handlers before status", () => {
  const h = harness();
  h.key("select", "click");
  h.setNativePanel(3);
  h.key("down", "click");
  assert.equal(h.page.state.panel, 3);
  assert.equal(h.page.state.focus, 1);
  h.key("select", "click");
  assert.equal(h.routes[0].url, "page/status/index");
  assert.equal(h.stats().offKeys, 1);
  h.page.onDestroy();
  assert.equal(h.stats().offKeys, 1, "late teardown cannot release the next page's keys");
});

test("unchanged radar ticks and unverified headings skip rendering but the stale boundary redraws", () => {
  const h = harness(); const wall = Date.now();
  h.emit({ type: "SNAPSHOT", snapshot: fixtureState("radar", 0, wall).snapshot, now: 0, wall, clockReliable: true });
  h.page.dispatch({ type: "HEADING", value: 10, status: "valid", reference: "unverified" });
  const initial = h.stats().draws;
  for (let i = 1; i <= 10; i++) {
    h.page.dispatch({ type: "HEADING", value: i * 10, status: "valid", reference: "unverified" });
    h.setTime(i * 1000);
    const [id, tick] = h.timers.entries().next().value;
    h.timers.delete(id); tick();
  }
  assert.equal(h.stats().draws, initial);
  h.setTime(20000);
  const [id, tick] = h.timers.entries().next().value;
  h.timers.delete(id); tick();
  assert.equal(h.stats().draws, initial + 1);
  assert.equal(h.page.scene.status, "POSITION STALE");
  h.page.onDestroy();
});
