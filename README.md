# REM Tactical for Zepp OS

Tactical digital watch face for the Amazfit T-Rex 2:

- Zepp OS / API level 2.1
- 454 x 454 round display
- Device source 418 (Mainland China)
- Device source 419 (global)
- Live time, heart rate, battery, and compass heading
- Mock REM connection, GPS fix, operator, team, and sync state
- Reduced always-on display

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
watchface/trex2/index.js        Live watch-face implementation
common/                         Colors, layout, and replaceable REM status
assets/trex2/                   Background, preview, and icon assets
scripts/generate-assets.mjs     Deterministic tactical dial generator
scripts/setup.ps1               Reproducible Windows tool setup
scripts/zeus.ps1                Zeus CLI wrapper using portable Node.js
```

## References

- https://docs.zepp.com/docs/guides/quick-start/environment/
- https://docs.zepp.com/docs/guides/tools/cli/
- https://docs.zepp.com/docs/reference/related-resources/device-list/
- https://docs.zepp.com/docs/guides/tools/zepp-app/
