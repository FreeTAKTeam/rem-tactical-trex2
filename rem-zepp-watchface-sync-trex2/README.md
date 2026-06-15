# REM Watchface Sync Proof for Amazfit T-Rex 2

This is a separate proof watchface package for testing REM northbound API sync on
Amazfit T-Rex 2. It does not modify the production REM Tactical face.

The earlier Mini Program proof showed `FACE READ FAIL` on the physical watch, so
this project uses the Watchdrip-style pattern instead:

1. The watchface starts a bridge to app-side code.
2. The watchface sends `REM_STATUS_REQUEST`.
3. App-side returns `REM_STATUS_RESPONSE` or `REM_STATUS_ERROR`.
4. The watchface writes the compact status to its own `hmFS` cache.
5. The watchface renders from that cache and verifies restart reads.

References:

- https://github.com/bigdigital/zeppos_watchdrip_timer_wf
- https://github.com/bigdigital/zeppos_watchdrip_app

## Target

- Device: Amazfit T-Rex 2
- Display: 454 x 454
- Zepp OS era: 2.1 / legacy-compatible watchface runtime
- App type: `watchface`
- App ID: `306967170`

## REM API

The real API endpoint is:

```text
GET /northbound/watch/status
```

Configuration lives in `common/remConfig.js`. Defaults are mock-first and do not
contain secrets:

```js
export const remConfig = {
  baseUrl: "",
  apiToken: "",
  mockMode: true,
  pollIntervalSeconds: 60,
  timeoutMs: 5000,
  staleTimeoutSeconds: 120,
};
```

Set `baseUrl` and `mockMode: false` only after mock bridge/cache proof succeeds
on the physical watch. If `apiToken` is set, app-side sends:

```text
Authorization: Bearer <token>
```

Do not commit production tokens.

## Compact Cache

The watchface stores a pipe-delimited status string in its own cache file:

```text
CONNECTED|OP ALPHA-1|ACTIVE|ALPHA|2m AGO|3|HIGH|NORMAL|11S LT 12345 67890|WP-23|1.2 km|328°|1760000000000
```

Fields are:

```text
connection, operator, operatorStatus, team, lastSyncAge, activeEvents,
priority, alert, mgrs, waypoint, waypointDistance, waypointBearing, updatedAt
```

## Mock Proof States

Mock mode cycles through six states:

1. Connected / active / no events
2. Connected / active / high event
3. Stale / warning
4. Emergency alert
5. API error
6. Connected / no waypoint

## On-Watch Diagnostics

The proof face displays diagnostics on the dial:

- `BRIDGE REQ n`: request sent from watchface
- `BRIDGE OK`: app-side response received
- `BRIDGE TIMEOUT`: no app-side response
- `CACHE WRITE OK`: watchface wrote `hmFS` cache
- `CACHE READ OK`: watchface read cache after restart
- `CACHE UNSUPPORTED`: `hmFS` was not available to the face

## Physical Proof Procedure

Verify in this order before touching the production REM Tactical face:

1. Build and install this proof package.
2. Confirm the static proof face displays.
3. Confirm `BRIDGE REQ 1` appears.
4. Confirm `BRIDGE OK` appears.
5. Confirm `CACHE WRITE OK` appears.
6. Switch away/restart/reinstall the face and confirm `CACHE READ OK`.
7. Wait for mock status updates and confirm the UI changes.
8. Only then configure a reachable REM API URL and test real fetch.
9. Confirm stale/error rendering.

If the watchface stays at `BRIDGE TIMEOUT` or never reaches `BRIDGE OK`, the
same-package app-side bridge is not proven on this device. The next fallback is
the full Watchdrip split-package pattern: keep this proof face and use a
separate companion app-side provider addressed by fixed app ID.

## Commands

```powershell
npm install
npm test
npm run build
npm run preview
```

For direct Zeus usage:

```powershell
npm run zeus -- build -t "Amazfit T-Rex 2"
npm run zeus -- preview -t "Amazfit T-Rex 2"
```

## Current Limitation

The existing `rem-zepp-sync-trex2/` Mini Program remains useful as a standalone
debug/status app, but its storage was not readable by the watchface on the
physical T-Rex 2. Do not use Mini Program local storage as proof of production
watchface integration.
