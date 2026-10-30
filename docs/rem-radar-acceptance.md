# REM radar acceptance

This checklist preserves the full boundary of [issue #2](https://github.com/FreeTAKTeam/rem-tactical-trex2/issues/2), including the user's subsequent interface decisions. A working build or UI does not establish every release gate. Current versions are REM Sync **0.1.31**, Watch Status **1.1.3** and REM Tactical **1.3.29**.

## Requirements and evidence

| Requirement | Current evidence | Remaining check |
| --- | --- | --- |
| Full 454 × 454 mini app; status remains separate; no failed shared-storage path | App ID 1117630, compiled radar/status pages and legacy runtime verification; app installed | None for architecture |
| Fixed center arrow/cone; compass and markers rotate from the watch | Geometry/cardinal/wrap fixtures; user accepted native rotation in 0.1.29 | Characterize axis, tilt, calibration and reference; no directional-accuracy claim |
| Unverified compass is usable with an honest warning | Explicit user approval; amber pointer and WRIST warning; invalid readings freeze | True-north conversion is not asserted |
| Read-only bounded REM source, existing observer and visibility owner | Native plugin uses observer → nearby(500 m, 50) → same observer, recomputes geometry and rejects changed context | Current live source/foreground/background observations |
| Authenticated, opt-in, persistent loopback radar pairing | Native disk-backed HTTP restart, 30-day/clock-reset and revocation tests; actual MessageBuilder source/service restart and native-port recovery tests; user-confirmed live recovery after REM restart and full phone reboot on Watch Status 1.1.4 / REM Sync 0.1.32 | Live explicit revocation/re-pairing on the updated paired path |
| Exact source identities, NATO colors and safe labels | Canonical symbol mapping; source/color tests; 50-marker native projection through real phone decoder and MessageBuilders; colors unchanged on stale/disconnect | Independent native source-affiliation check |
| Atomic bounded snapshots and reassembly | 64 KiB ceiling, 2,000-byte fragments, four partial-message slots, fixed expiry and replay bounds; complete 50-marker contract takes seven response fragments and one atomic application | Physical maximum-payload latency and memory |
| Generous tap targets and physical UP/DOWN → SELECT | Radar targets and 324 × 76 px candidate rows; user confirmed both selection methods on 0.1.30 | Native crowded-list paging and removal-during-press case |
| Stable selection, full-screen details, predictable Back | Reducer, page and renderer tests for removal/reorder, Back/reopen and canceled presses; user exercised Back between selection methods | Native removal/crowded edge cases |
| Larger text; vertical panels without small action buttons | Four marker panels, four Connection panels and five status panels; 22 renders; user checked all four marker panels as readable/unclipped | Native status/Connection longest values if encountered |
| Full-screen radar without operational text | Native scene has only cardinal/range text; colors carry connection/heading/source warnings | None beyond existing native visual check |
| Lost connection retains colors and last data; denial clears | State/controller/transport tests; grey disconnected arrow and amber stale warning | Separate Bluetooth, REM and Zepp interruption/recovery |
| Observer position, marker, snapshot generation and receipt ages stay distinct | Timestamp preservation, skew tests and monotonic-clock fallback; unknown remains unknown | Identify firmware clock support; compare source and reception under phone lock |
| Keep the app awake and restore normal timing on exit | 0.1.30 idle test failed; 0.1.31 page hold/renewal and App restoration pass 124 tests; user confirmed 90-second hands-off flat-watch test stayed on | Normal timeout after exit and separate wrist/palm/manual sleep paths |
| Linear radar scale, edge cases and bounded source | Geometry fixtures cover the 500 m edge, 250/500 m rings, out-of-range exclusion, coincident points, poles/date-line/antipodes and 50-marker source limit | Native edge/source-limit observation |
| Responsiveness and bounded widget work | Pooled marker/document widgets, unchanged-frame suppression, 124 companion tests, local work-count report | Measured native latency with five and 50 markers |
| Cleanup and interruption lifecycle | Lease ownership, cancellation, generation/late-callback, fragment and display cleanup tests | Physical pause/resume cycles and service restarts |
| No new backend, custom BLE, marker edits or extra grants | Changes stay in the two approved repositories and existing source/transport; phone holds the bearer | None for scope |
| Installable app and watch-face launcher | Both native packages installed; user verified launcher; app QR independently decoded; installed 0.1.31 compiled files match QR package | None for delivery; development QR is time-limited |
| Power/stability and numeric release thresholds | No crash/latency/battery claim inferred from local tests | Agree tolerances after baseline; compare 30–60 minutes against baseline |

## Paired-device sequence

1. Record app/plugin versions and whether the current view is live or explicit demo. Do not use demo contacts as evidence of REM delivery.
2. Check native marker tap, BACK, UP/DOWN and SELECT. Read the four marker panels and Connection/status pages. For naturally overlapping source points, page the chooser, open a row and return. Keep source editing in REM.
3. Leave the app untouched for 90 seconds. Record whether it stays visibly awake, open and connected. Exit the app and confirm normal watch timeout returns. A screenshot command alone does not establish uninterrupted screen-on time.
4. Capture Connection/Position/Wrist data before locking the phone. Keep DEMO and REM data distinct. With the phone locked and REM backgrounded, observe source age and reception separately; unknown clock data cannot establish freshness. Restore the phone and verify one complete fresh snapshot recovers. Then record a release decision: whether aged data is acceptable, or fresh locked-phone location requires a separately authorized lifecycle change.
5. Interrupt and restore Bluetooth, REM and Zepp separately. Confirm grey/disconnected indication, unchanged source colors and explicit ages/unknown states. Check that recovery cannot apply an older sequence or retired session. Test permission denial separately from temporary transport loss.
6. Measure the native five-marker baseline and maximum supported payload. Record request-to-render and source-to-watch latency separately. The controlled software contract's 12,178-byte response is not a physical-radio timing result.
7. Agree heading-error, latency and battery tolerances from the baseline, then run a 30–60 minute comparison with repeated resume cycles. Record battery start/end, duration, crashes and conditions. Do not infer all-day battery or navigational accuracy.

The loopback probe must not read phone-only credentials or print precise coordinates. Keep native telemetry screenshots in ignored private storage. The current machine-readable evidence is in `dist/rem-radar-ui/device-acceptance-0.1.31.json` (and the preserved 0.1.30 failure record), `integration-verification-0.1.30.json`, `bridge-build-verification-0.1.30.json` and `source-contract-verification.json`.
