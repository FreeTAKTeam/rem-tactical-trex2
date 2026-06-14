import { getScene, SCENE_AOD } from "@zos/app";
import { Battery, HeartRate, Time } from "@zos/sensor";
import ui from "@zos/ui";
import { log, px } from "@zos/utils";
import { COLORS as COLOR } from "../../common/colors";
import { LAYOUT, SCREEN } from "../../common/layout";
import { remStatus } from "../../common/remStatus";
import { TIME_FONT } from "../../common/timeFont";

const logger = log.getLogger("rem-tactical-face");

let timeSensor;
let heartSensor;
let batterySensor;
let compassSensor;

let timeDigits = [];
let heartText;
let batteryText;
let headingText;
let compassImage;

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
  compassImage.setProperty(ui.prop.ANGLE, 0);
  setText(headingText, "--");
}

function showCompassAngle(directionAngle) {
  if (
    directionAngle === undefined ||
    directionAngle === null ||
    directionAngle === "INVALID"
  ) {
    showCompassInvalid();
    return;
  }

  const angle = parseInt(directionAngle);
  if (Number.isNaN(angle)) {
    showCompassInvalid();
    return;
  }

  const normalized = ((angle % 360) + 360) % 360;
  compassImage.setProperty(ui.prop.ANGLE, -normalized);
  setText(headingText, `${String(normalized).padStart(3, "0")}°`);
}

function startCompass() {
  if (
    typeof hmSensor === "undefined" ||
    !hmSensor.id ||
    hmSensor.id.COMPASS === undefined
  ) {
    return;
  }

  compassSensor = hmSensor.createSensor(hmSensor.id.COMPASS);
  compassSensor.start();

  showCompassAngle(compassSensor.direction_angle);

  compassSensor.addEventListener(hmSensor.event.CHANGE, function (compassResult) {
    showCompassAngle(compassResult && compassResult.direction_angle);
  });
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
    text: "--°",
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
  ui.createWidget(ui.widget.BUTTON, {
    x: px(158),
    y: px(280),
    w: px(138),
    h: px(105),
    normal_src: "images/touch-target.png",
    press_src: "images/touch-target.png",
    text: "",
    click_func() {
      hmApp.startApp({
        url: "CompassScreen",
        native: true,
      });
    },
    show_level: ui.show_level.ONLY_NORMAL,
  });

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
        if (compassSensor) {
          compassSensor.start();
          showCompassAngle(compassSensor.direction_angle);
        }
      },
      pause_call() {
        if (compassSensor) {
          compassSensor.stop();
        }
      },
    });
  },

  onDestroy() {
    if (compassSensor) {
      compassSensor.stop();
    }
    logger.info("REM Tactical face destroyed");
  },
});
