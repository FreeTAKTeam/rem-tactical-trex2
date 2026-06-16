# Legacy Compass Runtime Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move REM Tactical onto the same legacy watchface runtime pattern that the working CBF compass reference uses, so `hmSensor.id.COMPASS` is available on T-Rex 2.

**Architecture:** Keep the current modern `watchface/trex2/index.js` as rollback source, and add `watchface/trex2/legacy.js` as the active watchface module. The legacy file uses global `WatchFace`, `hmUI`, `hmSensor`, and image assets directly, matching the reference face’s execution model.

**Tech Stack:** Zepp OS watchface, Zeus CLI 1.9.1, legacy `hmUI`/`hmSensor` runtime, PowerShell/Node verification.

---

### Task 1: Add Legacy Runtime Contract Check

**Files:**
- Create: `scripts/verify-legacy-runtime.cjs`

- [ ] **Step 1: Write the failing structural test**

```js
const fs = require("fs");
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
const legacyPath = "watchface/trex2/legacy.js";
const legacyExists = fs.existsSync(legacyPath);
const legacy = legacyExists ? fs.readFileSync(legacyPath, "utf8") : "";

const checks = [
  ["app targets API 1.0.1", app.runtime.apiVersion.target === "1.0.1"],
  ["active module is legacy", app.targets.trex2.module.watchface.path === "watchface/trex2/legacy"],
  ["legacy entry exists", legacyExists],
  ["legacy entry uses hmUI", legacy.includes("hmUI.createWidget")],
  ["legacy entry uses hmSensor compass", legacy.includes("hmSensor.createSensor(hmSensor.id.COMPASS)")],
  ["legacy entry avoids @zos imports", !legacy.includes("@zos/")],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  failed ||= !ok;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-legacy-runtime.cjs`
Expected: FAIL for missing legacy entry and active module/runtime.

### Task 2: Implement Legacy REM Watchface

**Files:**
- Create: `watchface/trex2/legacy.js`
- Modify: `app.json`

- [ ] **Step 1: Create `legacy.js`**

Implement a minimal REM layout with existing assets, `hmUI` widgets, `hmSensor` time/heart/battery/compass sensors, and a transparent button over the heading.

- [ ] **Step 2: Switch `app.json`**

Set version to the next release, set runtime API to `1.0.1`, and point `targets.trex2.module.watchface.path` to `watchface/trex2/legacy`.

- [ ] **Step 3: Run structural test**

Run: `node scripts/verify-legacy-runtime.cjs`
Expected: PASS.

### Task 3: Build and Produce QR

**Files:**
- Generated: `dist/REM-Tactical-<version>-install-QR.png`
- Generated: `dist/REM-Tactical-<version>-preview-url.txt`

- [ ] **Step 1: Build**

Run: `.\scripts\zeus.ps1 build -t "Amazfit T-Rex 2" --legacy-zpk-name`
Expected: exit 0.

- [ ] **Step 2: Preview and render QR**

Run Zeus preview with the local QR capture hook, then render a PNG QR from the captured URL.
Expected: preview URL captured and PNG exists.
