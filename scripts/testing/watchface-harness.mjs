import vm from "node:vm";
import { readFileSync } from "node:fs";
import { remConfig } from "../../common/remConfig.js";
import { isRemStatusStale, makeErrorStatus } from "../../common/remModel.js";
import { parseMecpEventTitle } from "../../common/remEventDisplay.js";
import { normalizeHeading } from "../../common/tacticalDisplay.js";

export function watchfaceHarness(options = {}) {
  const widgets = [];
  const timers = new Map();
  const requests = [];
  const writes = [];
  let now = Date.now();
  let timerId = 0;
  let face;
  let screen = "normal";
  const stats = { connects: 0, disconnects: 0, starts: 0, stops: 0, reads: 0, draws: 0, compassListeners: 0 };
  const compass = {
    calibration_status: true, direction_angle: 287,
    start() { stats.starts++; }, stop() { stats.stops++; },
    addEventListener(event, callback) { this.callback = callback; stats.compassListeners++; },
    removeEventListener() { this.callback = null; stats.compassListeners--; },
  };
  const builder = {
    connect() { stats.connects++; if (options.connectThrows) throw Error("BLE unavailable"); },
    disConnect() { stats.disconnects++; },
    request() {
      if (options.requestThrows) throw Error("send failed");
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    },
  };
  const globalTimers = {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const enumOf = (names) => Object.fromEntries(names.split(" ").map((name) => [name, name]));
  const context = {
    getGlobal: () => globalTimers,
    REM_MESSAGE_TYPES: { error: "REM_STATUS_ERROR" }, REM_REQUEST_METHOD: "GET_REM_STATUS", remConfig,
    readRemStatusCache() { stats.reads++; return { status: options.cachedStatus || null }; },
    writeRemStatusCache(status) { writes.push(status); },
    isRemStatusStale: (status, seconds) => isRemStatusStale(status, seconds, now), makeErrorStatus,
    parseMecpEventTitle, normalizeHeading,
    Date: class extends Date { static now() { return now; } },
    getApp: () => ({ _options: { globalData: { messageBuilder: builder } } }),
    hmApp: { startApp() {} },
    hmSetting: { getScreenType: () => screen, screen_type: { WATCHFACE: "normal" } },
    hmSensor: { id: options.noCompass ? {} : { COMPASS: 0 }, event: { CHANGE: "change" }, createSensor: () => compass },
    hmUI: {
      widget: enumOf("TEXT IMG BUTTON FILL_RECT TEXT_IMG IMG_TIME IMG_LEVEL WIDGET_DELEGATE"),
      align: enumOf("CENTER_H CENTER_V LEFT"), text_style: { NONE: 0 },
      data_type: enumOf(options.noEnvironment ? "HEART BATTERY" : "HEART BATTERY ALTITUDE ALTIMETER SUN_SET WIND HUMIDITY MOON"),
      show_level: { ONLY_NORMAL: 1, ONLY_AOD: 2 }, prop: enumOf("MORE ANGLE VISIBLE"),
      createWidget(type, props) {
        const widget = {
          type, props: { visible: true, ...props }, changes: [],
          setProperty(property, value) {
            this.changes.push([property, value]); stats.draws++;
            if (property === "MORE") Object.assign(this.props, value);
            else if (property === "VISIBLE") this.props.visible = value;
            else if (property === "ANGLE") this.props.angle = value;
          },
        };
        widgets.push(widget);
        return widget;
      },
    },
    WatchFace(definition) { face = definition; },
  };
  const source = readFileSync(new URL("../../watchface/trex2/legacy.js", import.meta.url), "utf8");
  vm.runInNewContext(source.replace(/^import\s[\s\S]*?;\r?\n/gm, ""), context);
  return {
    widgets, timers, requests, writes, stats, compass, builder, face,
    now: () => now,
    build: () => face.init_view(),
    tap: () => widgets.find((widget) => widget.type === "BUTTON" && widget.props.y === 7).props.click_func(),
    delegate: () => widgets.find((widget) => widget.type === "WIDGET_DELEGATE").props,
    setScreen(value) { screen = value; },
    text: () => widgets.filter((widget) => widget.type === "TEXT" && widget.props.visible).map((widget) => widget.props.text),
    async flush() { await new Promise((resolve) => setImmediate(resolve)); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
  };
}
