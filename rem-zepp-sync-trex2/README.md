# REM Sync Mini Program for Amazfit T-Rex 2

REM Sync is a Zepp OS Mini Program plus Side Service that reads a REM northbound
watch endpoint and keeps a compact REM status cache on the watch.

This is not the REM Tactical watch face. The watch face remains separate until a
physical T-Rex 2 proves that watch faces can read Mini Program storage.

REM Sync works only with Reticulum Emergency Management (REM) compatible watch
status endpoints. Without REM, the app can still be opened in mock mode for UI
testing, but it will not sync useful live field data from another system.

## Target

- Device: Amazfit T-Rex 2
- Runtime: Zepp OS 2.1-era Mini Program
- Display: 454 x 454 round
- App ID placeholder: `306967169`

## Architecture

```text
REM Northbound API
-> Zepp Side Service in the phone app
-> Device App / Mini Program on T-Rex 2
-> compact local REM status cache
-> optional watch-face proof read
```

The Side Service polls the REM API or mock data, compacts the response, and
sends it to the Device App. The Device App shows the status and writes the
compact fields to watch-side storage.

## REM API

Configure `common/remConfig.js` before real API testing:

```js
export const remConfig = {
  baseUrl: "http://localhost:29863",
  apiToken: "",
  pollIntervalSeconds: 30,
  timeoutMs: 5000,
  staleTimeoutSeconds: 90,
  debugCoordinates: false,
  mockMode: false,
};
```

The first endpoint is:

```text
GET /northbound/watch/status
```

If `apiToken` is set, the client sends:

```text
Authorization: Bearer <token>
```

Tokens are not logged. Coordinates are not logged unless `debugCoordinates` is
enabled.

The default points at the REM Android loopback watch status server. If REM
Settings changes the watch server port, update `baseUrl` to match it.

## Mock Mode

Mock mode remains available for watch-only testing when `mockMode` is set to
`true` or `baseUrl` is empty. Tap anywhere on the REM Sync screen to cycle:

- normal connected state
- stale state
- high priority event
- emergency alert
- API error
- no events

## Compact Status Contract

The Device App writes these keys when storage is available:

```text
REM_STATUS_CONNECTION
REM_STATUS_OPERATOR
REM_STATUS_TEAM
REM_STATUS_OPERATOR_STATE
REM_STATUS_LAST_SYNC
REM_STATUS_ACTIVE_EVENTS
REM_STATUS_PRIORITY
REM_STATUS_ALERT
REM_STATUS_WAYPOINT
REM_STATUS_BEARING
```

The cache also writes `rem-status-cache.json` in the Mini Program data directory.
Zepp OS isolates Mini Program data directories, so this is only a candidate
mechanism until the proof face succeeds.

## Watch-Face Proof

Do not assume the REM Tactical face can read Mini Program storage.

Observed result on the T-Rex 2 test run:

- REM Sync installed and mock states cycled correctly.
- The proof watch face displayed `FACE READ FAIL`.
- Therefore, the tested API 2.1 storage paths are isolated from the watch-face
  runtime on this device. The production REM Tactical face must continue using
  static/mock REM fields unless a different supported sharing mechanism is
  proven later.

Proof steps:

1. Build and preview this Mini Program.
2. Install it on the T-Rex 2.
3. Open REM Sync and tap until it displays a known mock state.
4. Build and preview `proof/watchface-read-test`.
5. Install the proof face.
6. Read the screen:
   - `FACE READ OK`: document the exact storage mechanism before touching the production face.
   - `FACE READ FAIL`: keep REM Tactical on mock/static fields and use REM Sync as the status app.

## Commands

From this directory:

```powershell
npm test
npm run build
npm run preview
npm run dev
```

The scripts use the parent repo's local Zeus CLI installation.

Proof face:

```powershell
cd proof/watchface-read-test
npm run build
npm run preview
```

## Known Limitations

- Watch-face custom-data sharing is not supported by the tested storage path:
  the physical T-Rex 2 proof showed `FACE READ FAIL`.
- `LocalStorage` is not used because Zepp documents it as API 3.0+; this project
  targets the 2.1-era device and uses file plus `SessionStorage` attempts.
- The included `shared/message*.js` wrapper follows the Zepp MessageBuilder API
  shape, but the physical phone-to-watch bridge must still be verified with
  `zeus preview`.
- Production authentication beyond optional bearer-token support is out of scope.
