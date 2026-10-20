import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createDisplaySession } from "../common/displaySession.js";

test("display session prevents automatic sleep and restores timing once on exit", () => {
  const calls = [];
  const display = createDisplaySession({
    settingApi: { setBrightScreen: (seconds) => calls.push(["bright", seconds]), setBrightScreenCancel: () => calls.push(["cancel"]) },
    appApi: { setScreenKeep: (enabled) => calls.push(["return", enabled]) },
  });
  display.start(); display.start(); display.stop(); display.stop();
  assert.deepEqual(calls, [["return", true], ["bright", 2147483], ["cancel"], ["return", false]]);
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
