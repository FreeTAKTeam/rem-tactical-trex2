import assert from "node:assert/strict";
import test from "node:test";
import { watchfaceHarness } from "../scripts/testing/watchface-harness.mjs";

function connected(h, extra = {}) {
  return { connection: "CONNECTED", updatedAt: h.now(), operator: "ALPHA-1", team: "ALPHA",
    operatorStatus: "ACTIVE", teamStatus: "GREEN", lastSyncAge: "NOW",
    lastEvent: { title: "MECP/0/P01", source: "POCO", time: "19:41" }, ...extra };
}

test("disconnected default has no BLE traffic or timers and keeps the compass running until pause", () => {
  const h = watchfaceHarness(); h.build(); h.face.build();
  assert.equal(h.stats.starts, 1);
  assert.equal(h.stats.connects, 0);
  assert.equal(h.requests.length, 0);
  assert.ok(h.text().includes("287°"));
  assert.ok(h.text().includes("OFF · TAP REM"));
  assert.ok(!h.text().includes("TEAM"));
  assert.ok(!h.text().includes("P01"));
  h.advance(5000);
  assert.equal(h.stats.stops, 0);
  assert.equal(h.stats.compassListeners, 1);
  assert.equal(h.timers.size, 0);
  h.advance(24 * 60 * 60 * 1000);
  assert.equal(h.requests.length, 0);
  h.compass.callback({ calibration_status: true, direction_angle: 90 });
  assert.ok(h.text().includes("090°"));
  h.delegate().pause_call();
  assert.equal(h.stats.stops, 1);
  assert.equal(h.stats.compassListeners, 0);
});

test("center compass stays visible and animated in disconnected, connected and REM-off modes", async () => {
  const h = watchfaceHarness(); h.build();
  const dial = h.widgets.find((w) => w.props.src === "images/compass-dial.png");
  const arrow = h.widgets.find((w) => w.props.src === "images/compass-arrow.png");
  const heading = h.widgets.find((w) => w.type === "TEXT" && w.props.y === 306 && w.props.x === 164);
  const button = h.widgets.find((w) => w.type === "BUTTON" && w.props.x === 150);
  for (const [mode, angle] of [["offline", 90], ["connected", 180], ["off", 270]]) {
    if (mode === "connected") {
      h.tap(); h.requests[0].resolve({ data: connected(h) }); await h.flush();
    } else if (mode === "off") h.tap();
    h.advance(6000);
    h.compass.callback({ calibration_status: true, direction_angle: angle });
    for (const widget of [dial, arrow, heading, button]) assert.equal(widget.props.visible, true, mode);
    assert.equal(arrow.props.angle, -angle);
    assert.equal(heading.props.text, `${String(angle).padStart(3, "0")}°`);
  }
  h.delegate().pause_call();
  assert.equal(h.stats.stops, 1);
});

test("disconnected tactical data uses large altitude and pressure values", () => {
  const h = watchfaceHarness(); h.build();
  const altitude = h.widgets.find((w) => w.props.type === "ALTITUDE");
  for (const widget of [altitude]) {
    assert.ok(widget.props.x >= 48 && widget.props.x + widget.props.w <= 158);
    assert.equal(widget.props.h, 34);
    assert.equal(widget.props.align_h, "CENTER_H");
  }
  const pressure = h.widgets.find((w) => w.props.type === "ALTIMETER");
  assert.ok(pressure.props.x >= 296 && pressure.props.x + pressure.props.w <= 427);
  assert.equal(pressure.props.h, 34);
  assert.equal(pressure.props.align_h, "CENTER_H");
  const units = h.widgets.filter((w) => w.type === "TEXT" && ["m", "hPa"].includes(w.props.text));
  assert.equal(units.length, 2);
  for (const unit of units) {
    assert.equal(unit.props.y, 350);
    assert.equal(unit.props.align_h, "CENTER_H");
  }
  assert.ok(h.text().includes("ALT"));
  assert.ok(h.text().includes("BAR"));
  for (const type of ["SUN_SET", "WIND", "HUMIDITY", "MOON"]) {
    assert.equal(h.widgets.some((w) => w.props.type === type), false, type);
  }
  assert.equal(h.widgets.some((w) => w.props.src === "images/tactical/panel.png"), false);
});

test("environment readouts are bound to native OS data, never to sample values", () => {
  const h = watchfaceHarness(); h.build();
  for (const type of ["ALTITUDE", "ALTIMETER"]) {
    const widget = h.widgets.find((w) => w.props.type === type);
    assert.ok(widget, type);
    assert.equal(widget.props.visible, true);
    assert.equal(widget.props.text, undefined);
    assert.equal(widget.props.h, 34);
    assert.equal(widget.props.align_h, "CENTER_H");
    assert.equal(widget.props.unit_en, undefined);
  }
  assert.ok(h.text().includes("m"));
  assert.ok(h.text().includes("hPa"));
  for (const type of ["SUN_SET", "WIND", "HUMIDITY", "MOON"]) {
    assert.equal(h.widgets.some((w) => w.props.type === type), false, type);
  }
});

test("missing firmware data types and compass show placeholders without crashing", () => {
  const h = watchfaceHarness({ noEnvironment: true, noCompass: true }); h.build();
  assert.ok(h.text().includes("--°"));
  assert.equal(h.text().filter((text) => text === "--").length, 2);
  assert.equal(h.timers.size, 0);
});

test("tap connects once, live result restores REM fields, second tap stops requests", async () => {
  const h = watchfaceHarness(); h.build(); h.tap();
  assert.equal(h.requests.length, 1);
  assert.ok(h.text().includes("CONNECTING"));
  h.requests[0].resolve({ data: connected(h) }); await h.flush();
  assert.ok(h.text().includes("CONNECTED"));
  assert.ok(h.text().includes("P01"));
  assert.ok(h.text().includes("TEAM"));
  assert.ok(!h.text().includes("ALT"));
  assert.equal(h.stats.disconnects, 1);
  const count = h.widgets.length;
  h.advance(60000);
  h.requests[1].resolve({ data: connected(h, { lastEvent: { title: "MECP/2/P02" } }) }); await h.flush();
  assert.equal(h.widgets.length, count, "severity change must not allocate a new rail");
  h.tap();
  assert.ok(h.text().includes("OFF · TAP REM"));
  assert.ok(h.text().includes("ALT"));
  assert.equal(h.timers.size, 0);
  h.advance(600000);
  assert.equal(h.requests.length, 2);
});

test("late success after off cannot redraw REM fields or write its cache", async () => {
  const h = watchfaceHarness(); h.build(); h.tap(); h.tap();
  h.requests[0].resolve({ data: connected(h) }); await h.flush();
  assert.equal(h.writes.length, 0);
  assert.ok(h.text().includes("OFF · TAP REM"));
  h.advance(100000);
  assert.equal(h.requests.length, 1);
});

test("top REM panel toggles connection and disconnected view has no footer", async () => {
  const h = watchfaceHarness(); h.build();
  assert.equal(h.widgets.some((w) => w.type === "BUTTON" && w.props.y === 406), false);
  h.tap();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ data: connected(h) }); await h.flush();
  assert.ok(h.text().includes("LAST SYNC NOW"));
  h.tap();
  assert.ok(h.text().includes("OFF · TAP REM"));
  assert.equal(h.text().includes("LAST SYNC NOW"), false);
  assert.equal(h.text().filter((value) => value === "REM").length, 1);
  assert.equal(h.timers.size, 0);
});

test("pause cancels timers and stale callbacks; AOD cannot start sensors or REM", async () => {
  const h = watchfaceHarness(); h.build(); h.tap(); h.delegate().pause_call();
  assert.equal(h.timers.size, 0);
  const draws = h.stats.draws;
  h.requests[0].resolve({ data: connected(h) }); await h.flush();
  assert.equal(h.stats.draws, draws);
  assert.equal(h.writes.length, 0);
  h.setScreen("aod"); h.delegate().resume_call();
  assert.equal(h.stats.starts, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
});

test("waking repeatedly preserves the request deadline and registers compass once", async () => {
  const h = watchfaceHarness(); h.build(); h.tap();
  h.requests[0].resolve({ data: connected(h) }); await h.flush();
  for (let i = 0; i < 3; i++) {
    h.delegate().pause_call(); h.advance(1000); h.delegate().resume_call(); h.delegate().resume_call();
    assert.equal(h.stats.compassListeners, 1);
  }
  assert.equal(h.requests.length, 1);
  h.advance(57000);
  assert.equal(h.requests.length, 2);
});

test("offline requests back off to five minutes and timed-out results are ignored", async () => {
  const h = watchfaceHarness(); h.build(); h.tap();
  for (const delay of [60000, 120000, 240000, 300000, 300000]) {
    const old = h.requests[h.requests.length - 1];
    h.advance(5000);
    old.resolve({ data: connected(h) }); await h.flush();
    assert.equal(h.writes.length, 0);
    assert.ok(h.text().includes("OFFLINE"));
    const requestCount = h.requests.length;
    h.advance(delay - 1);
    assert.equal(h.requests.length, requestCount);
    h.advance(1);
    assert.equal(h.requests.length, requestCount + 1);
  }
  h.face.onDestroy();
  assert.equal(h.timers.size, 0);
});

test("repeated compass readings do not redraw unchanged text or angles", () => {
  const h = watchfaceHarness(); h.build();
  const draws = h.stats.draws;
  for (let i = 0; i < 4; i++) { h.advance(250); h.compass.callback({ calibration_status: true, direction_angle: 287 }); }
  assert.equal(h.stats.draws, draws);
  h.advance(250); h.compass.callback({ calibration_status: true, direction_angle: 0 });
  assert.ok(h.text().includes("000°"));
});

test("cache never implies opt-in or a live REM connection", () => {
  const h = watchfaceHarness({ cachedStatus: { connection: "CONNECTED", updatedAt: Date.now() } }); h.build();
  assert.ok(h.text().includes("OFF · TAP REM"));
  h.delegate().pause_call(); h.delegate().resume_call();
  assert.equal(h.stats.reads, 1);
  assert.equal(h.requests.length, 0);
});

test("synchronous bridge errors leave a bounded retry and permit turning off", () => {
  for (const option of ["connectThrows", "requestThrows"]) {
    const h = watchfaceHarness({ [option]: true }); h.build(); h.tap();
    assert.ok(h.text().includes("OFFLINE"));
    h.advance(5000); assert.equal(h.timers.size, 1);
    h.tap(); assert.equal(h.timers.size, 0);
  }
});

test("destroy and rebuild defaults to off and ignores responses from the previous face", async () => {
  const h = watchfaceHarness(); h.build(); h.tap(); h.face.onDestroy(); h.build();
  h.requests[0].resolve({ data: connected(h) }); await h.flush();
  assert.equal(h.writes.length, 0);
  assert.equal(h.stats.compassListeners, 1);
  assert.equal(h.stats.connects, 1);
});

test("AOD-only startup runs no sensors or REM and uses a smaller clock on black", () => {
  const h = watchfaceHarness(); h.setScreen("aod"); h.build();
  assert.equal(h.stats.starts, 0);
  assert.equal(h.stats.connects, 0);
  assert.equal(h.timers.size, 0);
  const aod = h.widgets.filter((w) => w.props.show_level === 2);
  assert.equal(aod.find((w) => w.type === "FILL_RECT").props.color, 0);
  assert.match(aod.find((w) => w.type === "IMG_TIME").props.hour_array[0], /tactical\/aod-0/);
});

test("stale REM responses use the disconnected panels and enter backoff", async () => {
  const h = watchfaceHarness(); h.build(); h.tap();
  h.requests[0].resolve({ data: connected(h, { updatedAt: h.now() - 180000 }) }); await h.flush();
  assert.ok(h.text().includes("STALE"));
  assert.ok(h.text().includes("ALT"));
  assert.ok(!h.text().includes("TEAM"));
  h.advance(60000);
  assert.equal(h.requests.length, 2);
});
