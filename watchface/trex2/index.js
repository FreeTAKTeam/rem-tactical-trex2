import { getScene, SCENE_AOD } from "@zos/app";
import { launchApp, SYSTEM_APP_COMPASS } from "@zos/router";
import { Battery, Compass, HeartRate, Time } from "@zos/sensor";
import ui from "@zos/ui";
import { log, px } from "@zos/utils";
import { COLORS as COLOR } from "../../common/colors";
import { LAYOUT, SCREEN } from "../../common/layout";
import { remStatus } from "../../common/remStatus";
import { TIME_FONT } from "../../common/timeFont";

const logger = log.getLogger("rem-tactical-face");
const DEBUG_BUILD = "DBG 1.3.12";

let timeSensor;
let heartSensor;
let batterySensor;
let compassSensor;

let timeDigits = [];
let heartText;
let batteryText;
let headingText;
let compassImage;
let compassMode;
let compassListenerAttached = false;
let compassChangeCallback;
let debugLine1;
let debugLine2;
let debugLine3;
let debugLine4;
let debugTapCount = 0;
let debugEventCount = 0;
const debugState = {
  zc: "?",
  hm: "?",
  id: "?",
  rt: "?",
  sc: "?",
  app: "?",
  btn: "?",
  evt: "?",
  start: "--",
  angle: "--",
  cal: "--",
  launch: "--",
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function textWidget({
  x,
  y,
  w,
  h,
  text,
  color = COLOR.white,
  size,
  horizontal = ui.align.CENTER_H,
  vertical = ui.align.CENTER_V,
  level = ui.show_level.ONLY_NORMAL,
}) {
  return ui.createWidget(ui.widget.TEXT, {
    x: px(x),
    y: px(y),
    w: px(w),
    h: px(h),
    text,
    color,
    text_size: px(size),
    align_h: horizontal,
    align_v: vertical,
    text_style: ui.text_style.NONE,
    show_level: level,
  });
}

function setText(widget, text) {
  widget &&
    widget.setProperty(ui.prop.MORE, {
      text,
    });
}

function yesNo(value) {
  return value ? "Y" : "N";
}

function shortValue(value) {
  if (value === undefined) {
    return "UN";
  }
  if (value === null) {
    return "NL";
  }
  return String(value).slice(0, 9);
}

function debugSet(nextState) {
  if (nextState) {
    Object.keys(nextState).forEach((key) => {
      debugState[key] = nextState[key];
    });
  }

  setText(debugLine1, `${DEBUG_BUILD} T:${debugTapCount} E:${debugEventCount}`);
  setText(
    debugLine2,
    `ZC:${debugState.zc} HM:${debugState.hm} HI:${debugState.id} RT:${debugState.rt}`,
  );
  setText(
    debugLine3,
    `ST:${debugState.start} ANG:${debugState.angle} CAL:${debugState.cal}`,
  );
  setText(
    debugLine4,
    `SC:${debugState.sc} HA:${debugState.app} B:${debugState.btn} J:${debugState.launch}`,
  );
}

function buildDebugOverlay() {
  ui.createWidget(ui.widget.FILL_RECT, {
    x: px(18),
    y: px(136),
    w: px(418),
    h: px(150),
    color: COLOR.background,
    show_level: ui.show_level.ONLY_NORMAL,
  });
  debugLine1 = textWidget({
    x: 22,
    y: 140,
    w: 410,
    h: 34,
    text: DEBUG_BUILD,
    color: COLOR.orange,
    size: 24,
  });
  debugLine2 = textWidget({
    x: 22,
    y: 176,
    w: 410,
    h: 30,
    text: "",
    color: COLOR.greenBright,
    size: 20,
  });
  debugLine3 = textWidget({
    x: 22,
    y: 210,
    w: 410,
    h: 30,
    text: "",
    color: COLOR.white,
    size: 20,
  });
  debugLine4 = textWidget({
    x: 22,
    y: 244,
    w: 410,
    h: 30,
    text: "",
    color: COLOR.textDim,
    size: 20,
  });
  debugSet({
    zc: yesNo(typeof Compass === "function"),
    hm: yesNo(typeof hmSensor !== "undefined"),
    id: yesNo(
      typeof hmSensor !== "undefined" &&
        hmSensor.id &&
        hmSensor.id.COMPASS !== undefined,
    ),
    rt: yesNo(typeof launchApp === "function"),
    sc: shortValue(SYSTEM_APP_COMPASS),
    app: yesNo(typeof hmApp !== "undefined" && typeof hmApp.startApp === "function"),
    evt: yesNo(
      typeof hmSensor !== "undefined" &&
        hmSensor.event &&
        hmSensor.event.CHANGE !== undefined,
    ),
  });
}

function timeImageWidget({ x, y, level }) {
  return ui.createWidget(ui.widget.IMG, {
    x: px(x),
    y: px(y),
    w: px(LAYOUT.clock.digitWidth),
    h: px(LAYOUT.clock.height),
    src: TIME_FONT.digits[0],
    show_level: level,
  });
}

function buildTime(level) {
  timeDigits = [
    timeImageWidget({ x: LAYOUT.clock.hour.x, y: LAYOUT.clock.hour.y, level }),
    timeImageWidget({
      x: LAYOUT.clock.hour.x + LAYOUT.clock.digitWidth,
      y: LAYOUT.clock.hour.y,
      level,
    }),
    timeImageWidget({
      x: LAYOUT.clock.minute.x,
      y: LAYOUT.clock.minute.y,
      level,
    }),
    timeImageWidget({
      x: LAYOUT.clock.minute.x + LAYOUT.clock.digitWidth,
      y: LAYOUT.clock.minute.y,
      level,
    }),
  ];
  ui.createWidget(ui.widget.IMG, {
    x: px(LAYOUT.clock.colon.x),
    y: px(LAYOUT.clock.colon.y),
    w: px(LAYOUT.clock.colon.w),
    h: px(LAYOUT.clock.colon.h),
    src: TIME_FONT.colon,
    show_level: level,
  });
}

function setTimeDigit(index, value) {
  timeDigits[index] &&
    timeDigits[index].setProperty(ui.prop.MORE, {
      src: TIME_FONT.digits[value],
    });
}

function updateTime() {
  const hour = timeSensor.getFormatHour();
  const minute = timeSensor.getMinutes();

  const clockDigits = `${pad(hour)}${pad(minute)}`;
  clockDigits.split("").forEach((digit, index) => {
    setTimeDigit(index, Number(digit));
  });
}

function updateHealth() {
  const heart = heartSensor.getLast();
  const battery = batterySensor.getCurrent();

  setText(heartText, heart > 0 ? String(heart) : "--");
  setText(batteryText, `${battery}%`);
}

function showCompassInvalid() {
  compassImage && compassImage.setProperty(ui.prop.ANGLE, 0);
  setText(headingText, "--\u00b0");
}

function normalizeCompassAngle(directionAngle) {
  if (
    directionAngle === undefined ||
    directionAngle === null ||
    directionAngle === "INVALID"
  ) {
    return null;
  }

  const angle = parseInt(directionAngle);
  if (Number.isNaN(angle)) {
    return null;
  }

  return ((angle % 360) + 360) % 360;
}

function showCompassAngle(directionAngle) {
  const normalized = normalizeCompassAngle(directionAngle);
  if (normalized === null) {
    showCompassInvalid();
    return;
  }

  compassImage.setProperty(ui.prop.ANGLE, -normalized);
  setText(headingText, `${String(normalized).padStart(3, "0")}\u00b0`);
}

function handleCompassChange(compassResult) {
  debugEventCount += 1;
  debugSet({
    evt: "H",
    angle: shortValue(compassResult && compassResult.direction_angle),
    cal: shortValue(compassResult && compassResult.calibration_status),
  });

  if (normalizeCompassAngle(compassResult && compassResult.direction_angle) !== null) {
    showCompassAngle(compassResult.direction_angle);
  } else {
    showCompassInvalid();
  }
}

function handleZosCompassChange() {
  const directionAngle =
    compassSensor && typeof compassSensor.getDirectionAngle === "function"
      ? compassSensor.getDirectionAngle()
      : undefined;
  const status =
    compassSensor && typeof compassSensor.getStatus === "function"
      ? compassSensor.getStatus()
      : undefined;

  debugEventCount += 1;
  debugSet({
    evt: "Z",
    angle: shortValue(directionAngle),
    cal: shortValue(status),
  });

  if (normalizeCompassAngle(directionAngle) !== null) {
    showCompassAngle(directionAngle);
  } else {
    showCompassInvalid();
  }
}

function stopCompass() {
  if (compassSensor) {
    try {
      if (
        compassMode === "zos" &&
        compassListenerAttached &&
        typeof compassSensor.offChange === "function"
      ) {
        compassSensor.offChange(compassChangeCallback);
        compassListenerAttached = false;
      }
      compassSensor.stop();
      debugSet({ start: "STOP" });
    } catch (error) {
      debugSet({ start: "STOPERR" });
      logger.info(`Compass stop failed: ${error}`);
    }
  }
}

function startCompass() {
  if (getScene() === SCENE_AOD || !compassImage) {
    debugSet({ start: "SKIP" });
    return;
  }

  const hasZosCompass = typeof Compass === "function";
  const hasHmSensor = typeof hmSensor !== "undefined";
  const hasCompassId =
    hasHmSensor && hmSensor.id && hmSensor.id.COMPASS !== undefined;
  const hasCompassEvent =
    hasHmSensor && hmSensor.event && hmSensor.event.CHANGE !== undefined;
  debugSet({
    zc: yesNo(hasZosCompass),
    hm: yesNo(hasHmSensor),
    id: yesNo(hasCompassId),
    evt: yesNo(hasCompassEvent),
  });

  if (hasZosCompass) {
    try {
      if (!compassSensor || compassMode !== "zos") {
        compassSensor = new Compass();
        compassMode = "zos";
        compassListenerAttached = false;
        compassChangeCallback = handleZosCompassChange;
      }
    } catch (error) {
      showCompassInvalid();
      debugSet({ start: "ZCRTERR", angle: shortValue(error) });
      logger.info(`ZOS compass create failed: ${error}`);
      return;
    }

    try {
      compassSensor.start();
      const directionAngle =
        typeof compassSensor.getDirectionAngle === "function"
          ? compassSensor.getDirectionAngle()
          : undefined;
      const status =
        typeof compassSensor.getStatus === "function"
          ? compassSensor.getStatus()
          : undefined;
      debugSet({
        start: "ZOS",
        angle: shortValue(directionAngle),
        cal: shortValue(status),
      });
      if (normalizeCompassAngle(directionAngle) !== null) {
        showCompassAngle(directionAngle);
      } else {
        showCompassInvalid();
      }
    } catch (error) {
      showCompassInvalid();
      debugSet({ start: "ZSTRERR", angle: shortValue(error) });
      logger.info(`ZOS compass start failed: ${error}`);
      return;
    }

    if (!compassListenerAttached && typeof compassSensor.onChange === "function") {
      try {
        compassSensor.onChange(compassChangeCallback);
        compassListenerAttached = true;
        debugSet({ evt: "Z" });
      } catch (error) {
        debugSet({ evt: "ZERR" });
        logger.info(`ZOS compass event listener failed: ${error}`);
      }
    }
    return;
  }

  if (!hasCompassId) {
    showCompassInvalid();
    debugSet({ start: "NOID" });
    return;
  }

  try {
    if (!compassSensor) {
      compassSensor = hmSensor.createSensor(hmSensor.id.COMPASS);
      compassMode = "hm";
    }
  } catch (error) {
    showCompassInvalid();
    debugSet({ start: "CRTERR", angle: shortValue(error) });
    logger.info(`Compass create failed: ${error}`);
    return;
  }

  try {
    compassSensor.start();
    debugSet({
      start: "Y",
      angle: shortValue(compassSensor.direction_angle),
      cal: shortValue(compassSensor.calibration_status),
    });
  } catch (error) {
    showCompassInvalid();
    debugSet({ start: "STRERR", angle: shortValue(error) });
    logger.info(`Compass start failed: ${error}`);
    return;
  }

  if (normalizeCompassAngle(compassSensor.direction_angle) !== null) {
    showCompassAngle(compassSensor.direction_angle);
  } else {
    showCompassInvalid();
  }

  if (!compassListenerAttached && hasCompassEvent) {
    try {
      compassSensor.addEventListener(hmSensor.event.CHANGE, handleCompassChange);
      compassListenerAttached = true;
      debugSet({ evt: "H" });
    } catch (error) {
      debugSet({ evt: "ERR" });
      logger.info(`Compass event listener failed: ${error}`);
    }
  }
}

function launchNativeCompass() {
  debugTapCount += 1;
  debugSet({
    rt: yesNo(typeof launchApp === "function"),
    sc: shortValue(SYSTEM_APP_COMPASS),
    app: yesNo(typeof hmApp !== "undefined" && typeof hmApp.startApp === "function"),
    launch: "TAP",
  });

  if (typeof launchApp === "function") {
    try {
      launchApp({
        appId: SYSTEM_APP_COMPASS !== undefined ? SYSTEM_APP_COMPASS : 1,
        url: "CompassScreen",
        native: true,
      });
      debugSet({ launch: SYSTEM_APP_COMPASS !== undefined ? "ROK" : "R1OK" });
      return;
    } catch (error) {
      debugSet({ launch: SYSTEM_APP_COMPASS !== undefined ? "RERR" : "R1ERR" });
      logger.info(`Router compass launch failed: ${error}`);
    }
  }

  if (typeof hmApp === "undefined" || typeof hmApp.startApp !== "function") {
    logger.info("Native compass launcher unavailable");
    debugSet({ launch: "NOAPP" });
    return;
  }

  try {
    hmApp.startApp({
      appid: 1,
      url: "CompassScreen",
      native: true,
    });
    debugSet({ launch: "HOK" });
  } catch (error) {
    debugSet({ launch: "HERR" });
    logger.info(`Native compass launch failed: ${error}`);
  }
}

function buildAod() {
  ui.createWidget(ui.widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: px(SCREEN.width),
    h: px(SCREEN.height),
    color: COLOR.background,
  });

  buildTime(ui.show_level.ONAL_AOD);
}

function buildNormal() {
  ui.createWidget(ui.widget.IMG, {
    x: 0,
    y: 0,
    w: px(SCREEN.width),
    h: px(SCREEN.height),
    src: "images/tactical-bg-v2.png",
    show_level: ui.show_level.ONLY_NORMAL,
  });

  textWidget({
    ...LAYOUT.header.title,
    text: "REM",
    color: COLOR.green,
  });
  textWidget({
    ...LAYOUT.header.status,
    text: `●  ${remStatus.connection}`,
    color: COLOR.green,
  });

  textWidget({
    ...LAYOUT.heart.label,
    text: "HEART RATE",
    color: COLOR.green,
  });
  heartText = textWidget({
    ...LAYOUT.heart.value,
    text: "--",
  });
  textWidget({
    ...LAYOUT.heart.unit,
    text: "BPM",
    color: COLOR.textDim,
  });

  textWidget({
    ...LAYOUT.battery.label,
    text: "BATTERY",
    color: COLOR.green,
  });
  batteryText = textWidget({
    ...LAYOUT.battery.value,
    text: "--%",
  });

  buildTime(ui.show_level.ONLY_NORMAL);

  textWidget({
    ...LAYOUT.gps.label,
    text: "GPS",
    color: COLOR.green,
  });
  textWidget({
    ...LAYOUT.gps.fix,
    text: remStatus.gpsFix,
  });
  textWidget({
    ...LAYOUT.gps.detail,
    text: remStatus.gpsDetail,
  });

  textWidget({
    ...LAYOUT.heading.label,
    text: "HEADING",
    color: COLOR.green,
  });
  headingText = textWidget({
    ...LAYOUT.heading.bearing,
    text: "--\u00b0",
  });
  compassImage = ui.createWidget(ui.widget.IMG, {
    x: 0,
    y: 0,
    w: px(SCREEN.width),
    h: px(SCREEN.height),
    pos_x: px(187),
    pos_y: px(330),
    center_x: px(227),
    center_y: px(370),
    src: "images/compass-needle.png",
    angle: 0,
    show_level: ui.show_level.ONLY_NORMAL,
  });
  textWidget({
    ...LAYOUT.heading.north,
    text: "N",
    color: COLOR.white,
  });
  const compassButton = ui.createWidget(ui.widget.BUTTON, {
    x: px(LAYOUT.heading.tapTarget.x),
    y: px(LAYOUT.heading.tapTarget.y),
    w: px(LAYOUT.heading.tapTarget.w),
    h: px(LAYOUT.heading.tapTarget.h),
    normal_src: "images/touch-target.png",
    press_src: "images/touch-target.png",
    text: "",
    click_func: launchNativeCompass,
    show_level: ui.show_level.ONLY_NORMAL,
  });
  if (
    compassButton &&
    typeof compassButton.addEventListener === "function" &&
    ui.event &&
    ui.event.CLICK_DOWN !== undefined
  ) {
    compassButton.addEventListener(ui.event.CLICK_DOWN, launchNativeCompass);
    debugSet({ btn: "EV" });
  } else {
    debugSet({ btn: compassButton ? "CF" : "N" });
  }

  textWidget({
    ...LAYOUT.operator.label,
    text: "OPERATOR",
    color: COLOR.green,
  });
  textWidget({
    ...LAYOUT.operator.status,
    text: remStatus.operatorStatus,
  });
  textWidget({
    ...LAYOUT.operator.teamLabel,
    text: "TEAM",
    color: COLOR.green,
  });
  textWidget({
    ...LAYOUT.operator.team,
    text: remStatus.team,
  });

  textWidget({
    ...LAYOUT.sync.label,
    text: "LAST SYNC",
    color: COLOR.green,
  });
  textWidget({
    ...LAYOUT.sync.value,
    text: remStatus.lastSync,
    color: COLOR.white,
  });
  textWidget({
    ...LAYOUT.sync.age,
    text: `${remStatus.lastSyncAge} AGO`,
    color: COLOR.textDim,
  });

  buildDebugOverlay();
  debugSet({ btn: debugState.btn === "?" && compassButton ? "CF" : debugState.btn });
}

WatchFace({
  build() {
    const isAod = getScene() === SCENE_AOD;

    timeSensor = new Time();
    heartSensor = new HeartRate();
    batterySensor = new Battery();
    if (isAod) {
      buildAod();
    } else {
      buildNormal();
      startCompass();
    }

    updateTime();
    updateHealth();

    timeSensor.onPerMinute(() => {
      updateTime();
      updateHealth();
    });

    ui.createWidget(ui.widget.WIDGET_DELEGATE, {
      resume_call() {
        updateTime();
        updateHealth();
        startCompass();
      },
      pause_call() {
        stopCompass();
      },
    });
  },

  onDestroy() {
    stopCompass();
    logger.info("REM Tactical face destroyed");
  },
});
