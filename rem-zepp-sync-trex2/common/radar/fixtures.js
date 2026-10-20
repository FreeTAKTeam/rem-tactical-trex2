import { createState, receiveSnapshot, reduce } from "./state.js";

export const SCENARIOS = [
  ["radar", "Radar"], ["details", "Marker details"], ["disconnected", "Disconnected"],
  ["stale", "Stale position"], ["calibration", "Calibration"], ["empty", "No markers"],
  ["crowded", "Crowded markers"], ["maximum", "50 markers"], ["removed", "Marker removed"],
  ["unknown-age", "Unknown source age"], ["unicode", "Long names"], ["denied", "Access denied"],
  ["setup", "First launch"],
  ["connection", "Connection overview"], ["source", "Position panel"], ["wrist", "Wrist panel"],
  ["actions", "Physical actions"], ["marker-heading", "Marker wrist panel"], ["marker-age", "Marker age panel"],
];

export function fixtureSnapshot(wall) {
  return {
    protocolVersion: 1, requestId: "ui-preview", snapshotId: "demo-1", sessionId: "demo", sequence: 1,
    generatedAtUnixMs: wall - 1000, truncated: false,
    observer: { positionValid: true, positionUpdatedAtUnixMs: wall - 2000, accuracyM: 12.5, bearingReference: "true" },
    // Sample colors are explicit fixtures, never inferred from a source symbol.
    markers: [
      { id: "alpha", label: "ALPHA", color: 0x007aff, distanceM: 280, bearingDegTrue: 90, markerUpdatedAtUnixMs: wall - 2000 },
      { id: "bravo", label: "BRAVO", color: 0x00d43b, distanceM: 340, bearingDegTrue: 132, markerUpdatedAtUnixMs: wall - 4000 },
      { id: "charlie", label: "CHARLIE", color: 0xff303b, distanceM: 340, bearingDegTrue: 359, markerUpdatedAtUnixMs: wall - 3000 },
      { id: "delta", label: "DELTA", color: 0xffe600, distanceM: 385, bearingDegTrue: 282, markerUpdatedAtUnixMs: wall - 5000 },
      { id: "echo", label: "ECHO", color: 0x007aff, distanceM: 430, bearingDegTrue: 260, markerUpdatedAtUnixMs: wall - 2000 },
    ],
  };
}

export function fixtureState(name = "radar", now = 0, wall = Date.now()) {
  if (name === "setup") return createState();
  if (name === "denied") return { ...createState(), demo: true, error: "PERMISSION_DENIED" };
  const snapshot = fixtureSnapshot(wall);
  if (name === "stale") snapshot.observer.positionUpdatedAtUnixMs = wall - 92000;
  if (name === "unknown-age") {
    snapshot.observer.positionUpdatedAtUnixMs = null;
    snapshot.observer.accuracyM = null;
    snapshot.markers.forEach((m) => { m.markerUpdatedAtUnixMs = null; });
  }
  if (name === "empty") snapshot.markers = [];
  if (name === "crowded") snapshot.markers = Array.from({ length: 7 }, (_, i) => ({
    ...snapshot.markers[i % 5], id: `cluster-${i}`, label: ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF"][i],
    distanceM: 273 + i * 2, bearingDegTrue: 88 + i,
  }));
  if (name === "maximum") {
    snapshot.markers = Array.from({ length: 50 }, (_, i) => ({
      ...snapshot.markers[i % 5], id: `marker-${i}`, label: `UNIT ${i + 1}`,
      distanceM: 65 + (i * 83 % 420), bearingDegTrue: i * 137.5 % 360,
    }));
    snapshot.truncated = true;
  }
  if (name === "unicode") snapshot.markers[0].label = "ÉQUIPE NORD / 救援 ALPHA LONG NAME";
  let state = receiveSnapshot({ ...createState(), demo: true }, snapshot, now, wall);
  state = reduce(state, { type: "HEADING", value: 45, status: "valid", reference: "true", weight: 1 });
  state.selectedId = snapshot.markers.length ? snapshot.markers[0].id : null;
  if (name === "details" || name === "unicode") state.view = "details";
  if (["connection", "source", "wrist", "actions"].includes(name)) {
    state.view = "info";
    state.panel = ["connection", "source", "wrist", "actions"].indexOf(name);
  }
  if (name === "marker-heading" || name === "marker-age") { state.view = "details"; state.panel = name === "marker-heading" ? 1 : 2; }
  if (name === "removed") state = reduce({ ...state, view: "details" }, {
    type: "SNAPSHOT", snapshot: { ...snapshot, sequence: 2, markers: snapshot.markers.slice(1) }, now, wall,
  });
  if (name === "calibration") state = reduce(state, { type: "HEADING", status: "calibration" });
  if (name === "disconnected") state = { ...state, transport: "disconnected", receipt: now - 32000 };
  return state;
}
