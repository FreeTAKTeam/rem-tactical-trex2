import { getGlobal } from "../../shared/global";
import { REM_MESSAGE_TYPES, REM_REQUEST_METHOD } from "../../common/messageTypes";
import {
  isRemStatusStale,
  makeErrorStatus,
} from "../../common/remModel";
import {
  readRemStatusCache,
  writeRemStatusCache,
} from "../../common/remCache";
import { getMockRemStatus } from "../../common/mockRem";
import { remConfig } from "../../common/remConfig";

const COLOR = {
  background: 0x030603,
  green: 0x76d35d,
  greenBright: 0x8be85f,
  white: 0xe5e5e5,
  textDim: 0x8fa08c,
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

const REM_STATUS_REQUEST = "REM_STATUS_REQUEST";

let globalNS;
let compass;
let compassArrow;
let headingText;
let statusText;
let bridgeText;
let cacheText;
let localCacheText;
let operatorText;
let teamText;
let eventsText;
let priorityText;
let syncText;
let waypointText;
let requestTimer = null;
let requestCount = 0;
let bridgeState = "BRIDGE INIT";
let cacheState = "CACHE INIT";
let localCacheState = "LOCAL CACHE INIT";
let latestStatus = null;
let messageBuilder = null;
let connectionActive = false;

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

  const props = { text: String(text ?? "") };
  if (color !== undefined) {
    props.color = color;
  }
  widget.setProperty(hmUI.prop.MORE, props);
}

function statusColor(status) {
  if (!status) {
    return COLOR.orange;
  }
  if (status.alert === "ALERT" || status.priority === "EMERGENCY" || status.connection === "ERROR") {
    return COLOR.red;
  }
  if (status.connection === "STALE") {
    return COLOR.orange;
  }
  return COLOR.green;
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

  compass.addEventListener(hmSensor.event.CHANGE, function (compassRes) {
    if (compassRes.calibration_status) {
      showCompassAngle(compassRes.direction_angle);
    } else {
      showCompassInvalid();
    }
  });
}

function stopCompass() {
  compass && compass.stop();
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

function renderDiagnostics() {
  setText(bridgeText, bridgeState, bridgeState === "BRIDGE OK" ? COLOR.green : COLOR.orange);
  setText(cacheText, cacheState, cacheState.indexOf("OK") >= 0 ? COLOR.green : COLOR.orange);
  setText(
    localCacheText,
    localCacheState,
    localCacheState.indexOf("OK") >= 0 ? COLOR.green : COLOR.red,
  );
}

function renderRemStatus(status) {
  const rendered = status || getMockRemStatus(0);
  const stale = isRemStatusStale(
    rendered,
    remConfig.staleTimeoutSeconds,
    Date.now(),
  );
  const displayStatus = stale && rendered.connection === "CONNECTED"
    ? { ...rendered, connection: "STALE" }
    : rendered;

  latestStatus = displayStatus;
  setText(statusText, displayStatus.connection, statusColor(displayStatus));
  setText(operatorText, displayStatus.operatorStatus || "UNKNOWN");
  setText(teamText, displayStatus.team || "UNKNOWN");
  setText(eventsText, `EV ${displayStatus.activeEvents || 0}`);
  setText(priorityText, displayStatus.priority || "NORMAL", statusColor(displayStatus));
  setText(syncText, displayStatus.lastSyncAge || "--");
  setText(
    waypointText,
    displayStatus.waypoint
      ? `${displayStatus.waypoint} ${displayStatus.waypointDistance} ${displayStatus.waypointBearing}`
      : "NO WP",
  );
  renderDiagnostics();
}

function loadCachedStatus() {
  const result = readRemStatusCache();
  if (result.ok && result.status) {
    cacheState = "CACHE READ OK";
    renderRemStatus(result.status);
    return;
  }

  cacheState = result.ok ? "CACHE EMPTY" : `CACHE ${result.reason}`;
  renderRemStatus(getMockRemStatus(0));
}

function saveStatus(status) {
  const result = writeRemStatusCache(status);
  cacheState = result.ok ? "CACHE WRITE OK" : `CACHE ${result.reason}`;
  renderDiagnostics();
}

function runLocalCacheProof() {
  const proofStatus = getMockRemStatus(1, Date.now());
  const writeResult = writeRemStatusCache(proofStatus);
  const readResult = readRemStatusCache();
  const proofOk =
    writeResult.ok &&
    readResult.ok &&
    readResult.status &&
    readResult.status.priority === proofStatus.priority;

  localCacheState = proofOk ? "LOCAL CACHE OK" : "LOCAL CACHE FAIL";
  cacheState = readResult.ok
    ? proofOk
      ? "CACHE SELF OK"
      : "CACHE SELF BAD"
    : `CACHE ${readResult.reason}`;
  if (proofOk) {
    latestStatus = readResult.status;
  }
  renderDiagnostics();
}

function getMessageBuilder() {
  if (messageBuilder) {
    return messageBuilder;
  }

  try {
    messageBuilder = getApp()._options.globalData.messageBuilder;
  } catch (error) {
    bridgeState = "BRIDGE NOAPP";
  }

  return messageBuilder;
}

function initBridge() {
  const builder = getMessageBuilder();
  if (!builder || connectionActive) {
    return builder;
  }

  try {
    builder.connect();
    connectionActive = true;
    bridgeState = "BRIDGE CONNECT";
  } catch (error) {
    bridgeState = "BRIDGE FAIL";
  }

  return builder;
}

function dropBridge() {
  const builder = getMessageBuilder();
  if (!builder || !connectionActive) {
    return;
  }

  try {
    builder.disConnect();
  } catch (error) {
  }
  connectionActive = false;
  bridgeState = "BRIDGE PAUSE";
}

function requestRemStatus() {
  if (hmSetting.getScreenType() !== hmSetting.screen_type.WATCHFACE) {
    return;
  }

  const builder = initBridge();
  if (!builder || typeof builder.request !== "function") {
    bridgeState = "BRIDGE NOREQ";
    renderRemStatus(latestStatus);
    return;
  }

  requestCount += 1;
  bridgeState = `BRIDGE REQ ${requestCount}`;
  renderRemStatus(latestStatus);

  builder
    .request(
      {
        type: REM_STATUS_REQUEST,
        method: REM_REQUEST_METHOD,
        params: {
          config: remConfig,
        },
      },
      { timeout: 5000 },
    )
    .then((response) => {
      if (response?.type === REM_MESSAGE_TYPES.error) {
        bridgeState = "BRIDGE ERROR";
        renderRemStatus(makeErrorStatus("ERROR", latestStatus));
        return;
      }

      const status = response?.data || response?.result || response;
      bridgeState = "BRIDGE OK";
      saveStatus(status);
      renderRemStatus(status);
    })
    .catch((error) => {
      bridgeState = "BRIDGE TIMEOUT";
      renderRemStatus(makeErrorStatus("OFFLINE", latestStatus));
    });
}

function startStatusUpdates() {
  if (requestTimer !== null) {
    return;
  }

  requestRemStatus();
  requestTimer = globalNS.setInterval(() => {
    requestRemStatus();
  }, remConfig.pollIntervalSeconds * 1000);
}

function stopStatusUpdates() {
  if (requestTimer !== null) {
    globalNS.clearInterval(requestTimer);
    requestTimer = null;
  }
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

  textWidget(117, 6, 220, 34, "REM WF SYNC", COLOR.green, 26);
  statusText = textWidget(126, 40, 202, 23, "CONNECTED", COLOR.green, 15);

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

  hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: 42,
    y: 145,
    w: 370,
    h: 126,
    color: 0x000000,
    show_level: hmUI.show_level.ONLY_NORMAL,
  });
  bridgeText = textWidget(52, 150, 350, 32, "BRIDGE INIT", COLOR.orange, 24);
  cacheText = textWidget(52, 188, 350, 32, "CACHE INIT", COLOR.orange, 24);
  localCacheText = textWidget(52, 226, 350, 32, "LOCAL CACHE INIT", COLOR.orange, 22);

  eventsText = textWidget(61, 326, 110, 24, "EV 0", COLOR.white, 22);
  priorityText = textWidget(51, 352, 130, 22, "NORMAL", COLOR.green, 16);

  textWidget(167, 286, 120, 20, "HEADING", COLOR.green, 14);
  headingText = textWidget(164, 306, 126, 35, "--\u00b0", COLOR.white, 28);
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

  textWidget(302, 291, 112, 20, "OPERATOR", COLOR.green, 14);
  operatorText = textWidget(298, 314, 122, 29, "ACTIVE", COLOR.white, 23);
  textWidget(305, 347, 108, 18, "TEAM", COLOR.green, 12);
  teamText = textWidget(299, 364, 120, 27, "ALPHA", COLOR.white, 21);

  textWidget(45, 412, 85, 18, "LAST SYNC", COLOR.green, 12);
  syncText = textWidget(128, 410, 82, 20, "--", COLOR.white, 14);
  waypointText = textWidget(208, 410, 205, 20, "NO WP", COLOR.textDim, 12);
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
    buildNormal();
    buildAod();
    startCompass();
    loadCachedStatus();
    runLocalCacheProof();

    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: function () {
        startCompass();
        startStatusUpdates();
      },
      pause_call: function () {
        stopCompass();
        stopStatusUpdates();
        dropBridge();
      },
    });

    startStatusUpdates();
  },

  build() {
    this.init_view();
  },

  onDestroy() {
    stopCompass();
    stopStatusUpdates();
    dropBridge();
  },
});
