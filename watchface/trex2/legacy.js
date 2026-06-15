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

let compass;
let compassArrow;
let headingText;

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

function setText(widget, text) {
  widget &&
    widget.setProperty(hmUI.prop.MORE, {
      text,
    });
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
  textWidget(126, 43, 202, 23, "CONNECTED", COLOR.green, 15);

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

  textWidget(43, 291, 120, 20, "GPS", COLOR.green, 14);
  textWidget(62, 314, 100, 32, "3D", COLOR.white, 24);
  textWidget(67, 344, 92, 26, "FIX", COLOR.white, 20);

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
  textWidget(298, 314, 122, 29, "ACTIVE", COLOR.white, 23);
  textWidget(305, 347, 108, 18, "TEAM", COLOR.green, 12);
  textWidget(299, 364, 120, 27, "ALPHA", COLOR.white, 21);

  textWidget(129, 412, 91, 18, "LAST SYNC", COLOR.green, 12);
  textWidget(218, 410, 92, 20, "14:30 UTC", COLOR.white, 14);
  textWidget(309, 412, 51, 18, "2m AGO", COLOR.textDim, 11);
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
    buildNormal();
    buildAod();
    startCompass();

    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: function () {
        startCompass();
      },
      pause_call: function () {
        stopCompass();
      },
    });
  },

  build() {
    this.init_view();
  },

  onDestroy() {
    stopCompass();
  },
});
