# REM Tactical for Zepp OS

Tactical digital watch face for the Amazfit T-Rex 2:

This project is the Zepp watch-face companion for [Reticulum Emergency
Management (REM)](https://github.com/FreeTAKTeam/reticulum_mobile_emergency_management).

- Legacy watch-face runtime / API target 1.0.1 (companion app: API 2.1)
- 454 x 454 round display
- Device source 418 (Mainland China)
- Device source 419 (global)
- Live time, heart rate, battery, and compass heading
- Optional live REM connection, operator, team, event, and sync state
- Disconnected altitude and barometric pressure in large left/right readouts
- Smaller, dimmer clock on a black always-on display

## REM compatibility

Live REM status requires the REM Android app, its **Watch Status plugin**, and
the Zepp companion included in this repository:

1. Install [REM](https://github.com/FreeTAKTeam/reticulum_mobile_emergency_management)
   on the phone.
2. Enable the [`watch-status` plugin](https://github.com/FreeTAKTeam/reticulum_mobile_emergency_management/tree/main/plugins/watch-status)
   in REM. It exposes the loopback watch-status endpoint at
   `http://localhost:29863/northbound/watch/status`.
3. Install and configure [REM Sync](rem-zepp-sync-trex2/README.md), then install
   this REM Tactical watch face. REM Sync reads the plugin endpoint and bridges
   the compact status to the watch over Bluetooth.
4. Tap the **REM** name on the watch face to enable the connection. Tap it again
   to switch REM off.

The watch face does not connect directly to the REM Android app. Without the
Watch Status plugin or REM Sync, the face still shows its local compass,
altitude, pressure, heart-rate, and battery data, but it cannot show live REM
operator, team, event, or sync status. The connection starts **off**, survives
screen sleep in the current face instance, and resets to off when the face is
reloaded. If REM is offline or stale, the face returns to its local tactical
blocks.

The disconnected `ALT` and `BAR` values come from native watch data bindings and
do not require REM. Unsupported or missing readings use `--`; example numbers
are never used as real readings. The animated compass and heading remain the
center instrument in both modes and update continuously while the face is awake.
Only the left and right blocks switch content. Tap the center compass to open
the watch's Compass app.

REM Sync uses port `29863` by default. If the Watch Status plugin is configured
to use another port, update `baseUrl` in `rem-zepp-sync-trex2/common/remConfig.js`
before building the companion.

See [battery mode and device checks](docs/battery-mode.md) for supported data,
polling behavior, and the physical-watch verification procedure.

## Set up

From PowerShell in this directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
```

The setup script downloads a portable Node.js 20 runtime into `.tools/` and
installs Zeus CLI locally. It does not modify the system Node.js installation.

## Commands

```powershell
# Compile a package
.\scripts\zeus.ps1 build -t "Amazfit T-Rex 2" --legacy-zpk-name

# Live preview in the Zepp OS Simulator
.\scripts\zeus.ps1 dev

# Generate a QR code for a physical watch
.\scripts\zeus.ps1 preview -t "Amazfit T-Rex 2" --legacy-zpk-name

# Sign in before physical-device preview
.\scripts\zeus.ps1 login
```

For simulator use, install and open the official Zepp OS Simulator and launch
the Device Simulator before running `dev`.

For watch testing, enable Developer Mode in the Zepp phone app, sign in with
the same Zepp account, run `preview`, and scan the generated QR code.

## Release packages

```powershell
npm run release
```

This builds production packages (`debug: false`) of REM Tactical and REM Sync
for the Amazfit T-Rex 2 from temporary copies, so the development manifests and
the retained packages in `dist/` are left unchanged. It writes
`REM-Tactical-<version>-release.zab`, `REM-Sync-<version>-release.zab` and a
`packages.json` record of app IDs, versions, sizes and SHA-256 hashes to
`dist/amazfit-release/`. Pass another directory to keep existing release
packages, for example `npm run release -- .tools/release-check`.

Both manifests already carry the numeric app IDs assigned by the Zepp developer
console. Bump `app.version` in the relevant `app.json` before building a new
release.

## Project layout

```text
app.js                         Application lifecycle
app.json                       T-Rex 2 watch-face configuration
watchface/trex2/legacy.js       Production watch-face implementation
watchface/trex2/index.js        Previous modern runtime implementation (rollback)
common/                         Colors, layout, and replaceable REM status
assets/trex2/                   Background, preview, and icon assets
scripts/generate-assets.mjs     Deterministic tactical dial generator
scripts/generate-tactical-assets.mjs  Disconnected/AOD glyphs
scripts/render-tactical-preview.mjs  Layout previews using sample data
scripts/setup.ps1               Reproducible Windows tool setup
scripts/zeus.ps1                Zeus CLI wrapper using portable Node.js
```

## References

- https://docs.zepp.com/docs/guides/quick-start/environment/
- https://docs.zepp.com/docs/guides/tools/cli/
- https://docs.zepp.com/docs/reference/related-resources/device-list/
- https://docs.zepp.com/docs/guides/tools/zepp-app/
