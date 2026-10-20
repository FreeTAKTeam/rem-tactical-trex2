import assert from "node:assert/strict";
import test from "node:test";
import { project, hitCandidates, visibleMarkers, smoothHeading, wrap360, RADAR, shortText } from "../common/radar/geometry.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test("all cardinal headings and bearings use heading-up screen coordinates", () => {
  for (const heading of [0, 90, 180, 270]) {
    for (const bearing of [0, 90, 180, 270]) {
      const p = project(bearing, 500, heading);
      const angle = ((bearing - heading + 360) % 360) / 90;
      const delta = [[0, -208], [208, 0], [0, 208], [-208, 0]][angle];
      near(p.x, RADAR.cx + delta[0]); near(p.y, RADAR.cy + delta[1]);
    }
  }
  assert.deepEqual(project(90, 500, 90), { x: RADAR.cx, y: RADAR.cy - 208 });
  near(project(0, 500, 90).x, RADAR.cx - 208);
});

test("linear range filters distant contacts, accepts boundary, and handles coincident points without a bearing", () => {
  near(project(0, 250, 0).y, RADAR.cy - 104);
  assert.equal(project(0, 501, 0), null);
  assert.equal(project(0, -1, 0), null);
  assert.equal(project(NaN, 1, 0), null);
  assert.equal(project(0, Infinity, 0), null);
  assert.deepEqual(project(null, 0, null), { x: RADAR.cx, y: RADAR.cy });
  assert.equal(visibleMarkers([{ distanceM: 501, bearingDegTrue: 0 }], 0).length, 0);
});

test("wrap and circular smoothing cross north using the shortest arc", () => {
  assert.equal(wrap360(-5), 355);
  assert.equal(wrap360(361), 1);
  assert.equal(wrap360(null), null);
  assert.equal(wrap360("90"), null);
  near(smoothHeading(359, 1, 0.5), 0);
  near(smoothHeading(1, 359, 0.5), 0);
  assert.equal(smoothHeading(null, 135), 135);
  assert.equal(smoothHeading(90, NaN), 90);
});

test("24-pixel radial hit target returns all overlaps in stable distance/id order", () => {
  const markers = [
    { id: "z", distanceM: 200, bearingDegTrue: 0 },
    { id: "a", distanceM: 200, bearingDegTrue: 0 },
    { id: "near", distanceM: 190, bearingDegTrue: 0 },
    { id: "far", distanceM: 501, bearingDegTrue: 0 },
  ];
  const p = project(0, 200, 0);
  assert.deepEqual(hitCandidates(markers, 0, p.x, p.y), ["near", "a", "z"]);
  assert.deepEqual(hitCandidates(markers, 0, 0, 0), []);
});

test("display strings remove controls and truncate by Unicode code points", () => {
  assert.equal(shortText("Équipe\nα", 20), "Équipe α");
  assert.equal(shortText("😀😀😀😀", 3), "😀😀…");
});
