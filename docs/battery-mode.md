# REM battery mode

REM Tactical 1.3.28 and REM Sync 0.1.19 keep the existing watch-to-phone request
contract and companion app ID. Install both builds to get the bridge lifecycle
fixes on both ends. The experimental proof watch faces are unchanged.

## Controls and connection behavior

- REM starts off when the watch face is created. Tap the top REM panel to turn it
  on or off. Screen sleep preserves this in-memory choice; reloading the face
  resets it.
- Off means no REM bridge connects, HTTP status requests, retry timers, or polling.
  The watch's normal Bluetooth pairing is unaffected.
- When enabled, a tap requests a status immediately. Successful requests are
  spaced by the configured 60-second interval. Failure delays are 60, 120, 240,
  then at most 300 seconds. Waking does not bypass the next request deadline.
- Each request releases its bridge connection after completion. Pausing/AOD
  cancels face timers and pending bridge work. Late responses cannot repaint the
  face, overwrite its cache, or issue another request after cancellation.
- The companion remains request-driven. Its page releases its callback and
  watchdog on destruction; the app disconnects its bridge on destruction.

## Disconnected display

The disconnected lower section uses large, simple readouts at the sides while
the animated compass and heading remain the central instrument:

| Left: altitude | Center: heading and compass | Right: barometric pressure |
| --- | --- | --- |
| `ALT`<br>**124**<br>m | `HEADING`<br>**287°**<br>[animated compass] | `BAR`<br>**1007**<br>hPa |

Heading appears only in the center. Heart rate omits the small BPM suffix;
battery uses a native percent suffix directly after the number and no icon.

These are example readings only. Actual values use:

- Compass events, throttled to at most ten redraws per second, keep the center
  arrow and heading animated for as long as the face is awake, whether REM is on
  or off. Sampling stops on pause/AOD and resumes on wake; there is no five-second
  cutoff. Tap the center compass to open the Compass app for calibration.
- Native `TEXT_IMG` data bindings: `ALTITUDE` and `ALTIMETER`. No GPS session,
  JS environmental timer, or REM weather fetch is added. The disconnected
  presentation places the `m` and `hPa` labels on their own centered rows.

Native constants differ by firmware. In particular, `ALTITUDE` is listed in
the current watch-face data types but absent from the older v2 list. If the
firmware does not expose a data type, the field shows `--`. Native bindings
must be checked on the T-Rex 2; mocked tests cannot establish firmware support
or the freshness of weather data. We do not derive altitude from uncalibrated
pressure or display the sample values when readings are missing.

References: [Zepp legacy data types](https://docs.zepp.com/docs/v2/watchface/api/hmUI/widget/data_type/),
[current data types](https://docs.zepp.com/docs/watchface/api/hmUI/widget/data_type/),
[native text/image binding](https://docs.zepp.com/docs/watchface/api/hmUI/widget/TEXT_IMG/).

## Execution changes and verification

The face skips unchanged text/angle updates and reuses the event severity rail.
It reads its own REM cache once per face instance. The AOD clock uses smaller,
dimmer glyphs against black; compass and REM work are stopped in AOD.
Bridge requests have one deadline covering both handshake and response, with
timers/listeners removed on success, error, timeout, and disconnect.

Run the root tests with `npm test` and the companion tests with `npm test` in
`rem-zepp-sync-trex2`. Root tests execute the actual legacy face in a mocked Zepp
runtime and exercise actual bridge classes with the bundled Promise implementation.
`scripts/render-tactical-preview.mjs` renders production widget coordinates with
sample data into `dist/`; these are layout previews, not simulator screenshots.

Physical-watch acceptance remains required:

1. Install face 1.3.28 and companion 0.1.19. Confirm REM starts off, the larger
   `ALT`/`BAR` fields match the watch's native altitude and pressure readings,
   and the heading/compass remains animated. Check zero/negative altitude,
   metric/imperial units, and unsupported-field placeholders.
2. Tap REM with the phone and REM available. Check the live event/team display.
   Tap again; the disconnected panels must return immediately.
3. Repeat with Bluetooth disconnected, REM stopped, and during an in-flight
   request. Confirm no delayed reply restores a connected view after switching off.
4. Repeat wrist wake, sleep, AOD, and Compass-app transitions. Check bearings
   keep animating after five seconds in both REM modes and stop when the face sleeps.
5. Compare battery drain over comparable 24-hour periods with the same brightness,
   AOD, wrist-wake, health monitoring, weather sync, and Bluetooth settings. Record
   initial/final percentages and REM-enabled time. Battery savings are not yet
   measured on hardware; passing builds and VM tests are not a battery measurement.
