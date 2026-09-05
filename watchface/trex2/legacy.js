import { getGlobal } from "../../shared/global";
import { REM_MESSAGE_TYPES, REM_REQUEST_METHOD } from "../../common/messageTypes";
import { remConfig } from "../../common/remConfig";
import { readRemStatusCache, writeRemStatusCache } from "../../common/remCache";
import { parseMecpEventTitle } from "../../common/remEventDisplay";
import { isRemStatusStale, makeErrorStatus } from "../../common/remModel";
import { normalizeHeading } from "../../common/tacticalDisplay";

const COLOR = {
  background: 0x030603,
  green: 0x76d35d,
  greenBright: 0x8be85f,
  white: 0xe5e5e5,
  textDim: 0x8fa08c,
  cyan: 0x6ff5e7,
  blue: 0x72b8ff,
  yellow: 0xffe45c,
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
const COMPASS_REDRAW_MS = 100;
const REM_STATUS_REQUEST = "REM_STATUS_REQUEST";
const SHOW_BRIDGE_DEBUG = false;
const EVENT_RAIL = {
  x: 48,
  y: 294,
  w: 4,
  h: 84,
};

let globalNS;
let compass;
let compassArrow;
let headingText;
let connectionText;
let operatorNameText;
let operatorStatusText;
let teamText;
let lastSyncText;
let eventTitleTopText;
let eventTitleBottomText;
let eventMetaText;
let eventSeverityRail;
let eventSeverityRailColor = null;
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
let faceActive = false;
let remEnabled = false;
let remNextRequestAt = 0;
let remFailureCount = 0;
let cacheLoaded = false;
let compassActive = false;
let lastHeading = null;
let lastCompassDrawAt = 0;
let textValues = new Map();
let connectedWidgets = [];
let tacticalWidgets = [];
let tacticalVisible = null;

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
  const previous = textValues.get(widget);
  if (previous && previous.text === props.text &&
      (color === undefined || previous.color === color)) return;
  textValues.set(widget, { text: props.text, color: color === undefined && previous ? previous.color : color });
  widget.setProperty(hmUI.prop.MORE, props);
}

function normalizeAngle(directionAngle) {
  return normalizeHeading(directionAngle);
}

function showCompassInvalid() {
  if (lastHeading !== null) compassArrow && compassArrow.setProperty(hmUI.prop.ANGLE, 0);
  lastHeading = null;
  setText(headingText, "--\u00b0");
}

function showCompassAngle(directionAngle) {
  const normalized = normalizeAngle(directionAngle);
  if (normalized === null) {
    showCompassInvalid();
    return;
  }

  if (lastHeading !== normalized) compassArrow && compassArrow.setProperty(hmUI.prop.ANGLE, -normalized);
  lastHeading = normalized;
  setText(headingText, `${String(normalized).padStart(3, "0")}\u00b0`);
}

function handleCompassChange(compassRes) {
  if (!faceActive || !compassActive) return;
  const now = Date.now();
  if (lastCompassDrawAt && now - lastCompassDrawAt < COMPASS_REDRAW_MS) return;
  lastCompassDrawAt = now;
  compassRes = compassRes || compass;
  if (compassRes.calibration_status) {
    showCompassAngle(compassRes.direction_angle);
  } else {
    showCompassInvalid();
  }
}

function startCompass() {
  if (!faceActive || compassActive) return;
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

  compassActive = true;
  lastCompassDrawAt = 0;
  showCompassInvalid();
  compass.start();

  if (
    compass.calibration_status &&
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
  if (compassActive) compass && compass.stop();
  compassActive = false;
  if (compassListenerRegistered && compass && typeof compass.removeEventListener === "function") {
    compass.removeEventListener(hmSensor.event.CHANGE, handleCompassChange);
    compassListenerRegistered = false;
  }
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

function eventAlertColor(alertLevel, event) {
  if (alertLevel === 0) {
    return COLOR.red;
  }
  if (alertLevel === 1) {
    return COLOR.yellow;
  }
  if (alertLevel === 2) {
    return COLOR.green;
  }
  if (alertLevel === 3) {
    return COLOR.blue;
  }

  return eventSeverityColor(event);
}

function createEventSeverityRail(color) {
  eventSeverityRailColor = color;
  eventSeverityRail = hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: EVENT_RAIL.x,
    y: EVENT_RAIL.y,
    w: EVENT_RAIL.w,
    h: EVENT_RAIL.h,
    color,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
}

function updateEventSeverityRail(color) {
  if (!eventSeverityRail) {
    createEventSeverityRail(color);
    return;
  }

  if (eventSeverityRailColor === color) {
    return;
  }

  eventSeverityRailColor = color;
  eventSeverityRail.setProperty &&
    eventSeverityRail.setProperty(hmUI.prop.MORE, { color });
}

function timeAgoLabel(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return String(value || "--");
  }

  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (seconds < 60) {
    return "NOW";
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} MIN AGO`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} HR AGO`;
  }

  const days = Math.floor(seconds / 86400);
  return `${days} DAY AGO`;
}

function normalizeEvent(status) {
  const previous = latestRemStatus || {};
  const previousEvent = previous.lastEvent || {};
  const event = (status && status.lastEvent) || previousEvent || {};

  return {
    severity: event.severity || "SAFETY",
    category: event.category || "",
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
  const parsedTitle = parseMecpEventTitle(event.title);
  const title = compactText(parsedTitle.title, "EVENT", 10);
  const author = compactText(event.source, "SRC", 10);
  const timeAgo = compactText(timeAgoLabel(event.time), "--", 12);
  const severityColor = eventAlertColor(parsedTitle.alertLevel, event);

  updateEventSeverityRail(severityColor);
  setText(eventTitleTopText, title, COLOR.white);
  setText(eventTitleBottomText, author, COLOR.white);
  setText(eventMetaText, timeAgo, COLOR.textDim);
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

  const connected = remEnabled && rendered.connection === "CONNECTED";
  showTacticalBlocks(!connected);
  setText(connectionText, remEnabled ? (rendered.connection || "OFFLINE") : "OFF \u00b7 TAP REM", remEnabled ? remStatusColor(rendered) : COLOR.textDim);
  setText(lastSyncText, connected ? `LAST SYNC ${rendered.lastSyncAge || "--"}` : "", COLOR.textDim);
  if (!connected) return;

  const color = remStatusColor(rendered);
  const operatorState =
    rendered.operatorEam || rendered.operatorStatus || "UNKNOWN";
  const teamState = rendered.teamStatus || rendered.team || "UNKNOWN";

  setText(connectionText, rendered.connection || "CONNECTED", color);
  setText(operatorNameText, rendered.operator || "--", COLOR.green);
  setText(operatorStatusText, operatorState);
  setText(teamText, teamState);
  renderLastEvent(rendered);
}

function setBridgeDebug(text, color) {
  if (!SHOW_BRIDGE_DEBUG) {
    return;
  }

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
  if (!faceActive || !remEnabled || remRequestInFlight) return;
  if (
    typeof hmSetting !== "undefined" &&
    hmSetting.getScreenType() !== hmSetting.screen_type.WATCHFACE
  ) {
    return;
  }

  const builder = initRemBridge();
  if (!builder || !remBridgeActive || typeof builder.request !== "function") {
    setBridgeDebug("REM NOREQ", COLOR.red);
    renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
    finishRemRequest(false);
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
    remRequestCount += 1;
    dropRemBridge();
    setBridgeDebug("REM TIMEOUT", COLOR.red);
    renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
    finishRemRequest(false);
  }, REM_REQUEST_TIMEOUT_MS);

  try {
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
      if (!faceActive || !remEnabled || requestCount !== remRequestCount) {
        return;
      }

      remRequestInFlight = false;
      clearRemWatchdog();
      if (response && response.type === REM_MESSAGE_TYPES.error) {
        setBridgeDebug("REM ERROR", COLOR.red);
        renderRemStatus(makeErrorStatus("ERROR", latestRemStatus));
        finishRemRequest(false);
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
      finishRemRequest(latestRemStatus.connection === "CONNECTED");
    })
    .catch(function () {
      if (!faceActive || !remEnabled || requestCount !== remRequestCount) {
        return;
      }

      remRequestInFlight = false;
      clearRemWatchdog();
      setBridgeDebug("REM ERROR", COLOR.red);
      renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
      finishRemRequest(false);
    });
  } catch (error) {
    remRequestInFlight = false;
    clearRemWatchdog();
    renderRemStatus(makeErrorStatus("OFFLINE", latestRemStatus));
    finishRemRequest(false);
  }
}

function finishRemRequest(success) {
  dropRemBridge();
  remFailureCount = success ? 0 : Math.min(remFailureCount + 1, 4);
  const delay = success ? REM_POLL_INTERVAL_MS : Math.min(REM_POLL_INTERVAL_MS * Math.pow(2, remFailureCount - 1), 5 * 60 * 1000);
  remNextRequestAt = Date.now() + delay;
  scheduleRemRequest();
}

function scheduleRemRequest() {
  if (!faceActive || !remEnabled || remRequestTimer !== null || remRequestInFlight) return;
  remRequestTimer = globalNS.setTimeout(function () {
    remRequestTimer = null;
    requestRemStatus();
  }, Math.max(1, remNextRequestAt - Date.now()));
}

function startRemUpdates() {
  if (!faceActive) return;
  if (!cacheLoaded) {
    cacheLoaded = true;
    loadCachedRemStatus();
  }
  renderRemStatus(latestRemStatus || fallbackRemStatus());
  if (!remEnabled) return;
  if (Date.now() >= remNextRequestAt) requestRemStatus();
  else scheduleRemRequest();
}

function stopRemUpdates() {
  if (remRequestTimer !== null) {
    const timers = globalNS || getGlobal();
    timers.clearTimeout(remRequestTimer);
    remRequestTimer = null;
  }
  if (remRequestInFlight) remNextRequestAt = Date.now() + REM_POLL_INTERVAL_MS;
  remRequestCount += 1;
  remRequestInFlight = false;
  clearRemWatchdog();
  dropRemBridge();
}

function toggleRemConnection() {
  if (!faceActive) return;
  remEnabled = !remEnabled;
  stopRemUpdates();
  remFailureCount = 0;
  remNextRequestAt = 0;
  // A previous cache or session is not evidence of a live connection.
  renderRemStatus(fallbackRemStatus("OFFLINE"));
  if (remEnabled) {
    setText(connectionText, "CONNECTING", COLOR.orange);
    requestRemStatus();
  }
}

function launchCompassApp() {
  if (typeof hmApp === "undefined" || typeof hmApp.startApp !== "function") {
    return;
  }

  try {
    hmApp.startApp({
      url: "CompassScreen",
      native: true,
    });
    return;
  } catch (error) {
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
  const aod = level === hmUI.show_level.ONLY_AOD;
  const digits = aod ? Array.from({ length: 10 }, (_, digit) => `images/tactical/aod-${digit}.png`) : TIME_DIGITS;
  hmUI.createWidget(hmUI.widget.IMG_TIME, {
    hour_startX: aod ? 144 : 79,
    hour_startY: aod ? 195 : 153,
    hour_array: digits,
    hour_zero: 1,
    hour_space: 0,
    hour_angle: 0,
    hour_align: hmUI.align.LEFT,
    minute_startX: aod ? 234 : 239,
    minute_startY: aod ? 195 : 153,
    minute_array: digits,
    minute_zero: 1,
    minute_space: 0,
    minute_angle: 0,
    minute_follow: 0,
    minute_align: hmUI.align.LEFT,
    show_level: level,
  });

  hmUI.createWidget(hmUI.widget.IMG, {
    x: aod ? 220 : 215,
    y: aod ? 195 : 153,
    w: aod ? 14 : 24,
    h: aod ? 64 : 108,
    src: aod ? "images/tactical/aod-colon.png" : "images/time/teko/colon.png",
    show_level: level,
  });
}

function showTacticalBlocks(visible) {
  if (tacticalVisible === visible) return;
  tacticalVisible = visible;
  connectedWidgets.forEach((widget) => widget.setProperty(hmUI.prop.VISIBLE, !visible));
  tacticalWidgets.forEach((widget) => widget.setProperty(hmUI.prop.VISIBLE, visible));
}

function tacticalText(x, y, w, text, color = COLOR.white, size = 14, align = hmUI.align.LEFT) {
  const widget = textWidget(x, y, w, 26, text, color, size, align);
  tacticalWidgets.push(widget);
  return widget;
}

// Native data bindings are maintained by the OS: no JS weather/GPS polling.
function tacticalValue(x, y, w, typeName) {
  const type = hmUI.data_type[typeName];
  if (type === undefined) return tacticalText(x, y, w, "--");
  const base = "images/tactical/large/";
  try {
    const widget = hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x, y, w, h: 34,
      type,
      font_array: METRIC_DIGITS,
      padding: false,
      h_space: 0,
      align_h: hmUI.align.CENTER_H,
      negative_image: `${base}minus.png`,
      invalid_image: `${base}invalid.png`,
      dot_image: `${base}dot.png`,
      show_level: hmUI.show_level.ONLY_NORMAL,
    });
    tacticalWidgets.push(widget);
    return widget;
  } catch (error) {
    return tacticalText(x, y, w, "--");
  }
}

function tacticalUnit(x, y, w, unit) {
  return tacticalText(x, y, w, unit, COLOR.white, 16, hmUI.align.CENTER_H);
}

function buildTacticalBlocks() {
  tacticalText(48, 286, 110, "ALT", COLOR.green, 18, hmUI.align.CENTER_H);
  tacticalValue(48, 315, 110, "ALTITUDE");
  tacticalUnit(48, 350, 110, "m");
  tacticalText(296, 286, 131, "BAR", COLOR.green, 18, hmUI.align.CENTER_H);
  tacticalValue(296, 315, 131, "ALTIMETER");
  tacticalUnit(296, 350, 131, "hPa");
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
  connectionText = textWidget(126, 43, 202, 23, "OFF \u00b7 TAP REM", COLOR.textDim, 15);
  hmUI.createWidget(hmUI.widget.BUTTON, {
    x: 142, y: 7, w: 170, h: 59,
    normal_src: "images/touch-target.png", press_src: "images/touch-target.png", text: "",
    click_func: toggleRemConnection,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });

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

  textWidget(268, 75, 130, 22, "BATTERY", COLOR.green, 15);
  hmUI.createWidget(hmUI.widget.TEXT_IMG, {
    x: 300,
    y: 103,
    font_array: METRIC_DIGITS,
    padding: false,
    h_space: 0,
    align_h: hmUI.align.CENTER_H,
    type: hmUI.data_type.BATTERY,
    unit_en: "images/tactical/battery-percent.png",
    unit_sc: "images/tactical/battery-percent.png",
    unit_tc: "images/tactical/battery-percent.png",
    show_level: hmUI.show_level.ONLY_NORMAL,
  });

  buildClock(hmUI.show_level.ONLY_NORMAL);
  if (SHOW_BRIDGE_DEBUG) {
    bridgeDebugText = textWidget(117, 263, 220, 18, "REM INIT", COLOR.orange, 13);
  }

  createEventSeverityRail(COLOR.cyan);
  eventTitleTopText = textWidget(55, 311, 94, 28, "P01", COLOR.white, 23);
  eventTitleBottomText = textWidget(55, 341, 94, 22, "POCO", COLOR.white, 15);
  eventMetaText = textWidget(55, 366, 94, 16, "1 MIN AGO", COLOR.textDim, 10);

  textWidget(167, 286, 120, 20, "HEADING", COLOR.green, 16);
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

  operatorNameText = textWidget(302, 291, 112, 20, "--", COLOR.green, 14);
  operatorStatusText = textWidget(298, 314, 122, 29, "ACTIVE", COLOR.white, 23);
  connectedWidgets.push(textWidget(305, 347, 108, 18, "TEAM", COLOR.green, 12));
  teamText = textWidget(299, 364, 120, 27, "Yellow", COLOR.white, 21);

  lastSyncText = textWidget(129, 410, 210, 20, "", COLOR.textDim, 12);

  hmUI.createWidget(hmUI.widget.BUTTON, {
    x: 150,
    y: 276,
    w: 154,
    h: 128,
    normal_src: "images/touch-target.png",
    press_src: "images/touch-target.png",
    text: "",
    click_func: launchCompassApp,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  connectedWidgets.push(eventSeverityRail, eventTitleTopText, eventTitleBottomText,
    eventMetaText, operatorNameText, operatorStatusText, teamText, lastSyncText);
  buildTacticalBlocks();
  showTacticalBlocks(true);
}

function buildAod() {
  hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: 454,
    h: 454,
    color: 0x000000,
    show_level: hmUI.show_level.ONLY_AOD,
  });
  buildClock(hmUI.show_level.ONLY_AOD);
}

WatchFace({
  init_view() {
    globalNS = getGlobal();
    if (faceInitialized) {
      return;
    }

    faceInitialized = true;
    buildNormal();
    buildAod();
    resumeFace();

    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: function () {
        resumeFace();
      },
      pause_call: function () {
        pauseFace();
      },
    });
  },

  build() {
    this.init_view();
  },

  onDestroy() {
    pauseFace();
    faceInitialized = false;
    compassListenerRegistered = false;
    compass = null;
    latestRemStatus = null;
    cacheLoaded = false;
    remEnabled = false;
    remNextRequestAt = 0;
    remFailureCount = 0;
    messageBuilder = null;
    connectedWidgets = [];
    tacticalWidgets = [];
    tacticalVisible = null;
    eventSeverityRail = null;
    textValues.clear();
  },
});

function resumeFace() {
  if (hmSetting.getScreenType() !== hmSetting.screen_type.WATCHFACE) {
    pauseFace();
    return;
  }
  if (faceActive) return;
  faceActive = true;
  startCompass();
  startRemUpdates();
}

function pauseFace() {
  faceActive = false;
  stopCompass();
  stopRemUpdates();
}
