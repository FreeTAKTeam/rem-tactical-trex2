import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createDisplaySession } from "../common/displaySession.js";

function harness() {
  const calls = [], diagnostics = [], timers = new Map();
  let next = 0;
  const appApi = { setScreenKeep: (enabled) => calls.push(["return", enabled]) };
  const settingApi = { setBrightScreen: (seconds) => { calls.push(["bright", seconds]); return 0; }, setBrightScreenCancel: () => calls.push(["cancel"]) };
  const runtime = { settingApi, appApi,
    setTimer(callback, ms) { const id = next++; timers.set(id, { callback, ms }); return id; },
    clearTimer(id) { timers.delete(id); } };
  const display = createDisplaySession({ appApi, onDiagnostic: (...args) => diagnostics.push(args) });
  const tick = () => { const [id, item] = timers.entries().next().value; timers.delete(id); item.callback(); };
  return { display, runtime, calls, diagnostics, timers, tick };
}

test("display hold is requested from a page, renewed with one timer and restored on App exit", () => {
  const h = harness();
  h.display.start(); h.display.start();
  assert.equal(h.calls.filter(([kind]) => kind === "bright").length, 0, "App startup does not capture the page API");
  h.display.activatePage(h.runtime);
  assert.equal(h.timers.size, 1);
  assert.equal(h.timers.get(0).ms, 20000);
  for (let index = 0; index < 5; index++) h.tick();
  assert.equal(h.calls.filter(([kind, seconds]) => kind === "bright" && seconds === 60).length, 6);
  assert.equal(h.timers.size, 1);
  assert.deepEqual(h.diagnostics.filter(([code]) => code === "HOLD_ACCEPTED"), [["HOLD_ACCEPTED", 0]], "unchanged successful results do not spam logs");
  h.display.stop(); h.display.stop();
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.filter(([kind]) => kind === "cancel").length, 1);
  assert.deepEqual(h.calls.at(-1), ["return", false]);
});

test("replacement page owns renewal; late page cleanup and queued ticks cannot cancel or renew it", () => {
  const h = harness(); h.display.start();
  const releaseA = h.display.activatePage(h.runtime);
  const queuedA = h.timers.get(0).callback;
  const releaseB = h.display.activatePage(h.runtime);
  releaseA(); queuedA();
  assert.equal(h.timers.size, 1);
  assert.equal(h.calls.filter(([kind]) => kind === "bright").length, 2);
  const queuedB = [...h.timers.values()][0].callback;
  releaseB(); queuedB();
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.filter(([kind]) => kind === "cancel").length, 0, "a page cannot restore timing while the App remains active");
  h.display.stop();
  assert.equal(h.calls.filter(([kind]) => kind === "cancel").length, 1);
});

test("missing page API can recover on a later page; rejection, missing results and exceptions never log success", () => {
  const h = harness(); h.display.start();
  h.display.activatePage({ ...h.runtime, settingApi: null });
  assert.ok(h.diagnostics.some(([code]) => code === "HOLD_API_UNAVAILABLE"));
  for (const result of [-1, undefined, "throw", 0]) {
    const runtime = { ...h.runtime, settingApi: { ...h.runtime.settingApi, setBrightScreen() { if (result === "throw") throw new Error("native"); return result; } } };
    h.display.activatePage(runtime);
    assert.equal(h.timers.size, 1);
  }
  assert.deepEqual(h.diagnostics.filter(([code]) => code.startsWith("HOLD_")), [
    ["HOLD_API_UNAVAILABLE", null], ["HOLD_REJECTED", -1], ["HOLD_RESULT_UNVERIFIED", null], ["HOLD_FAILED", null], ["HOLD_ACCEPTED", 0],
  ]);
  h.display.stop();
});

test("App exit cancels timer zero and queued renewal even when native restoration throws", () => {
  const h = harness(); h.display.start();
  h.display.activatePage({ ...h.runtime, settingApi: { ...h.runtime.settingApi, setBrightScreenCancel() { throw new Error("native"); } } });
  const queued = h.timers.get(0).callback;
  h.display.stop(); queued();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.calls.at(-1), ["return", false]);
  assert.ok(h.diagnostics.some(([code]) => code === "HOLD_CANCEL_FAILED"));
});

test("a replacement page without native APIs cannot discard earlier restoration handles", () => {
  const h = harness(); h.display.start();
  h.display.activatePage(h.runtime);
  h.display.activatePage({ ...h.runtime, settingApi: null, appApi: null });
  h.display.activatePage({ ...h.runtime, settingApi: { setBrightScreen: () => 0 }, appApi: null });
  h.display.stop();
  assert.equal(h.calls.filter(([kind]) => kind === "cancel").length, 1);
  assert.deepEqual(h.calls.at(-1), ["return", false]);
  assert.equal(h.timers.size, 0);
});

test("a native request that mutates state before throwing still has a restoration handle", () => {
  let held = false, returnOnWake = false;
  const h = harness();
  const runtime = { ...h.runtime,
    appApi: { setScreenKeep(value) { returnOnWake = value; if (value) throw new Error("native"); } },
    settingApi: { setBrightScreen() { held = true; throw new Error("native"); }, setBrightScreenCancel() { held = false; } },
  };
  const display = createDisplaySession({ appApi: runtime.appApi });
  display.start(); display.activatePage(runtime); display.stop();
  assert.equal(held, false); assert.equal(returnOnWake, false); assert.equal(h.timers.size, 0);
});

test("page helper supplies Page globals to a session created in a different App context", () => {
  const h = harness(); h.display.start();
  const source = readFileSync(new URL("../common/displaySession.js", import.meta.url), "utf8").replace(/^export /gm, "");
  const context = { hmSetting: h.runtime.settingApi, hmApp: h.runtime.appApi,
    setTimeout: h.runtime.setTimer, clearTimeout: h.runtime.clearTimer };
  vm.runInNewContext(source + "\nthis.pageActivate = activateDisplayPage;", context);
  const release = context.pageActivate({ displaySession: h.display });
  assert.equal(h.timers.size, 1);
  assert.ok(h.diagnostics.some(([code]) => code === "HOLD_ACCEPTED"));
  release(); assert.equal(h.timers.size, 0);
  h.display.stop();
});

test("failed bridge startup and throwing teardown release the app display hold", () => {
  for (const failure of ["create", "destroy"]) {
    let app, starts = 0, stops = 0, compassReleases = 0;
    const source = readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/^import\s[\s\S]*?;\r?\n/gm, "");
    vm.runInNewContext(source, {
      createDisplaySession: () => ({ start() { starts++; }, stop() { stops++; } }),
      ble: {}, getPackageInfo: () => ({ appId: 1117630 }), console: { log() {} },
      MessageBuilder: class {
        constructor() { if (failure === "create") throw new Error("startup"); }
        connect() {} disConnect() { throw new Error("teardown"); }
      },
      App(options) { app = options; },
    });
    if (failure === "create") assert.throws(() => app.onCreate(), /startup/);
    else {
      app.onCreate();
      app.globalData.compassBindings = new Map([[0, { release() { compassReleases++; } }]]);
      assert.throws(() => app.onDestroy(), /teardown/);
      assert.equal(app.globalData.compassBindings, null);
      assert.equal(compassReleases, 1);
    }
    assert.equal(starts, 1);
    assert.equal(stops, 1);
    app.onDestroy();
    assert.equal(stops, 1);
  }
});
