# REM Sync mini app for Amazfit T-Rex 2

REM Sync 0.1.28 opens a native read-only radar app on the T-Rex 2. The radar fills the 454 x 454 round display. It retains the Zepp Side Service and operational-status page. The app is separate from the REM Tactical watch face. REM Tactical 1.3.29 launches this app when its central compass is tapped.

The radar implements the source-to-watch software path for [issue #2](https://github.com/FreeTAKTeam/rem-tactical-trex2/issues/2); firmware acceptance remains open. It starts without cached contacts and requests the paired phone source. The radar uses color and symbols: a grey center arrow/cone means disconnected; amber means stale source or unverified heading/clock. Contact fills retain REM colors. Cardinal letters and range scales are the only radar text.

Use the four physical buttons for every action. UP/DOWN selects contacts on the radar and scrolls through information panels. SELECT opens the selected contact, or Connection when nothing is selected. SELECT from contact details opens Connection; SELECT from Connection opens its action list. UP/DOWN chooses Reconnect, REM status or Try demo, and SELECT executes it. BACK returns to the previous view, clears radar selection, then exits. BACK from demo clears samples. REM status refreshes on entry or SELECT and does not supply radar contacts.

Details have three full-height panels: marker, wrist and data age. Connection has four: overview, position, wrist and actions. Swipe vertically or use UP/DOWN to read. The status view also has four scrolling panels. There are no small on-screen action buttons. Radar contacts and the center arrow remain tappable; overlapping contacts open a list controlled by UP/DOWN and SELECT. A dotted teal rim identifies demo mode, and three amber dots indicate the source's 50-marker limit.

The app requests a native bright-screen hold for its lifetime and cancels it on exit, including startup failure. This suppresses the normal screen timeout while the app is open; `setScreenKeep(true)` also requests return to the app after a system sleep. Watch firmware must confirm the timeout behavior. The display hold belongs to the App, so switching between radar and status does not release it.

Rendering allocates marker widgets only when needed, retains the radar during document visits, and skips unchanged properties and radar clock frames. Five-contact initial widget creation drops from 162 to 27 in the local UI-stub benchmark. This measures software work, not physical watch latency or battery consumption.

See [radar UI scope, preview, tests and integration gates](../docs/rem-radar-ui.md).

## Target

- Amazfit T-Rex 2, 454 x 454 round display.
- Legacy device runtime API 1.0.1, matching the working T-Rex 2 compass implementation; device sources 418 and 419.
- Mini-app ID 1117630. MessageBuilder reads the installed runtime's ID with `hmApp.packageInfo()` (or its `getPackageInfo()` alias) so the phone can route its Side Service, including preview ID remapping.
- Native IMG, TEXT, CIRCLE, FILL_RECT and GROUP widgets. No API-3 canvas or modern Compass dependency.

## Operational-status path

REM Android Watch Status plugin -> Zepp Side Service -> existing MessageBuilder bridge -> REM STATUS page and existing watch-face status requests.

The status path does not depend on the old failed mini-program-storage-to-watch-face proof. The radar consumes its own in-memory state; it writes no marker data to shared storage.

Configure `common/remConfig.js` before testing the existing status path. The default endpoint is `http://localhost:29863/northbound/watch/status`. If the plugin's port changes, update `baseUrl`. A configured `apiToken` is sent as a bearer token and is not logged. `mockMode: true` enables existing operational-status fixtures on the Side Service; it does not connect the radar to REM. Radar demo mode is separate and explicitly labelled in the UI.

## Radar pairing and data path

1. Build/install REM's Watch Status plugin 1.1.2 with the actual REM host signer configured. In REM, trust the plugin and explicitly grant `operationalRead`, `mapObserverRead`, and `mapNearbyRead` (plugin API 1.3).
2. In its configuration, enable the server and **Allow radar access on this phone**, then save. Copy the scoped radar pairing code.
3. In Zepp's REM Sync settings, enable **Connect radar**, enter the same server port (default 29863), paste the code and save. Open the watch app, or open Connection with SELECT, press SELECT again for actions and select Reconnect.

The code stays in Zepp phone settings; watch requests cannot choose a URL or credential. The Side Service uses only `http://127.0.0.1:<port>/northbound/watch/radar`. The read session expires after eight hours and is revoked by disable, settings save, renewal or REM plugin restart. Renew/paste a new code after expiry. Authentication/configuration denial clears contacts and stops automatic retries; reconnect explicitly after repairing access. Temporary transport loss retains aged contacts.

The source uses REM's own local position and nearby map pins, with observer checks before and after the read. The plugin preserves the canonical NATO symbols: friendly blue `#007aff`, hostile red `#ff303b`, neutral green `#00d43b`, and unknown yellow `#ffe600`. Generic and unrecognized symbols keep REM's `#64beff`; names and arbitrary icon text never imply affiliation. Source position accuracy remains numeric or unknown and is shown in contact/Connection details. Source marker timestamps remain distinct from receipt time. No coordinates, notes or bearer tokens are sent to the watch. Snapshots are best effort because the host has no atomic combined observer/nearby operation.

The native legacy wrist compass starts independently of REM, is feature detected, throttled, and cleaned up on page teardown. The device runtime and start-before-subscribe order follow the earlier working fix in commit `3ada53de`; an API-2 device host does not reproduce that runtime boundary. Smoothing resets after a reading gap over two seconds or a clock rollback. Its north reference remains unverified; the app does not rotate true-bearing contacts from that heading or substitute phone heading. The Wrist panel shows a valid raw wrist reading for reference validation. A monotonic reception clock is used only if the runtime exposes `performance.now`; the wall-clock fallback displays unknown ages and an amber indicator. Actual T-Rex firmware must resolve both gates before navigation use.

## Commands

From this directory, with Node 20:

```powershell
npm test
npm run build
npm run preview
npm run dev
```

Scripts use the parent repository's Zeus CLI. Build outputs are in `dist/`. A successful build does not prove phone/watch delivery or sensors.

From the repository root:

```powershell
npm run radar:assets
npm run radar:preview
npm run radar:render
```

The browser review at `http://127.0.0.1:4782/preview/radar/` uses the native widget scene and exposes 19 review conditions, simulated physical buttons and heading controls. Arrow keys, Enter and Escape emulate UP/DOWN, SELECT and BACK. PNGs go to the root `dist/rem-radar-ui/` and `dist/REM-Radar-UI.png`. Run `node scripts/benchmark-radar-ui.mjs` from the root for the deterministic renderer work report.

## Remaining acceptance

The existing MessageBuilder bounds messages to 64 KiB, fragments to 2,000 bytes, and concurrent incomplete messages to four. Reassembly has a fixed ten-second deadline. Exact duplicates are ignored; conflicts are rejected. A sixteen-entry replay window suppresses completed/expired spans. Timeout, page cancellation, disconnect and Side Service destruction release partial messages. The radar controller additionally checks request IDs, public channel/session IDs, retired sessions and increasing sequence numbers before atomically replacing contacts.

`scripts/verify-radar-source.mjs <native-artifact>` from the repository root accepts the controlled 50-marker artifact emitted by REM's plugin tests. It passes that native projection through the phone codec and real MessageBuilders, with reversed/duplicate fragments, to one complete watch state update. This proves the local software contract; it does not prove physical Bluetooth or live REM permissions.

Real REM-to-watch radar rendering was observed on 0.1.25. Bridge subsequently installed 0.1.27 and REM Tactical 1.3.29, and the user confirmed that tapping the watch face's compass opens the full radar app. The 0.1.28 candidate accepts legacy numeric-string compass readings and sensors without an unsubscribe method. Both sensor variants share one App-owned lease, so late teardown cannot stop a replacement page's sensor. Removable callbacks are invalidated after restart; non-removable firmware reuses one registration. Failed subscriptions can retry. Bounded enum diagnostics distinguish unavailable APIs, calibration and valid readings. Its 109 tests and native build pass; installation and physical compass confirmation remain pending. Unverified headings still cannot rotate true-bearing contacts. Reception-clock availability, reconnect, source freshness during phone lock, physical keys, native scrolling, timeout suppression and power consumption require device validation. The native scroll getter is documented as one-based; setter indexing is isolated pending firmware confirmation. Demo timer ages are illustrative.

The historical storage proof remains under `proof/watchface-read-test/` as evidence of the failed sharing path. It is not part of the current status/radar architecture and should not be deployed as a dependency.
