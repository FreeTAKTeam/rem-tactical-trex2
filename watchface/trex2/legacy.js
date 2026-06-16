import { getGlobal } from "../../shared/global";
import { REM_MESSAGE_TYPES, REM_REQUEST_METHOD } from "../../common/messageTypes";
import { remConfig } from "../../common/remConfig";
import { readRemStatusCache, writeRemStatusCache } from "../../common/remCache";
import { isRemStatusStale, makeErrorStatus } from "../../common/remModel";

const COLOR = {
  background: 0x030603,
  green: 0x76d35d,
  greenBright: 0x8be85f,
  white: 0xe5e5e5,
  textDim: 0x8fa08c,
  cyan: 0x6ff5e7,
  blue: 0x72b8ff,
  orange: 0xff9f2e,
  red: 0xff4a32,
};

const TIME_DIGITS = [
  "images/time/teko/0.png",
  "images/time/teko/1.png",
  "images/time/teko/2.png",
  "images/time/teko/3.png",
  "images/time/teko/4.png",
  "images/time/teko/5.png",
  "images/time/teko/6.png",
  "images/time/teko/7.png",
  "images/time/teko/8.png",
  "images/time/teko/9.png",
];

const VALUE_DIGITS = TIME_DIGITS;
const METRIC_DIGITS = [
  "images/metrics/operator/0.png",
  "images/metrics/operator/1.png",
  "images/metrics/operator/2.png",
  "images/metrics/operator/3.png",
  "images/metrics/operator/4.png",
  "images/metrics/operator/5.png",
  "images/metrics/operator/6.png",
  "images/metrics/operator/7.png",
  "images/metrics/operator/8.png",
  "images/metrics/operator/9.png",
];

const REM_POLL_INTERVAL_MS = Math.max(
  10,
  Number(remConfig.pollIntervalSeconds || 10),
) * 1000;
const REM_REQUEST_TIMEOUT_MS = Number(remConfig.timeoutMs || 5000);
const REM_STATUS_REQUEST = "REM_STATUS_REQUEST";

let globalNS;
let compass;
let compassArrow;
let headingText;
let connectionText;
let operatorStatusText;
let teamText;
let lastSyncText;
let eventsText;
let priorityText;
let eventCategoryText;
let eventTitleTopText;
let eventTitleBottomText;
let eventMetaText;
let eventSeverityRail;
let bridgeDebugText;
let messageBuilder;
let remRequestTimer = null;
let remBridgeActive = false;
let latestRemStatus = null;
let remRequestCount = 0;
let remRequestInFlight = false;
let remWatchdogTimer = null;
let compassListenerRegistered = false;
let faceInitialized = false;

function textWidget(x, y, w, h, text, color, size, align) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x,
    y,
    w,
    h,
    text,
    color,
    text_size: size,
    align_h: align || hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
}

function setText(widget, text, color) {
  if (!widget) {
    return;
  }

  const props = {
    text: String(text === undefined || text === null ? "" : text),
  };
  if (color !== undefined) {
    props.color = color;
  }

  widget.setProperty(hmUI.prop.MORE, props);
}

function normalizeAngle(directionAngle) {
  if (
    directionAngle === undefined ||
    directionAngle === null ||
    directionAngle === "INVALID"
  ) {
    return null;
  }

  const angle = parseInt(directionAngle);
  if (isNaN(angle)) {
    return null;
  }

  return ((angle % 360) + 360) % 360;
}

function showCompassInvalid() {
  compassArrow && compassArrow.setProperty(hmUI.prop.ANGLE, 0);
  setText(headingText, "--\u00b0");
}

function showCompassAngle(directionAngle) {
  const normalized = normalizeAngle(directionAngle);
  if (normalized === null) {
    showCompassInvalid();
    return;
  }

  compassArrow && compassArrow.setProperty(hmUI.prop.ANGLE, -normalized);
  setText(headingText, `${String(normalized).padStart(3, "0")}\u00b0`);
}

function handleCompassChange(compassRes) {
  if (compassRes.calibration_status) {
    showCompassAngle(compassRes.direction_angle);
  } else {
    showCompassInvalid();
  }
}

function startCompass() {
  const screenType = hmSetting.getScreenType();
  if (screenType !== hmSetting.screen_type.WATCHFACE) {
    return;
  }

  if (
    typeof hmSensor === "undefined" ||
    !hmSensor.id ||
    hmSensor.id.COMPASS === undefined
  ) {
    showCompassInvalid();
    return;
  }

  if (!compass) {
    compass = hmSensor.createSensor(hmSensor.id.COMPASS);
  }

  compass.start();

  if (
    compass.direction_angle &&
    compass.direction &&
    compass.direction_angle !== "INVALID"
  ) {
    showCompassAngle(compass.direction_angle);
  } else {
    showCompassInvalid();
  }

  if (!compassListenerRegistered) {
    compass.addEventListener(hmSensor.event.CHANGE, handleCompassChange);
    compassListenerRegistered = true;
  }
}

function stopCompass() {
  compass && compass.stop();
}

function remStatusColor(status) {
  const connection = status && status.connection ? String(status.connection) : "";
  const priority = status && status.priority ? String(status.priority) : "";
  const alert = status && status.alert ? String(status.alert) : "";
  if (
    connection === "ERROR" ||
    priority === "EMERGENCY" ||
    alert === "ALERT" ||
    alert === "EMERGENCY"
  ) {
    return COLOR.red;
  }

  if (connection === "STALE" || connection === "OFFLINE") {
    return COLOR.orange;
  }

  return COLOR.green;
}

function eventSeverityColor(event) {
  const severity = event && event.severity ? String(event.severity).toUpperCase() : "";
  if (severity === "EMERGENCY" || severity === "ALERT" || severity === "RED") {
    return COLOR.red;
  }

  if (severity === "URGENT" || severity === "HIGH" || severity === "YELLOW") {
    return COLOR.orange;
  }

  return COLOR.cyan;
}

function normalizeEvent(status) {
  const previous = latestRemStatus || {};
  const previousEvent = previous.lastEvent || {};
  const event = (status && status.lastEvent) || previousEvent || {};

  return {
    severity: event.severity || "SAFETY",
    category: event.category || "POSITION / MOVE",
    title: event.title || "STRANDED / STUCK",
    source: event.source || "ZAPPA",
    time: event.time || "7:16 PM",
  };
}

function compactText(value, fallback, maxLength) {
  const text = String(value || fallback || "").toUpperCase();
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength);
}

function renderLastEvent(status) {
  const event = normalizeEvent(status);
  const title = String(event.title || "").toUpperCase();
  const titleParts = title.split("/");
  const topTitle = compactText(titleParts[0], "EVENT", 10);
  const bottomTitle = titleParts.length > 1
    ? compactText(`/ ${titleParts.slice(1).join("/").trim()}`, "", 10)
    : "";
  const meta = `${compactText(event.source, "SRC", 6)} ${String(event.time || "--").toUpperCase()}`;
  const severityColor = eventSeverityColor(event);

  eventSeverityRail &&
    eventSeverityRail.setProperty(hmUI.prop.MORE, {
      color: severityColor,
    });
  setText(eventCategoryText, compactText(event.category, "EVENT", 15), COLOR.blue);
  setText(eventTitleTopText, topTitle, COLOR.white);
  setText(eventTitleBottomText, bottomTitle, COLOR.white);
  setText(eventMetaText, meta, COLOR.textDim);
}

function fallbackRemStatus(connection) {
  return makeErrorStatus(connection || "OFFLINE", latestRemStatus);
}

function statusForRender(status) {
  if (
    status &&
    status.connection === "CONNECTED" &&
    isRemStatusStale(status, remConfig.staleTimeoutSeconds)
  ) {
    return {
      ...status,
      connection: "STALE",
    };
  }

  return status;
}

function loadCachedRemStatus() {
  const result = readRemStatusCache();
  if (!result || !result.status) {
    return null;
  }

  const rendered = statusForRender(result.status);
  setBridgeDebug(
    rendered.connection === "STALE" ? "REM CACHE STALE" : "REM CACHE",
    rendered.connection === "STALE" ? COLOR.orange : COLOR.green,
  );
  renderRemStatus(rendered);
  return rendered;
}

function saveRemStatus(status) {
  if (!status || status.connection === "ERROR" || status.connection === "OFFLINE") {
    return;
  }

  writeRemStatusCache(status);
}

function renderRemStatus(status) {
  const rendered = statusForRender(status || fallbackRemStatus());
  latestRemStatus = rendered;

  const color = remStatusColor(rendered);
  const operatorState =
    rendered.operatorEam || rendered.operatorStatus || "UNKNOWN";
  const teamState = rendered.teamStatus || rendered.team || "UNKNOWN";
  const activeEvents = Number(rendered.activeEvents || 0);

  setText(connectionText, rendered.connection || "CONNECTED", color);
  setText(operatorStatusText, operatorState);
  setText(teamText, teamState);
  setText(lastSyncText, rendered.lastSyncAge || "--");
  setText(eventsText, `EV ${activeEvents}`);
  setText(priorityText, rendered.priority || rendered.alert || "NORMAL", color);
  renderLastEvent(rendered);
}

function setBridgeDebug(text, color) {
  setText(bridgeDebugText, text, color || COLOR.orange);
}

function clearRemWatchdog() {
  if (remWatchdogTimer !== null) {
    const timers = globalNS || getGlobal();
    timers.clearTimeout(remWatchdogTimer);
    remWatchdogTimer = null;
  }
}

function getMessageBuilder() {
  if (messageBuilder) {
    return messageBuilder;
  }

  try {
    messageBuilder = getApp()._options.globalData.messageBuilder;
  } catch (error) {
    messageBuilder = null;
  }

  return messageBuilder;
}

function initRemBridge() {
  const builder = getMessageBuilder();
  if (!builder || remBridgeActive) {
    return builder;
  }

  try {
    builder.connect();
    remBridgeActive = true;
    setBridgeDebug("REM CONNECT", COLOR.orange);
  } catch (error) {
    remBridgeActive = false;
    setBridgeDebug("REM FAIL", COLOR.red);
  }

  return builder;
}

function dropRemBridge() {
  const builder = getMessageBuilder();
  if (!builder || !remBridgeActive) {
    return;
  }

  try {
    builder.disConnect();
  } catch (error) {
  }
  remBridgeActive = false;
}

function requestRemStatus() {
  if (
    typeof hmSetting !== "undefined" &&
    hmSetting.getScreenType() !== hmSetting.screen_type.WATCHFACE
  ) {
    return;
  }

  const builder = initRemBridge();
  if (!builder || typeof builder.request !== "function") {
    setBridgeDebug("REM NOREQ", COLOR.red);
    renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
    return;
  }

  if (remRequestInFlight) {
    setBridgeDebug(`REM WAIT ${remRequestCount}`, COLOR.orange);
    return;
  }

  remRequestCount += 1;
  remRequestInFlight = true;
  setBridgeDebug(`REM REQ ${remRequestCount}`, COLOR.orange);

  const requestCount = remRequestCount;
  const timers = globalNS || getGlobal();
  clearRemWatchdog();
  remWatchdogTimer = timers.setTimeout(function () {
    if (!remRequestInFlight || requestCount !== remRequestCount) {
      return;
    }

    remRequestInFlight = false;
    remWatchdogTimer = null;
    setBridgeDebug("REM TIMEOUT", COLOR.red);
    renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
  }, REM_REQUEST_TIMEOUT_MS);

  builder
    .request(
      {
        type: REM_STATUS_REQUEST,
        method: REM_REQUEST_METHOD,
        params: {
          config: remConfig,
        },
      },
      { timeout: REM_REQUEST_TIMEOUT_MS },
    )
    .then(function (response) {
      if (requestCount !== remRequestCount) {
        return;
      }

      remRequestInFlight = false;
      clearRemWatchdog();
      if (response && response.type === REM_MESSAGE_TYPES.error) {
        setBridgeDebug("REM ERROR", COLOR.red);
        renderRemStatus(makeErrorStatus("ERROR", latestRemStatus));
        return;
      }

      const status =
        (response && response.data) ||
        (response && response.result) ||
        response ||
        fallbackRemStatus();
      setBridgeDebug(`REM OK EV${Number(status.activeEvents || 0)}`, COLOR.green);
      saveRemStatus(status);
      renderRemStatus(status);
    })
    .catch(function () {
      if (requestCount !== remRequestCount) {
        return;
      }

      remRequestInFlight = false;
      clearRemWatchdog();
      setBridgeDebug("REM ERROR", COLOR.red);
      renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
    });
}

function startRemUpdates() {
  if (!latestRemStatus) {
    loadCachedRemStatus();
  }
  renderRemStatus(latestRemStatus || fallbackRemStatus());
  requestRemStatus();

  if (remRequestTimer !== null) {
    return;
  }

  const timers = globalNS || getGlobal();
  remRequestTimer = timers.setInterval(function () {
    requestRemStatus();
  }, REM_POLL_INTERVAL_MS);
}

function stopRemUpdates() {
  if (remRequestTimer !== null) {
    const timers = globalNS || getGlobal();
    timers.clearInterval(remRequestTimer);
    remRequestTimer = null;
  }
  remRequestInFlight = false;
  clearRemWatchdog();
  dropRemBridge();
}

function launchCompassApp() {
  if (typeof hmApp === "undefined" || typeof hmApp.startApp !== "function") {
    return;
  }

  try {
    hmApp.startApp({
      appid: 1,
      url: "CompassScreen",
      native: true,
    });
  } catch (error) {
  }
}

function buildClock(level) {
  hmUI.createWidget(hmUI.widget.IMG_TIME, {
    hour_startX: 79,
    hour_startY: 153,
    hour_array: TIME_DIGITS,
    hour_zero: 1,
    hour_space: 0,
    hour_angle: 0,
    hour_align: hmUI.align.LEFT,
    minute_startX: 239,
    minute_startY: 153,
    minute_array: TIME_DIGITS,
    minute_zero: 1,
    minute_space: 0,
    minute_angle: 0,
    minute_follow: 0,
    minute_align: hmUI.align.LEFT,
    show_level: level,
  });

  hmUI.createWidget(hmUI.widget.IMG, {
    x: 215,
    y: 153,
    w: 24,
    h: 108,
    src: "images/time/teko/colon.png",
    show_level: level,
  });
}

function buildNormal() {
  hmUI.createWidget(hmUI.widget.IMG, {
    x: 0,
    y: 0,
    w: 454,
    h: 454,
    src: "images/tactical-bg-v3.png",
    show_level: hmUI.show_level.ONLY_NORMAL,
  });

  textWidget(147, 10, 160, 38, "REM", COLOR.green, 31);
  connectionText = textWidget(126, 43, 202, 23, "CONNECTED", COLOR.green, 15);

  textWidget(52, 75, 145, 22, "HEART RATE", COLOR.green, 15);
  hmUI.createWidget(hmUI.widget.TEXT_IMG, {
    x: 94,
    y: 103,
    font_array: METRIC_DIGITS,
    padding: false,
    h_space: 0,
    align_h: hmUI.align.CENTER_H,
    type: hmUI.data_type.HEART,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  textWidget(85, 132, 90, 18, "BPM", COLOR.textDim, 13);

  textWidget(268, 75, 130, 22, "BATTERY", COLOR.green, 15);
  hmUI.createWidget(hmUI.widget.TEXT_IMG, {
    x: 300,
    y: 103,
    font_array: METRIC_DIGITS,
    padding: false,
    h_space: 0,
    align_h: hmUI.align.CENTER_H,
    type: hmUI.data_type.BATTERY,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  textWidget(364, 107, 32, 28, "%", COLOR.white, 23);

  buildClock(hmUI.show_level.ONLY_NORMAL);
  bridgeDebugText = textWidget(117, 263, 220, 18, "REM INIT", COLOR.orange, 13);

  eventSeverityRail = hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: 48,
    y: 294,
    w: 4,
    h: 84,
    color: COLOR.cyan,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  eventCategoryText = textWidget(
    55,
    293,
    94,
    14,
    "POSITION / MOVE",
    COLOR.blue,
    9,
    hmUI.align.LEFT,
  );
  eventTitleTopText = textWidget(55, 314, 94, 18, "STRANDED", COLOR.white, 14);
  eventTitleBottomText = textWidget(55, 332, 94, 18, "/ STUCK", COLOR.white, 13);
  eventMetaText = textWidget(55, 362, 94, 14, "ZAPPA 7:16 PM", COLOR.textDim, 9);

  textWidget(167, 286, 120, 20, "HEADING", COLOR.green, 14);
  hmUI.createWidget(hmUI.widget.IMG, {
    x: 187,
    y: 330,
    w: 80,
    h: 80,
    src: "images/compass-dial.png",
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  compassArrow = hmUI.createWidget(hmUI.widget.IMG, {
    x: 0,
    y: 0,
    w: 454,
    h: 454,
    pos_x: 187,
    pos_y: 330,
    center_x: 227,
    center_y: 370,
    src: "images/compass-arrow.png",
    angle: 0,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  headingText = textWidget(164, 306, 126, 35, "--\u00b0", COLOR.white, 28);

  hmUI.createWidget(hmUI.widget.BUTTON, {
    x: 158,
    y: 280,
    w: 138,
    h: 105,
    normal_src: "images/touch-target.png",
    press_src: "images/touch-target.png",
    text: "",
    click_func: launchCompassApp,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });

  textWidget(302, 291, 112, 20, "C0rv0", COLOR.green, 14);
  operatorStatusText = textWidget(298, 314, 122, 29, "ACTIVE", COLOR.white, 23);
  textWidget(305, 347, 108, 18, "TEAM", COLOR.green, 12);
  teamText = textWidget(299, 364, 120, 27, "Yellow", COLOR.white, 21);

  textWidget(129, 412, 91, 18, "LAST SYNC", COLOR.green, 12);
  lastSyncText = textWidget(218, 410, 92, 20, "14:30 UTC", COLOR.white, 14);
  eventsText = textWidget(309, 410, 52, 20, "EV 0", COLOR.white, 14);
  priorityText = textWidget(361, 410, 68, 20, "NORMAL", COLOR.green, 13);
}

function buildAod() {
  hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: 454,
    h: 454,
    color: COLOR.background,
    show_level: hmUI.show_level.ONLY_AOD,
  });
  buildClock(hmUI.show_level.ONLY_AOD);
}

WatchFace({
  init_view() {
    globalNS = getGlobal();
    if (faceInitialized) {
      startCompass();
      startRemUpdates();
      return;
    }

    faceInitialized = true;
    buildNormal();
    buildAod();
    startCompass();
    startRemUpdates();

    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: function () {
        startCompass();
        startRemUpdates();
      },
      pause_call: function () {
        stopCompass();
        stopRemUpdates();
      },
    });
  },

  build() {
    this.init_view();
  },

  onDestroy() {
    stopCompass();
    stopRemUpdates();
    faceInitialized = false;
    compassListenerRegistered = false;
    compass = null;
  },
});
