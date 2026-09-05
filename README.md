# REM Tactical for Zepp OS

Tactical digital watch face for the Amazfit T-Rex 2:

- Legacy watch-face runtime / API target 1.0.1 (companion app: API 2.1)
- 454 x 454 round display
- Device source 418 (Mainland China)
- Device source 419 (global)
- Live time, heart rate, battery, and compass heading
- Optional live REM connection, operator, team, event, and sync state
- Disconnected altitude and barometric pressure in large left/right readouts
- Smaller, dimmer clock on a black always-on display

## REM compatibility

REM starts **off**. Tap the **REM** name to connect through the installed REM Sync
companion; tap it again to switch REM off. The choice survives screen sleep in
the current face instance and resets to off when the face is reloaded. Fresh
connected responses show the REM event and operator/team blocks. Off, offline,
error, and stale states show the tactical/environment blocks instead.

The disconnected `ALT` and `BAR` values come from native watch data bindings and
do not require REM. Unsupported or missing readings use `--`; example numbers
are never used as real readings. The animated compass and heading remain the
center instrument in both modes and update continuously while the face is awake.
Only the left and right blocks switch content. Tap the center compass to open
the watch's Compass app.

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

Before publishing, replace the placeholder `app.appId` in `app.json` with the
numeric app ID assigned by the Zepp developer console.

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
