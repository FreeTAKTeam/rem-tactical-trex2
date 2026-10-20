# REM RADAR: T-Rex 2 app UI

## Authorized integration continuation

The user approved work in exactly `FreeTAKTeam/rem-tactical-trex2` and `FreeTAKTeam/reticulum_mobile_emergency_management`. This continuation supersedes the original UI-only prohibitions on those repository edits and its provisional transport boundary; historical verification below remains a record of that increment.

| Task | Owner / allowed files | Output and acceptance |
| --- | --- | --- |
| Protected source | Main; REM `plugins/watch-status/android` and plugin documentation | API 1.3 read grants, opt-in loopback radar route, expiring scoped session, bounded HTTP and asynchronous host requests; auth/lifecycle/geometry tests and APK build. |
| Phone adapter | Main; watch companion app-side, settings, radar common/tests | Phone-owned loopback origin and bearer, correlated request and generation checks, bounded payload, no watch-supplied destination or secret; tested complete source response to MessageBuilder. |
| Watch integration | Main; radar page/common/tests, app permissions | One poll at a time, atomic session/sequence acceptance, honest ages, local legacy compass availability/reference handling, no phone-heading fallback; lifecycle tests and Zeus build. |
| Review and acceptance | Read-only review roles; main fixes | Correctness, maintenance and verification gates. Device validation remains required for true heading, firmware rendering, phone lock/background, BLE, power and physical buttons. |

The native plugin uses current `map.observer.snapshot`, brackets `map.markers.nearby` with the same local observer fix, and recomputes geometry from returned coordinates. This is a bounded best-effort source snapshot; the host does not offer an atomic combined operation. No operational-status peer position is substituted. Following the user's device review, plugin 1.1.2 resolves REM's exact NATO catalog IDs to friendly blue, hostile red, neutral green and unknown yellow; all other symbols retain generic `0x64beff`. Names and arbitrary symbol substrings never imply affiliation. Unknown marker `updated_at` remains unknown; 50 results indicates the source limit rather than a proven total count.

Radar access defaults off. A trusted configuration page issues a separate 256-bit read session with an eight-hour maximum lifetime; only the Zepp phone settings hold its bearer. Snapshot session IDs are independent of credentials. Each HTTP success requires fresh host authorization. Current REM enforces changed grants on the next request, with no proactive grant-change event: `PermissionDenied` revokes the session and clears watch contacts. Host/settings/service generations invalidate in-flight successes as well as credentials. Transient transport failures retain an aged snapshot. Existing status routes remain compatible. Host grants and publisher trust remain operator controlled.

The user's second visual correction removes operational text overlays from the radar. A grey central arrow/cone means disconnected; amber means stale position or unavailable/unverified heading; healthy data with verified heading uses the orange pointer and teal cone. REM marker fills retain their source meaning. Tap the center for a separate connection/age screen. A dotted rim identifies explicit demo mode and three amber dots identify a source-limited snapshot.

This is the UI-first increment of [issue #2](https://github.com/FreeTAKTeam/rem-tactical-trex2/issues/2), requested on 20 October 2026. It extends the **REM Sync Zepp mini app**. The radar is its launch page; **REM STATUS** still opens the existing operational-status page. The user subsequently authorized a narrow watch-face change: REM Tactical 1.3.29 launches the radar when its central compass is tapped.

Current candidate: **0.1.30**, with Watch Status plugin **1.1.3** installed. Bridge installed app **0.1.29** and watch face **1.3.29**. The user confirmed the face's compass launches the full app and that the radar labels rotate while the center arrow stays fixed, then accepted the radar. The current increment improves marker selection/details and enlarges text throughout the mini app. Its package and installation QR are ready; Bridge currently reports no online app, so 0.1.30 is not claimed installed. The updated Android plugin was installed and independently verified before creating this watch-app QR, as requested.

The user explicitly chose rotation from valid watch-compass readings while retaining an amber warning and “North reference unverified” on WRIST. This supersedes the older frozen-reference policy recorded below. Invalid/calibration readings still freeze orientation. No magnetic declination conversion, verified true-north alignment or trustworthy firmware reception clock is claimed.

Historical checkpoint sections below describe evidence captured at that time. A direct root Zeus build later cleared the shared `dist` directory. Current packages, QRs, scene renders and source-contract reports have been restored or regenerated; earlier checkpoint package and proof copies are no longer retained there. Source files and private device captures under `.tools` survived. The current build wrapper and recovery checkpoint below supersede older retention statements.

## Execution boundary

| Field | Decision |
| --- | --- |
| Goal | Implement the T-Rex 2 radar app UI first. |
| Plan | Issue #2, with the user's explicit UI-first order. |
| Intent | A reviewable native radar, full-screen details, honest empty/failure states and selection. |
| Truth owner | REM owns contacts, visibility, marker colours and observer freshness. Watch-local compass owns eventual wrist heading. |
| Contract boundary | `common/radar/state.js` accepts bounded complete **fixture snapshots**. This is not a finalized transport contract or an existing radar endpoint. |
| Cutover | `page/radar/index` becomes the mini-app entry point. Existing `page/status/index` remains accessible. |
| Displaced path | Status remains the operational-status view; it does not become a source of fabricated radar contacts. |
| Acceptance evidence | Native widget tests, round-screen render fixtures, interactive browser checks, and a Zeus package build. |
| Kill criteria | Stop any live-data claim if source age, heading reference or real device transport is unproven. |
| Forbidden moves | No watch-face changes, fabricated live markers, API-3 canvas/Compass import, new backend, unprotected location endpoint, REM permission changes, or sibling-repository edits. |

## Task board

All implementation is owned by the main agent. Explorer and review agents are read-only.

| Task | Input / output | Allowed files | Evidence | Dependency |
| --- | --- | --- | --- | --- |
| Geometry and state | Issue fixtures → heading-up projection and bounded state | Mini-app `common/radar`, `test/radar-*` | Cardinal, wrap, stale, selection and contract tests | None |
| Native views | Shared scene → API 2.1 widgets, input and Back | Mini-app `page/radar`, `common/radar/widgetRenderer.js`, radar assets, mini-app manifest | Widget and page-lifecycle tests, Zeus build | State |
| Review surface | Same native scene → interactive preview and PNGs | `preview/radar`, `scripts/*radar*`, package scripts | Rendered screenshots, browser interactions | Views |
| Integration gate | UI evidence → device and authenticated-source work | Documentation only in this increment | Pending device/source evidence is explicit | UI review |

Watch-face files, the pre-existing root README edit, secrets and other repositories are outside this increment. Native implementation tasks are sequential. Read-only review is safe in parallel.

## Initial UI behaviour (historical checkpoint)

- At launch, **REM NOT CONNECTED** and **No radar snapshot received** appear, with an instruction to hold the wrist flat and point the watch forward. **TRY DEMO** is opt-in. Demo contacts and heading always retain the **DEMO** label.
- One 500 m range uses a linear scale and 250 m/500 m rings. The upward orange triangle and viewing cone stay fixed. Cardinal labels and marker positions rotate by minus the accepted true heading.
- Tap a contact to open full-screen details. Nearby hit targets use a 48 px diameter. Overlapping contacts open a candidate list with up to three 55 px rows per page; **MORE MARKERS** reaches every candidate.
- Details show exact marker colour, name, distance, true bearing, wrist heading, observer age, marker age and reception age. Unverified notes are not copied into state or displayed.
- Back/right-swipe closes details or the candidate list. Back from demo clears its contacts and timer; Back at the initial screen follows the system default. Four-button mapping still requires hardware verification.
- Transient loss retains the snapshot and its original colours. A separate outline and warning show stale/disconnected state. Unknown source times stay unknown. Permission denial clears contacts. Selection uses stable IDs and becomes unavailable if the marker disappears or leaves range.
- Fifty marker slots are pooled. Identical widget properties skip redraw. The demo timer and input registrations are removed on page destruction. No production radar polling or sensor work starts in this increment.

## Run and inspect

Use Node 20. On this Windows checkout the portable runtime is `.tools/node-v20.19.5-win-x64/node.exe`.

```powershell
npm run radar:assets
npm run radar:preview
npm run radar:render
```

Open `http://127.0.0.1:4782/preview/radar/`. The preview serves only its own files, the radar modules and radar assets over loopback. It renders the same `radarScene` descriptions as the mini app, with browser-rendered text as an approximation of firmware fonts.

Use the condition selector, wrist-heading slider and quarter-turn buttons. Tap the display's contact dots, inspect details, press Back, age the snapshot and inspect crowded contacts. The preview's Status action explains the device route; the **native** action opens the real existing status page.

`npm run radar:render` writes 22 round 454 × 454 fixture PNGs to `dist/rem-radar-ui/`, a three-screen review image to `dist/REM-Radar-UI.png`, and the marker-interface review to `dist/REM-Marker-UI.png`.

Run the two existing test suites separately, from their respective directories:

```powershell
# Repository root: existing watch-face/bridge regression tests
node --test test

# rem-zepp-sync-trex2: companion and new radar tests
node --test test
node scripts/run-zeus.cjs build -t "Amazfit T-Rex 2"
```

The Zepp package remains app ID **1117630**, currently **REM Sync 0.1.30** (code 31), with device sources **418 and 419**. It is an app package using legacy API 1.0.1, with the existing BLE Side Service and both radar/status routes. Package output is in `rem-zepp-sync-trex2/dist/`; the retained copy is `dist/REM-Radar-0.1.30.zab`.

## Integration gates still open

The user accepted radar rotation in 0.1.29. Local software evidence and that acceptance do not establish every original hardware gate:

1. Native touch rows, physical buttons, larger firmware fonts and vertical scrolling in 0.1.30 still need an installation/device check. The browser uses the same scenes but approximates firmware fonts and input.
2. Plugin 1.1.3 is installed against the actual REM signer and its Renew action completes; pairing was saved in Zepp. A controlled 50-marker native-to-watch transport artifact preserves all five source colors. Live marker affiliations and freshness across phone lock/background transitions still need independent device evidence.
3. Valid watch readings rotate the radar under the user-approved warning policy. Calibration, north reference/declination, the firmware reception clock and navigation accuracy remain unverified. Phone heading is never substituted.
4. Screen-timeout suppression, stale/reconnect behavior, battery and sustained 50-marker performance remain physical checks. The wall-clock fallback deliberately reports unknown ages.

At the initial UI checkpoint no Android or REM files had changed. The two-repository continuation above subsequently authorized the REM plugin implementation. No third repository is included.

## Verification record, 20 October 2026

- Companion suite: **60 passed**. Original repository suite: **63 passed**. Legacy runtime verification and `git diff --check` pass.
- Native Zeus build: **passed**, API 2.1, app ID 1117630, version 0.1.20, both device sources. Nested package inspection verifies `appType: app`, compiled radar/status pages, radar assets and the existing Side Service.
- Reviewable UI baseline: `dist/REM-Radar-UI-0.1.20.zab`, originally built as `1117630-REM_Sync-0.1.20-20261020080925.zab`. SHA-256 and archive checks are recorded in `dist/rem-radar-ui/verification.json`. Zeus replaces its working output on subsequent builds; the root `dist/` baseline copy is retained.
- All **13** render conditions inspected through the browser; **8** browser interaction checks pass, including marker details, crowded selection, touch Back, quarter turns, stale observer, setup pose and explicit demo entry. The 390 px preview has no horizontal overflow.
- Correctness/maintenance review fixes: align ring radii with 250/500 m labels, reset heading smoothing across geographic references, preserve the source-limit indicator during selection, and update obsolete mini-app README instructions.
- Physical-device and real-source acceptance remain open. The full issue is not marked complete by these local checks.

Cleanup audit: the checkout has one worktree. `codex/rem-radar-ui` is retained for this active implementation. The older merged `codex/legacy-compass-watchface` and `codex/rem-watch-status-sync` are cleanup candidates, retained because active/pinned chat ownership was not established and this checkout contains the user's pre-existing README edit. No branches or worktrees were deleted. `git fetch --prune origin` completed for this repository only.

## Watch-repository continuation: bounded transport

The preceding UI verification record remains the baseline. The next authorized task from issue #2 is to harden the existing Zepp fragment transport, within this repository while approval for REM changes is pending.

| Field | Current continuation |
| --- | --- |
| Owner / input | Main agent; issue #2's bounded reassembly requirement and the existing 2,000-byte MessageBuilder wire format. |
| Allowed files | Companion `shared/reassembly.js`, `shared/message.js`, timer polyfill and Side Service teardown; shared test harness and transport tests; companion version and documentation. |
| Cutover | Remove the old unbounded inline Session/SessionMgr implementation. The companion has one bounded reassembly owner. |
| Contract | Preserve existing trace/span/sequence headers. Application snapshot IDs and source/session sequencing remain a separate pending adapter boundary. |
| Evidence | Actual producer/consumer MessageBuilder bytes, shuffled/duplicate fragments, atomic reducer application, rejection/expiry bounds and a native package build. |
| Forbidden moves | No sibling checkout access, invented radar endpoint, live-source claims, or watch-face code changes. |

The transport caps each complete message at 65,536 bytes and each fragment at 2,000 bytes, with at most 64 fragments and four concurrent incomplete messages. The fixed ten-second deadline does not extend with duplicate/trickled data. Completed and expired trace/span identities have a bounded sixteen-entry replay window; final snapshot ordering still requires application session/sequence checks. Complete payloads are assembled once; incomplete buffers and timers are released on failure, request timeout, disconnect and Side Service destruction. Native timer handle zero is valid and is now cancelled correctly.

The local transport test uses the actual MessageBuilder implementations at both ends to fragment a 50-marker snapshot with Unicode, deliver frames in reverse order with duplicates, and pass exactly one complete snapshot to the reducer. This is deterministic local data-path evidence. It does not establish Android source validity, loopback availability, Bluetooth behaviour, compass parity or hardware acceptance.

The user subsequently approved work in exactly the watch repository and `FreeTAKTeam/reticulum_mobile_emergency_management`. The REM source/plugin integration is now authorized. No other sibling repository is included.

## Full-screen radar revision

The user's browser review requested the whole round screen for the radar and removal of the watch-screen REM RADAR title. The dial now covers 454 x 454 at (0, 0), with a 208 px drawable radius, fixed center (227, 227), outer tick marks at the screen edge and labelled half/full-distance rings. There is no brand header or reserved footer. Connection, age, selected marker and heading are compact overlays inside the radar. Edge-marker touch targets and contact selection beneath overlays remain active; Back exits demo mode.

The user's open browser preview was refreshed and checked at the same 270-degree stale-position condition. Screenshot: `dist/rem-radar-ui/browser-fullscreen.png`. This revision is included in the 0.1.22 native package, alongside the bounded transport changes. The mini-app suite now has 72 passing tests, including asynchronous reply suppression across disconnect/reconnect and full-screen edge selection.

## Integration evidence: 0.1.23

- The requested radar correction is in the native scene: grey arrow/cone when disconnected, amber for stale/unverified data, original contact fills, no status/age/heading/name overlays. Only compass letters and range scales remain. Ages, source count and status live on a separate Connection screen. Details/candidates include a Connection action so dense or coincident contacts cannot block access to controls.
- Companion **89 tests**, original repository **63 tests**, native plugin **16 tests** pass. The REM 500-line source/class gate passes. Native APK and Zeus app builds pass, and nested archive inspection confirms an API 2.1 **app** with ID 1117630, sources 418/419, radar/status binaries, Side Service, Zepp settings and grey/warning assets.
- `scripts/verify-radar-source.mjs` verifies the actual Java mapper's controlled 50-marker Unicode artifact through the phone codec and the real MessageBuilders at both ends. Seven shuffled/duplicated response fragments yield one complete watch-state application; source timestamps and canonical `#64beff` remain intact. This is software-contract evidence, not live REM or physical BLE proof.
- Review fixes include asynchronous response suppression after disconnect/restart, demo-to-source state reset, one shared reception-clock epoch, queued timer invalidation, guarded source sessions and removal of the displaced native correlation helper. No watch-face source change was required.
- Correctness, maintenance, independent verification and POST plan review are aligned after those fixes. There are no open local code-review findings; the physical acceptance gates below remain required.
- Reviewable outputs are `dist/REM-Radar-0.1.23.zab` and `dist/REM-Watch-Status-Radar-1.1.0-debug.apk`. The APK is a local test build with an empty REM host certificate allowlist and cannot bind until rebuilt with the actual signer; no trust check was bypassed. Hashes/package checks are in `dist/rem-radar-ui/integration-verification.json`; source-chain evidence is in `source-contract-verification.json`.
- The user's actual browser preview was checked for the grey disconnected state and the details-to-Connection path. Current captures are `browser-grey-disconnected.png` and `browser-connection-info.png`. Thirteen fixture renders are regenerated from the same native scene.
- The legacy mini-app compass is implemented with feature detection, zero-ID support, calibration handling, a five-Hz update cap and generation-safe cleanup. Its north reference remains unverified, so it cannot rotate true-bearing contacts yet. The clock uses `performance.now` only when available; the unsupported API 2.1 wall-clock fallback does not claim reliable ages. Physical firmware checks must resolve both gates.
- ADB reports no attached devices. Phone loopback/trust/grants, locked/background source freshness, BLE delivery, compass reference/axis/calibration, reception clock, physical controls, firmware text/touch metrics and battery/stability remain unproven. The user has been asked about a paired test device; issue #2 remains open.

Final hygiene audit: both current `codex/rem-radar-ui` and `codex/rem-radar-plugin` branches contain this active uncommitted work and are retained. REM's other three worktrees are unrelated and were not entered or changed. Other merged Codex branch candidates are retained because active/pinned ownership was not established. No branch/worktree deletion was safe. The watch root README edit and REM's pre-existing `.desloppify/`, vendor directory and `scorecard.png` are preserved.

## Integration evidence: 0.1.24

- Observer horizontal accuracy now survives the native mapper, phone decoder, fragmented transport and watch state. Missing accuracy stays unknown. Negative or nonfinite accuracy is rejected; observer bracketing compares accuracy as well as identity, coordinates and timestamp. Accuracy appears only on the separate Connection and marker details screens.
- Compass smoothing resets after an actual gap of more than two seconds or a reception-clock rollback. Continuous unchanged callbacks keep the smoothing baseline. Unverified compass reference remains an explicit hardware gate.
- Companion **92 tests** and native plugin **18 tests** pass; the original repository's **63-test** regression baseline is unchanged. The native plugin and Zeus app build successfully. The 50-marker source-contract check preserves accuracy and timestamps through seven response fragments and one atomic application.
- The retained app package is `dist/REM-Radar-0.1.24.zab`, version code 25, app ID 1117630, device sources 418/419. The local plugin is version 1.1.1, code 3. Package hashes and installation status are recorded in `dist/rem-radar-ui/integration-verification.json`; the previous checkpoint is retained as `integration-verification-0.1.23.json`.
- The phone's installed REM 1.5.4 signer was verified from its APK, and the plugin was rebuilt and tested with that public fingerprint in its host allowlist. After the user enabled USB installation, Android installed Watch Status **1.1.1 / code 3** successfully. Package-manager queries independently verify that version and discover its `PLUGIN_V1` service. The APK is also in the phone's Downloads folder with a matching SHA-256. No trust bypass is used.
- Only after that installation verification, the official Zeus preview flow generated the **REM Sync 0.1.24 / code 25** installation QR. The retained preview package contains the radar/status binaries, Side Service and settings, with app ID 1117630 and sources 418/419. The PNG is `dist/REM-Radar-0.1.24-Install-QR.png`; independent QR decoding verifies its `zpkd1` installation payload on the official Zepp host. It expires **27 October 2026 at 09:35:17 America/Halifax**. The previous development package remains `dist/REM-Radar-0.1.24-development.zab`.
- Scan in Zepp's paired T-Rex 2 Developer Mode. Actual watch installation, plugin publisher approval/read grants and the remaining physical acceptance matrix are still pending. The QR and package builds do not establish a live radar connection.

## Device integration continuation: 0.1.25

- REM's actual settings screen now reports Watch Status 1.1.1 **Running**, with operational-status, local-position and nearby-marker read grants selected. An ADB-forwarded `/health` request returns HTTP 200. Enabling radar and saving its trusted configuration creates an eight-hour read session; a request without its bearer returns HTTP 401. This verifies the phone endpoint and its denial boundary, not Zepp loopback or Bluetooth snapshot delivery.
- Zepp's Mini Program list now confirms installation of REM Sync **0.1.25**, matching the user's watch-installation report. Developer Bridge is connected. Earlier screenshots captured other watch screens, so native radar rendering is not yet proven by those captures.
- Live logs show package 1117630 sending a MessageBuilder handshake for development ID 306967169. Git history confirms that development ID matched the old manifest when introduced in `87b40a2b`, but the release manifest changed to 1117630 in `cfdfec06`. The companion now follows Zepp's documented API-2-compatible pattern, reading `getPackageInfo().appId` at each app creation. The root watch-face bridge is unchanged. The old source-text assertion requiring the obsolete constant is displaced by lifecycle tests against the manifest and a remapped runtime ID.
- Companion **92 tests** pass, the native build succeeds and the narrow correctness review has no findings. The 0.1.25 / code 26 update's Bridge installation reported failure after the phone's developer target went offline; the user subsequently installed the update and Zepp independently lists 0.1.25. The corrected physical handshake remains pending.
- The actual Zepp settings WebView renders the radar controls. The phone clipboard supplied a valid 64-character code without logging its value; enabling Connect radar and saving produced **Saved. Open the radar on your watch.** This proves the settings interaction, not an authorized snapshot or Bluetooth delivery.
- After the user opened the paired app, Bridge logs showed repeated `REM_RADAR_SNAPSHOT` requests and `rem.radar.response` replies. A native T-Rex 2 screenshot at **13:29:09 UTC** renders six source markers, the full round radar, cardinal/range labels and an amber central pointer with no title or operational text. This establishes the actual REM → plugin → Zepp → watch rendering path. The heading reference and clock/freshness gates remain open; the capture does not establish heading-up correctness. A later native operational-status capture independently shows runtime version 0.1.25; that private status image is kept out of public artifacts.
- The official 0.1.25 QR is `dist/REM-Radar-0.1.25-Install-QR.png`, independently decoded and matched to the preview version. Its retained package is `dist/REM-Radar-0.1.25.zab`; the QR expires **27 October 2026 at 10:16:40 America/Halifax**. Previous checkpoint proof is retained in `integration-verification-0.1.24.json`. Current proof records partial runtime evidence and keeps full hardware acceptance false.

## Compass runtime correction: 0.1.26

The physical 0.1.25 Connection Details capture at **13:32:57 UTC** shows seven markers, 100 m observer accuracy, **WATCH CLOCK UNVERIFIED**, unknown position/reception ages and **HEADING UNAVAILABLE / FROZEN**. The working transport does not establish a usable compass or source freshness.

The user's request to check the earlier solved rotation identified commit **3ada53de** and `docs/superpowers/plans/2026-06-15-legacy-compass-runtime-port.md`. That fix changed the device runtime from API 2.1 to the legacy API **1.0.1**, making `hmSensor.id.COMPASS` available. Reusing only its sensor function inside an API-2.1 mini-app did not carry over that prerequisite.

The 0.1.26 candidate adopts that legacy runtime for the **mini app**. The radar/status entries use legacy `hmUI`, input and router bindings through one device adapter; MessageBuilder receives legacy `hmBle`. Installed app metadata still supplies the handshake ID, preferring documented `hmApp.packageInfo()` with the migration-table `getPackageInfo()` alias as a fallback. Zeus supplies legacy `px`; the adapter must not redeclare it. Side Service, settings, source permissions and production watch-face files are unchanged by this correction.

Compass startup now follows the working start-before-subscribe order. A valid raw wrist reading is shown on Connection Details for reference validation; unverified readings still cannot rotate true-bearing contacts. Full companion **94 tests**, original **63 tests** and the legacy native package build pass. Read-only review found and resolved the metadata API difference, with no open findings. Physical compass availability, rotation/reference and the reception clock remain pending installation and hardware validation.

Bridge subsequently reported **Install lite app result: success** for 0.1.26. The official preview package is `dist/REM-Radar-0.1.26.zab`, code 27. Its independently decoded installation QR is `dist/REM-Radar-0.1.26-Install-QR.png`, expiring **27 October 2026 at 10:42:50 America/Halifax**. The preceding device checkpoint is preserved in `integration-verification-0.1.25.json`. The user has been asked to reopen the app and verify changing raw wrist readings; Bridge installation success alone does not prove compass parity.

## Offline usability update: 0.1.27

The user disconnected the phone for an appointment and requested four changes: suppress the screen saver while the app is open, improve responsiveness, use the four physical buttons, and spread information across vertically scrolling views. This increment performs no phone or watch operations. The prior 0.1.26 reconnect check remained waiting for REM; its capture showed **REM NOT CONNECTED / Ready for REM** at 13:49:23 UTC. The earlier demo heading was a fixture and did not establish a live compass reading.

The App now owns a display session across both radar and status pages. It calls legacy `hmSetting.setBrightScreen(2147483)` to suppress the normal timeout, also requests `hmApp.setScreenKeep(true)`, and cancels both on exit or startup failure. These are separate requests: screen keep alone reopens the app after sleep and does not prevent the screen turning off. The implementation follows the official [bright-screen API](https://docs.zepp.com/docs/1.0/watchface/api/hmSetting/setBrightScreen/) and [cancel-on-destroy requirement](https://docs.zepp.com/docs/1.0/reference/device-app-api/hmSetting/setBrightScreenCancel/). Firmware timeout behavior and power consumption remain acceptance checks.

UP/DOWN selects radar contacts, moves through detail panels and chooses actions. SELECT opens the selected contact, opens Connection from details or an unselected radar, and opens Connection's action list. UP/DOWN then chooses Reconnect, REM status or Try demo; SELECT executes it. BACK returns, clears radar selection and then allows normal exit. The existing status page refreshes on SELECT. An App-owned input lease prevents late teardown of an old page from unregistering the current page's physical keys or gestures.

Marker information has three full-height panels: marker identity/distance/bearing, wrist/accuracy, and independent data ages. Connection has four: overview, position, wrist and actions. REM status has four separate panels. Native vertical touch scrolling and UP/DOWN share the same panel state. Documents contain no touch buttons or full-screen refresh overlay. The radar remains full-screen and keeps contact/center tapping. Candidate lists reuse three visible rows and retain selection by stable ID. The documented native scroll getter is one-based; setter conversion is isolated until physical firmware confirms it.

The renderer lazily creates only visible marker slots, preserves the radar pool during document visits, updates changed primitive properties, computes scaling once and skips unchanged radar clock frames. A UI-stub benchmark records five-contact initial creation falling from **162 to 27 widgets**, and repeated unchanged frames performing **zero** native property writes and scaling calls. The 50-contact case stays bounded at 165 widgets. `render-work-comparison-0.1.27.json` retains both measurements; these are software work counts, not watch latency or battery results.

The wrist compass now starts independently of receiving a REM snapshot. Revocation clears REM data and cached private widgets while preserving a real local wrist reading; fixture headings are cleared. A snapshot that removes a marker while Connection is open now returns to Marker unavailable, and an empty candidate return goes to radar. Regression tests cover those review findings, stale-boundary redraw, input ownership, native scroll retention, bounded widget reuse and display cleanup.

Companion **104 tests**, original repository **63 tests**, legacy compatibility verification, the controlled 50-marker source-contract check and `git diff --check` pass. Read-only correctness review has no open findings. All 19 shared-scene review conditions render; browser checks confirm physical Down across three marker panels, vertical touch swipe, Select through Connection/actions, action focus and Back to marker details. Screenshots include `browser-marker-age-0.1.27.png` and `browser-actions-0.1.27.png` under `dist/rem-radar-ui/`.

The legacy API 1.0.1 native build succeeds. Nested archive checks verify **app** ID 1117630, version **0.1.27 / code 28**, device sources 418/419, compiled radar/status pages, Side Service and settings. The retained preview package is `dist/REM-Radar-0.1.27.zab`. Its official installation QR, `dist/REM-Radar-0.1.27-Install-QR.png`, independently decodes to the official Zepp host and expires **27 October 2026 at 11:27:23 America/Halifax**. Watch Status 1.1.1 was already installed before this QR was generated; this increment does not change Android. The prior proof is retained as `integration-verification-0.1.26.json`.

Version 0.1.27 is **not installed or verified on the watch**. Timeout suppression, physical keys and native scrolling, responsiveness, live reconnect, compass/reference, reception clock, locked-phone source freshness and prolonged power/stability still require the paired device. Issue #2 remains open. The active dirty implementation branches remain necessary and are retained; no worktree or branch deletion is safe.

### Next device session

The requirement audit is retained in `dist/rem-radar-ui/acceptance-audit-0.1.27.json`. The live GitHub issue is still open and matches the saved plan after newline normalization. A host-only `adb devices -l` check returned no attached device; no watch or phone interaction was performed during the offline continuation.

1. Install 0.1.27 and verify its runtime version. Keep the radar open beyond the watch's configured screen timeout, then exit and check that normal timeout returns.
2. Verify all four physical keys, every vertical panel, native swipe scrolling and scroll setter indexing. Check that SELECT after a swipe acts on the visible panel, and all crowded candidates remain reachable.
3. Check the wrist sensor while REM is disconnected. Record axis, calibration, north reference and actual readings across quarter turns. Establish a validated geographic-reference conversion before enabling heading-up rotation from the production sensor.
4. Restore the authorized REM/Zepp connection. Capture request and response outcomes without coordinates or credentials; identify the boundary if it remains waiting. Measure five- and fifty-marker delivery and button responsiveness.
5. Validate reception-clock availability and source ages with the phone foregrounded, locked and resumed. Separately interrupt and restore Bluetooth, REM and Zepp; a fresh complete snapshot must recover without duplicate state or fabricated ages.
6. After a credible baseline, agree numeric heading, latency and battery tolerances and run the 30–60 minute stability/power comparison required by issue #2.

## Device return: watch-face launcher and 0.1.28 compass candidate

REM Tactical **1.3.29 / code 47** keeps its existing compass display and routes its large central touch target to mini-app **1117630**, `page/radar/index`, using `hmApp.startApp` with `native: false`. It handles launch failure without changing the compass lifecycle. The original repository's **65 tests** and legacy verifier pass. Bridge reported successful watch-face installation, and the user confirmed that tapping its compass opens the full REM radar app. Its official, independently decoded watch-face QR is `dist/REM-Tactical-1.3.29-Install-QR.png`, expiring **27 October 2026 at 12:49:57 America/Halifax**.

The all-blue marker regression originated in Android's native radar projection, which assigned generic blue to every marker. Plugin **1.1.2 / code 4** maps REM's exact NATO catalog IDs to friendly `#007aff`, hostile `#ff303b`, neutral `#00d43b` and unknown `#ffe600`. Other symbols retain generic `#64beff`. All **19 native tests** pass. The controlled native 50-marker artifact retains all five colors through the phone decoder and real fragmented MessageBuilders into one complete watch snapshot. ADB installation succeeded and Android's package manager independently confirms 1.1.2. A new radar pairing session must be copied through the trusted phone configuration after this plugin restart; live color verification remains pending.

Mini-app **0.1.28 / code 29** follows the working watch face's numeric-string normalization, native-property fallback for signal-only events and start-before-subscribe order. Optional unsubscribe support now uses an App-owned sensor lease for both firmware variants. Late teardown of an old page cannot stop the new owner's sensor; removed callbacks cannot forward after restart; failed subscriptions can retry. App teardown releases the shared binding. Review has no remaining actionable findings, and all **109 companion tests** pass.

The native 0.1.28 preview build compiles all three device entries. Nested package inspection confirms an API **1.0.1 app**, ID **1117630**, sources **418/419**, radar/status binaries, Side Service and settings. Its retained package is `dist/REM-Radar-0.1.28.zab`; the independently decoded official installation QR is `dist/REM-Radar-0.1.28-Install-QR.png`, expiring **27 October 2026 at 13:26:42 America/Halifax**. Plugin 1.1.2 was installed before this QR was generated.

At this checkpoint, USB ADB remains authorized, but Zepp disables Developer Mode, its Bluetooth diagnostic reports **Couldn't scan**, and Bridge reports **No connectable online App or Simulator**. The latest native screenshot predates the user's WRIST-panel confirmation and shows the radar; it is not presented as current WRIST evidence. No 0.1.28 installation or live compass result is claimed. The production reducer also deliberately freezes orientation for an unverified north reference; restoring raw readings alone cannot satisfy heading-up acceptance. Axis/reference validation or a trustworthy declination conversion remains required by issue #2.

### Build isolation and retained outputs

Run watch-face builds from the root through `npm run watchface:build`, `npm run watchface:preview` or `npm run watchface:bridge`, using Node 20. `scripts/build-watchface.mjs` copies a bounded source snapshot into a new ignored `.tools/watchface-build-*` directory, where Zeus may clear its own `dist`, then retains the resulting watch-face package in the root `dist`. An integration build verified that all five existing app/watch-face package and QR hashes survived. Do not invoke raw Zeus build or preview from the repository root, because that directory also holds retained mini-app and plugin outputs. Companion builds run in `rem-zepp-sync-trex2` and clear only that project's generated directory.

The current verification records are `dist/rem-radar-ui/integration-verification-0.1.28.json`, `package-verification-0.1.28.json`, `source-contract-verification.json` and `dist/watchface-launch-1.3.29/verification.json`. They distinguish installed plugin and user-confirmed launcher behavior from the uninstalled app candidate and remaining hardware gates. Earlier `dist` checkpoint copies were lost; the original 0.1.27 preview binary and private device captures remain under `.tools`. Active dirty implementation branches remain needed and are retained.

## Accepted radar and interface update: 0.1.29–0.1.30

The user approved using the valid legacy watch compass immediately with an amber unverified-north warning. Version **0.1.29 / code 30** applies those readings to orientation while retaining the fixed center arrow. Invalid/calibration readings still freeze orientation; no phone heading or declination correction is introduced. Bridge reported successful installation, Zepp independently listed 0.1.29, and the user confirmed “Labels rotate; centre arrow stays fixed”, followed by “last iteration works!” The user then accepted the radar and chose marker selection/details as the next interface priority.

Watch Status **1.1.3 / code 5** corrects trusted configuration renewal: the page now sends the supported `{type:"action",action:"radar.renew"}` envelope. The previous custom message type never reached the service through the host allowlist. No host security rule is widened. The APK installed successfully, and package-manager output independently confirms 1.1.3. On the phone, Renew completed with “Configuration loaded” and a **480-minute** lifetime; the fresh pairing was saved in Zepp. Its 19 native tests/build and the real configuration-button regression pass. The retained APK is `dist/REM-Watch-Status-Radar-1.1.3-debug.apk` (SHA-256 `72076fc861fbaad22d443475271a0a634943e8d025e53b3efda95b0441137a00`).

The user's next requirements are implemented in **0.1.30 / code 31**:

- Tap a radar marker, or highlight it with UP/DOWN and open it with SELECT. Overlap lists have three **324 × 76 px** tappable rows per page, with a strong focus outline and unchanged source-color dots. UP/DOWN and SELECT reach all candidates; vertical swipes page the list. A press captures its marker ID and cancels after retargeting, hiding, source removal or swipe movement.
- Marker details use four full-height panels: identity/distance, true map bearing/position accuracy, wrist heading and data age. Long labels wrap above the distance; wide punctuation, CJK and ellipses receive conservative bounds. Swipe vertically or use UP/DOWN; BACK returns to radar.
- Text is enlarged for reading under stress. Information labels use **24 px**, names **32 px**, main values **32–64 px**, candidate rows **28/24 px**, and footers **22 px**. Radar letters use **28 px** and ranges **20 px**. Status uses **28–34 px** values and five panels so TEAM has its own space. No small action buttons are introduced.

Verification: **117 companion tests**, **65 root tests**, legacy runtime verification, native preview compilation and diff checks pass. Correctness review identified and resolved a press/source-update identity race and wide-punctuation clipping; maintenance review has no remaining actionable findings. Browser interaction checks demonstrated physical-button selection, overlap-row tapping and all four detail panels. Browser text bounds and 22 shared-scene renders support the layout; firmware fonts and native touch remain a device check. `dist/REM-Marker-UI.png` is the review image.

The retained package `dist/REM-Radar-0.1.30.zab` is **113,970 bytes**, SHA-256 `71755f29b8cad818d82691bc6dc69bbbd3b1d28857079e82352bd617106f3489`. Nested archive inspection confirms an API 1.0.1 **app**, ID 1117630, sources 418/419, compiled radar/status pages, Side Service and settings. The official installation QR `dist/REM-Radar-0.1.30-Install-QR.png` independently decodes to the official Zepp host and expires **27 October 2026 at 15:21:29 America/Halifax**. Plugin 1.1.3 was independently rechecked before this QR was generated. Bridge reports no online app, so no 0.1.30 installation or hardware font/touch result is claimed.

Current proof records are `dist/rem-radar-ui/integration-verification-0.1.30.json`, `package-verification-0.1.30.json`, `install-qr-0.1.30.json` and `source-contract-verification.json`; the generic integration record points to this increment. The accepted 0.1.29 package and refreshed QR are retained separately. Active implementation branches are required and unmerged; unrelated dirty files and the user's root README are preserved.
