const fs = require("fs");

const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
const legacyPath = "watchface/trex2/legacy.js";
const legacyExists = fs.existsSync(legacyPath);
const legacy = legacyExists ? fs.readFileSync(legacyPath, "utf8") : "";
const appJs = fs.readFileSync("app.js", "utf8");
const messageTypes = fs.readFileSync("common/messageTypes.js", "utf8");

const checks = [
  ["app version is 1.3.19", app.app.version.name === "1.3.19"],
  ["app version code is 37", app.app.version.code === 37],
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
  ["clock places minutes explicitly", legacy.includes("minute_startX: 239")],
  [
    "clock uses visible colon image",
    legacy.includes('src: "images/time/teko/colon.png"'),
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
    "operator label is renamed",
    legacy.includes('"C0rv0"') && !legacy.includes('"OPERATOR"'),
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
    "watchface uses REM Sync companion bridge",
    appJs.includes("new MessageBuilder({ appId: REM_SYNC_APP_ID })") &&
      messageTypes.includes("306967169") &&
      !app.targets.trex2.module["app-side"] &&
      legacy.includes("REM_STATUS_REQUEST") &&
      legacy.includes("REM_REQUEST_METHOD") &&
      legacy.includes("REM TIMEOUT"),
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
    "battery icon geometry is reduced",
    assetGenerator.includes('width="15" height="27"') &&
      !assetGenerator.includes('width="19" height="34"'),
  ],
  [
    "preview removes last update age wording",
    !assetGenerator.includes("2m AGO"),
  ],
);

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  failed ||= !ok;
}

process.exit(failed ? 1 : 0);
