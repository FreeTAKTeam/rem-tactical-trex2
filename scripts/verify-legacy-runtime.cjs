const fs = require("fs");

const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
const legacyPath = "watchface/trex2/legacy.js";
const legacyExists = fs.existsSync(legacyPath);
const legacy = legacyExists ? fs.readFileSync(legacyPath, "utf8") : "";
const appJs = fs.readFileSync("app.js", "utf8");
const messageTypes = fs.readFileSync("common/messageTypes.js", "utf8");

const checks = [
  ["app version is 1.3.28", app.app.version.name === "1.3.28"],
  ["app version code is 46", app.app.version.code === 46],
  ["app targets API 1.0.1", app.runtime.apiVersion.target === "1.0.1"],
  [
    "active module is legacy",
    app.targets.trex2.module.watchface.path === "watchface/trex2/legacy",
  ],
  ["legacy entry exists", legacyExists],
  ["legacy entry uses hmUI", legacy.includes("hmUI.createWidget")],
  [
    "legacy entry uses hmSensor compass",
    legacy.includes("hmSensor.createSensor(hmSensor.id.COMPASS)"),
  ],
  ["legacy entry avoids @zos imports", !legacy.includes("@zos/")],
  ["clock places normal and AOD minutes explicitly", legacy.includes("minute_startX: aod ? 234 : 239")],
  [
    "clock uses visible colon image",
    legacy.includes('"images/time/teko/colon.png"') && legacy.includes('"images/tactical/aod-colon.png"'),
  ],
  [
    "heart rate uses legacy data binding",
    legacy.includes("type: hmUI.data_type.HEART"),
  ],
  [
    "heart rate uses operator-sized metric digits",
    legacy.includes("font_array: METRIC_DIGITS") &&
      legacy.includes("images/metrics/operator/"),
  ],
  [
    "heart rate omits redundant BPM label",
    !legacy.includes('"BPM"'),
  ],
  [
    "battery uses legacy data binding",
    legacy.includes("type: hmUI.data_type.BATTERY"),
  ],
  [
    "battery uses same metric digits as heart rate",
    (legacy.match(/font_array: METRIC_DIGITS/g) || []).length >= 2,
  ],
  [
    "static compass dial keeps circle and grades",
    legacy.includes('src: "images/compass-dial.png"'),
  ],
  [
    "dynamic compass arrow is restored",
    legacy.includes('src: "images/compass-arrow.png"') &&
      legacy.includes("compassArrow.setProperty(hmUI.prop.ANGLE"),
  ],
  [
    "heading degrees render over compass circle",
    legacy.indexOf("headingText = textWidget") >
      legacy.indexOf('src: "images/compass-arrow.png"'),
  ],
  [
    "compass tap target opens native compass",
    legacy.includes('url: "CompassScreen"') &&
      legacy.includes("appid: 1") &&
      legacy.includes("click_func: launchCompassApp") &&
      legacy.lastIndexOf("click_func: launchCompassApp") > legacy.indexOf("teamText = textWidget"),
  ],
  [
    "operator call sign is rendered from REM status",
    legacy.includes("operatorNameText") &&
      legacy.includes("rendered.operator") &&
      !legacy.includes('"C0rv0"') &&
      !legacy.includes('"OPERATOR"'),
  ],
  [
    "team value is renamed",
    legacy.includes('"Yellow"') && !legacy.includes('"ALPHA"'),
  ],
  [
    "last update age wording is removed",
    !legacy.includes("2m AGO") && legacy.includes("rendered.lastSyncAge"),
  ],
  [
    "gps block is replaced by compact last-event panel",
    legacy.includes("renderLastEvent") &&
      legacy.includes("eventSeverityRail") &&
      legacy.includes("parseMecpEventTitle") &&
      legacy.includes("timeAgoLabel") &&
      !legacy.includes('"POSITION / MOVE"') &&
      !legacy.includes('"GPS"') &&
      !legacy.includes('"3D"') &&
      !legacy.includes('"FIX"'),
  ],
  [
    "bottom event count and priority placeholders are removed",
    !legacy.includes("eventsText") &&
      !legacy.includes("priorityText") &&
      !legacy.includes('"EV 0"') &&
      !legacy.includes('"NORMAL", COLOR.green, 13'),
  ],
  [
    "bridge debug label is hidden behind flag",
    legacy.includes("const SHOW_BRIDGE_DEBUG = false") &&
      legacy.includes("if (!SHOW_BRIDGE_DEBUG)") &&
      legacy.includes("if (SHOW_BRIDGE_DEBUG)"),
  ],
  [
    "MECP event level maps to rail colors",
    legacy.includes("alertLevel === 0") &&
      legacy.includes("return COLOR.red") &&
      legacy.includes("alertLevel === 1") &&
      legacy.includes("return COLOR.yellow") &&
      legacy.includes("alertLevel === 2") &&
      legacy.includes("return COLOR.green") &&
      legacy.includes("alertLevel === 3") &&
      legacy.includes("return COLOR.blue"),
  ],
  [
    "event rail updates its existing widget when color changes",
    legacy.includes("createEventSeverityRail") &&
      legacy.includes("updateEventSeverityRail") &&
      legacy.includes("eventSeverityRailColor") &&
      legacy.includes("eventSeverityRail.setProperty") &&
      !/setProperty\(hmUI.prop.MORE, \{ color \}\);\s*createEventSeverityRail/.test(legacy),
  ],
  [
    "watchface uses REM Sync companion bridge",
    appJs.includes("new MessageBuilder({ appId: REM_SYNC_APP_ID })") &&
      messageTypes.includes("306967169") &&
      !app.targets.trex2.module["app-side"] &&
      legacy.includes("REM_STATUS_REQUEST") &&
      legacy.includes("REM_REQUEST_METHOD") &&
      legacy.includes("REM TIMEOUT"),
  ],
  [
    "watchface guards duplicate lifecycle init",
    legacy.includes("let faceInitialized = false") &&
      legacy.includes("if (faceInitialized)") &&
      legacy.includes("faceInitialized = true"),
  ],
  [
    "compass listener is registered once",
    legacy.includes("let compassListenerRegistered = false") &&
      legacy.includes("handleCompassChange") &&
      legacy.includes("if (!compassListenerRegistered)") &&
      legacy.includes("compassListenerRegistered = true"),
  ],
  [
    "old combined compass image is not used",
    !legacy.includes("compass-needle"),
  ],
  [
    "bottom version label is removed",
    !legacy.includes("LEGACY") && !legacy.includes("jumpStatusText"),
  ],
];

const assetGenerator = fs.readFileSync("scripts/generate-assets.mjs", "utf8");
checks.push(
  [
    "heart icon geometry is reduced",
    assetGenerator.includes("M52 115") && !assetGenerator.includes("M52 110 C45 100"),
  ],
  [
    "battery uses a percent suffix without a background icon",
    legacy.includes('unit_en: "images/tactical/battery-percent.png"') &&
      !assetGenerator.includes('<!-- battery -->'),
  ],
  [
    "preview removes last update age wording",
    !assetGenerator.includes("2m AGO"),
  ],
  [
    "generated background omits old gps marker and signal icons",
    !assetGenerator.includes("GPS pin and signal bars") &&
      !assetGenerator.includes("M52 318 C52 303") &&
      !assetGenerator.includes('rect x="49" y="372"'),
  ],
);

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  failed ||= !ok;
}

process.exit(failed ? 1 : 0);
