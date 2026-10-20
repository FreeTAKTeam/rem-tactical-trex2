import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

for (const metadataMethod of ["packageInfo", "getPackageInfo"]) test(`mini app retains the compass runtime with legacy ${metadataMethod} metadata`, () => {
  const manifest = JSON.parse(source("../app.json"));
  assert.equal(manifest.app.appType, "app");
  assert.equal(manifest.runtime.apiVersion.target, "1.0.1");
  assert.deepEqual(manifest.targets.trex2.module.page.pages, ["page/radar/index", "page/status/index"]);
  for (const file of ["../app.js", "../page/radar/index.js", "../page/status/index.js", "../common/deviceRuntime.js"]) {
    assert.doesNotMatch(source(file), /from ["']@zos\//, `${file} must run in the legacy compass host`);
  }

  let app, bridgeOptions, keyCallback, gestureCallback, route;
  let keyRemoved = 0, gestureRemoved = 0;
  const uiApi = {};
  const bleApi = {};
  const context = {
    hmUI: uiApi, hmBle: bleApi,
    hmApp: {
      [metadataMethod]: () => ({ appId: 2222222 }),
      key: { BACK: 0, UP: 1, DOWN: 2, SELECT: 3 }, action: { CLICK: 0 }, gesture: { RIGHT: 0 },
      registerKeyEvent(callback) { keyCallback = callback; },
      unregisterKeyEvent() { keyRemoved++; },
      registerGestureEvent(callback) { gestureCallback = callback; },
      unregisterGestureEvent() { gestureRemoved++; },
      gotoPage(value) { route = value; },
    },
    MessageBuilder: class {
      constructor(options) { bridgeOptions = options; }
      connect() {} disConnect() {}
    },
    App(options) { app = options; }, getApp: () => ({ _options: app }), console: { log() {} },
  };
  vm.runInNewContext(
    source("../common/deviceRuntime.js").replace(/^export /gm, "") + "\n" +
    source("../common/displaySession.js").replace(/^export /gm, "") + "\n" +
    source("../app.js").replace(/^import\s[\s\S]*?;\r?\n/gm, "") +
    "\nthis.runtimeProbe = {ui,push,acquireInput,KEY_BACK,KEY_EVENT_CLICK,GESTURE_RIGHT};",
    context,
  );
  app.onCreate();
  assert.equal(bridgeOptions.appId, 2222222, "preview routing uses the installed package metadata");
  assert.equal(bridgeOptions.ble, bleApi);
  const r = context.runtimeProbe;
  assert.equal(r.ui, uiApi);
  const release = r.acquireInput({ key: (key, event) => key === r.KEY_BACK && event === r.KEY_EVENT_CLICK, gesture: (gesture) => gesture === r.GESTURE_RIGHT });
  assert.equal(keyCallback(0, 0), true);
  assert.equal(keyCallback(1, 0), false);
  assert.equal(gestureCallback(0), true);
  r.push({ url: "page/status/index" });
  assert.equal(route.url, "page/status/index");
  const staleKey = keyCallback;
  const releaseNext = r.acquireInput({ key: () => true, gesture: () => true });
  assert.equal(staleKey(0, 0), false);
  assert.equal(release(), false, "old page cannot unregister the next page");
  assert.equal(releaseNext(), true);
  assert.equal(keyRemoved, 1);
  assert.equal(gestureRemoved, 1);
  app.onDestroy();
});
