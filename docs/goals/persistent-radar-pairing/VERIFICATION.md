# Persistent radar pairing verification

Verified on 30 October 2026 in the two authorized repositories.

## Delivered behavior

- Watch Status **1.1.4 / code 6** is installed on the connected Android phone. It privately saves the 256-bit pairing credential without a time limit and excludes preferences from cloud backup and device transfer.
- REM Sync **0.1.32 / code 33**, app ID **1117630**, is installed on the T-Rex 2 through Zepp Bridge. Bridge reported successful installation, and Zepp's installed app list independently displayed 0.1.32.
- The upgrade's one-time pairing was saved through Zepp's real settings UI. The credential was read and entered entirely on the phone; it was not copied to the host or written into this report. Bridge logging was closed before pairing.
- The user confirmed the watch connects and shows live radar data.
- REM was then stopped and relaunched through its resolved Android launcher. The user confirmed the watch reconnected automatically without another code or pressing Reconnect.
- The user subsequently performed a full phone reboot and confirmed the result was OK. Persistent pairing and automatic reconnection after a full phone reboot are therefore user-verified on the installed phone/watch pair.

## Persistence and authorization evidence

- Terminating the Watch Status process caused Android/REM to restart it. Its private preferences checksum remained identical before and after process recreation.
- The same preferences checksum also survived stopping and relaunching REM. No pairing settings were changed during these checks.
- On-phone endpoint checks before the REM restart returned health HTTP 200, missing-bearer HTTP 401 and `Cache-Control: no-store`. Health returned 200 again after the REM restart. These probes read no protected coordinates or credential.
- Temporary ADB forwards created for these checks were removed.

## Software checks

- **22 native tests** passed, including real HTTP with a disk-backed credential across new source instances and elapsed-clock reset; pairing after 30 days; explicit revocation/replacement; runtime suspension; and late success/permission failure across restart and replacement.
- **1 plugin configuration UI test** passed for persistent pairing state, replacement and forgetting through the trusted host channel.
- **127 companion tests** passed, including both actual MessageBuilders with source restart, transient 503 recovery, a recreated phone service and changed native port 31 to 47, no watch reopen, no sent-request replay, retired-source rejection and stale concurrent deadlines.
- **66 root regression tests** passed, including both bridge lifecycles and the user's existing watch-face work.
- Android plugin tests/APK build and the legacy Zepp native build passed. Nested package inspection verified app 1117630, version/code 0.1.32/33, runtime target 1.0.1, device sources 418/419, compiled radar/status pages, Side Service and settings.
- The existing controlled native 50-marker contract passed through the real phone decoder and seven MessageBuilder fragments with all five source colors, source times and accuracy preserved.
- Both repository diffs passed whitespace checks. Native production source files remain at most 180 lines.
- PRE, POST, correctness and maintainer reviews found no remaining material issue after the restart/race corrections.

## Retained packages

- `dist/REM-Watch-Status-Radar-1.1.4-debug.apk`: SHA-256 `a6bc79843162b191d4108f84af19e4ef4eaac8125c6b720c10a864353557a6e4`.
- `dist/REM-Sync-0.1.32.zab`: SHA-256 `163f7568bc0383d31d17275c608d54836c148b7b5482ebc1617f0d6bdb4f4668`.
- `dist/REM-Sync-0.1.32-bridge.zab` retains the device-install build separately. Existing accepted release packages were preserved.

## Full phone reboot

The user completed the full phone reboot test and reported success on 30 October 2026. This supplements the recorded process-recreation and REM-restart checks. The agent did not initiate the phone reboot. These observations verify this installed phone/watch pair; they do not establish startup behavior for other Android devices or configurations.

Unrelated dirty/untracked work was preserved in both repositories. This task created no branch or worktree; existing cleanup candidates were retained because their active-chat ownership and safety gates were not established. No app-store release was published.
