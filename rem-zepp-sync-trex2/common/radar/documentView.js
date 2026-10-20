import { ageText, ages, sourceStatus } from "./state.js";
import { formatBearing, formatDistance, shortText } from "./geometry.js";
import { INFO_ACTIONS, panelCount } from "./navigation.js";

const C = { background: 0x030809, white: 0xf2f6f5, muted: 0x91a7ab, teal: 0x65dfd2, warning: 0xffd15c };

// Full-height vertical panels, using native scroll rather than a touch overlay.
export function documentScene(state, now) {
  const nodes = [], targets = [];
  const pages = panelCount(state);
  const status = sourceStatus(state, now);
  const age = ages(state, now);
  const accuracyM = state.snapshot && state.snapshot.observer.accuracyM;
  const accuracy = accuracyM === null || accuracyM === undefined ? "Unknown" : formatDistance(accuracyM);
  const marker = state.snapshot && state.snapshot.markers.find((m) => m.id === state.selectedId);
  const text = (id, value, panel, y, size = 26, color = C.white, x = 65, w = 324, h = 40, align = "center") =>
    nodes.push({ id, type: "text", text: String(value), x, y: panel * 454 + y, w, h, size, color, align });
  const lines = (id, value, panel, y, size = 26, color = C.white, limit = 20) => {
    const chars = Array.from(String(value));
    for (let i = 0; i < chars.length; i += limit) text(`${id}-${i / limit}`, chars.slice(i, i + limit).join(""), panel, y + i / limit * (size + 8), size, color);
  };
  const header = (panel, title) => {
    nodes.push({ id: `background-${panel}`, type: "rect", x: 0, y: panel * 454, w: 454, h: 454, color: C.background });
    text(`title-${panel}`, `${state.demo ? "DEMO / " : ""}${title}`, panel, 40, state.demo ? 20 : 22, C.white, 75, 304);
    text(`page-${panel}`, `UP / DOWN    ${panel + 1} / ${pages}`, panel, 381, 16, C.muted, 77, 300, 28);
  };
  const heading = (panel, showAccuracy = false) => {
    text("wrist-label", "WRIST HEADING", panel, 105, 18, C.muted);
    text("detail-heading", formatBearing(state.heading), panel, 145, 58, state.headingState === "valid" ? C.white : C.warning, 65, 324, 78);
    const note = state.headingState === "calibration" ? "Calibrate in Compass"
      : state.headingState !== "valid" ? "Heading unavailable"
        : state.headingReference !== "true" ? "North reference unverified" : "True north";
    text("heading-note", note, panel, 243, 20, state.headingReference === "true" ? C.muted : C.warning);
    text("pose-flat", "Hold wrist flat", panel, 290, 20, C.muted);
    text(showAccuracy ? "position-accuracy" : "pose-forward", showAccuracy ? `Accuracy ${accuracy}` : "Point watch forward", panel, 322, 20, C.muted);
  };
  if (state.view === "details" && marker) {
    header(0, "MARKER");
    nodes.push({ id: "detail-color", type: "circle", x: 227, y: 108, r: 10, color: marker.color });
    lines("detail-name", shortText(marker.label, 32), 0, 131, 28);
    text("detail-distance", formatDistance(marker.distanceM), 0, 218, 54, C.white, 65, 324, 76);
    text("bearing-label", "TRUE BEARING", 0, 305, 18, C.muted);
    text("detail-bearing", formatBearing(marker.bearingDegTrue), 0, 334, 30);
    header(1, "WRIST"); heading(1, true);
    header(2, "DATA AGE");
    for (const [id, label, value, y] of [["position", "POSITION", age.position, 102], ["marker", "MARKER", age.marker, 193], ["receipt", "RECEIVED", age.link, 284]]) {
      text(`${id}-age-label`, label, 2, y, 18, C.muted);
      text(`${id}-age`, ageText(value), 2, y + 32, 32, C.warning);
    }
  } else if (state.view === "candidates") {
    header(0, "CHOOSE MARKER");
    text("candidate-count", `${state.candidateOffset + 1}–${Math.min(state.candidateOffset + 3, state.candidates.length)} of ${state.candidates.length}`, 0, 83, 20, C.muted);
    state.candidates.slice(state.candidateOffset, state.candidateOffset + 3).forEach((id, index) => {
      const m = state.snapshot && state.snapshot.markers.find((item) => item.id === id);
      if (!m) return;
      const y = 132 + index * 77;
      nodes.push({ id: `candidate-${index}-color`, type: "circle", x: 83, y: y + 20, r: 7, color: m.color });
      text(`candidate-${index}-name`, shortText(m.label, 17), 0, y, 25, index === state.focus ? C.teal : C.white, 105, 270, 34, "left");
      text(`candidate-${index}-distance`, `${formatDistance(m.distanceM)} / ${formatBearing(m.bearingDegTrue)}`, 0, y + 33, 19, C.muted, 105, 270, 29, "left");
    });
  } else if (state.view === "info") {
    header(0, "CONNECTION");
    lines("connection", `${state.demo ? "DEMO / " : ""}${status}`, 0, 111, 27, C.warning, 21);
    text("source-count", state.snapshot ? `${state.snapshot.markers.length}${state.snapshot.truncated ? "+" : ""}` : "—", 0, 201, 56, C.white, 65, 324, 75);
    text("range-label", "MARKERS / 500 m", 0, 276, 19, C.muted);
    text("receipt-age", `Received ${ageText(age.link)} ago`, 0, 313, 23, C.muted);
    text("actions-hint", "SELECT opens actions", 0, 347, 17, C.teal);
    header(1, "POSITION");
    text("position-age-label", "SOURCE AGE", 1, 108, 18, C.muted);
    text("source-ages", ageText(age.position), 1, 145, 47, C.warning, 65, 324, 76);
    text("accuracy-label", "POSITION ACCURACY", 1, 257, 18, C.muted);
    text("position-accuracy", accuracy, 1, 292, 34);
    header(2, "WRIST"); heading(2);
    header(3, "ACTIONS");
    INFO_ACTIONS.forEach((item, index) => {
      text(`action-${index}`, `${index === state.focus ? "› " : "  "}${item.label}`, 3, 121 + index * 77, 29, index === state.focus ? C.teal : C.muted, 93, 290, 52, "left");
    });
    text("action-hint", "SELECT opens · BACK returns", 3, 350, 17, C.muted);
  } else {
    header(0, "MARKER");
    text("removed-title", "Marker unavailable", 0, 157, 29);
    text("removed-hint", "No longer in range or visible", 0, 221, 20, C.muted);
    text("back-hint", "BACK returns to radar", 0, 309, 20, C.teal);
  }
  return { nodes, targets, status, title: state.view, hasRadar: false, pages, page: Math.min(state.panel, pages - 1) };
}
