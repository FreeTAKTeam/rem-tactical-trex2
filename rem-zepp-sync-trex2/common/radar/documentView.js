import { ageText, ages, sourceStatus } from "./state.js";
import { formatBearing, formatDistance, shortText } from "./geometry.js";
import { INFO_ACTIONS, panelCount } from "./navigation.js";
import { labelLines, labelPreview } from "./textLayout.js";

const C = { background: 0x030809, white: 0xf2f6f5, muted: 0x91a7ab, teal: 0x65dfd2, warning: 0xffd15c };

// Full-height native scroll panels; only the candidate rows need touch widgets.
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
  const lines = (id, value, panel, y, size = 28, color = C.white, limit = 17) => {
    const chars = Array.from(String(value));
    for (let i = 0; i < chars.length; i += limit) text(`${id}-${i / limit}`, chars.slice(i, i + limit).join(""), panel, y + i / limit * (size + 8), size, color);
  };
  const header = (panel, title) => {
    nodes.push({ id: `background-${panel}`, type: "rect", x: 0, y: panel * 454, w: 454, h: 454, color: C.background });
    text(`title-${panel}`, `${state.demo ? "DEMO / " : ""}${title}`, panel, 40, 24, C.white, 65, 324);
    text(`page-${panel}`, state.view === "candidates" ? "UP / DOWN · SELECT" : `UP / DOWN    ${panel + 1} / ${pages}`, panel, 381, 22, C.muted, 77, 300, 30);
  };
  const heading = (panel) => {
    text("wrist-label", "WRIST HEADING", panel, 105, 24, C.muted);
    text("detail-heading", formatBearing(state.heading), panel, 145, 64, state.headingState === "valid" ? C.white : C.warning, 65, 324, 80);
    const note = state.headingState === "calibration" ? "Calibrate in Compass"
      : state.headingState !== "valid" ? "Heading unavailable"
        : state.headingReference !== "true" ? "North reference unverified" : "True north";
    text("heading-note", note, panel, 243, 24, state.headingReference === "true" ? C.muted : C.warning);
    text("pose-flat", "Hold wrist flat", panel, 290, 24, C.muted);
    text("pose-forward", "Point watch forward", panel, 322, 24, C.muted);
  };
  if (state.view === "details" && marker) {
    header(0, "MARKER");
    nodes.push({ id: "detail-color", type: "circle", x: 227, y: 104, r: 11, color: marker.color });
    labelLines(shortText(marker.label, 32), 18).forEach((line, index) => text(`detail-name-${index}`, line, 0, 122 + index * 38, 32, C.white, 65, 324, 38));
    text("detail-distance", formatDistance(marker.distanceM), 0, 286, 56, C.white, 65, 324, 76);
    header(1, "DIRECTION");
    text("bearing-label", "TRUE BEARING", 1, 105, 24, C.muted);
    text("detail-bearing", formatBearing(marker.bearingDegTrue), 1, 145, 64, C.white, 65, 324, 80);
    text("bearing-reference", "Map bearing: true north", 1, 243, 24, C.muted);
    text("accuracy-label", "POSITION ACCURACY", 1, 290, 24, C.muted);
    text("position-accuracy", accuracy, 1, 322, 36);
    header(2, "WRIST"); heading(2);
    header(3, "DATA AGE");
    for (const [id, label, value, y] of [["position", "POSITION", age.position, 102], ["marker", "MARKER", age.marker, 193], ["receipt", "RECEIVED", age.link, 284]]) {
      text(`${id}-age-label`, label, 3, y, 24, C.muted);
      text(`${id}-age`, ageText(value), 3, y + 36, 36, C.warning);
    }
  } else if (state.view === "candidates") {
    header(0, "CHOOSE MARKER");
    text("candidate-count", `${state.candidateOffset + 1}–${Math.min(state.candidateOffset + 3, state.candidates.length)} of ${state.candidates.length}`, 0, 83, 24, C.muted);
    state.candidates.slice(state.candidateOffset, state.candidateOffset + 3).forEach((id, index) => {
      const m = state.snapshot && state.snapshot.markers.find((item) => item.id === id);
      if (!m) return;
      const y = 126 + index * 80;
      const focused = index === state.focus;
      nodes.push({ id: `candidate-${index}-border`, type: "rect", x: 65, y, w: 324, h: 76, color: focused ? C.teal : 0x21373b });
      nodes.push({ id: `candidate-${index}-background`, type: "rect", x: 67, y: y + 2, w: 320, h: 72, color: focused ? 0x10292d : 0x081316 });
      nodes.push({ id: `candidate-${index}-color`, type: "circle", x: 86, y: y + 24, r: 9, color: m.color });
      text(`candidate-${index}-name`, labelPreview(m.label, 16), 0, y + 2, 28, C.white, 107, 267, 36, "left");
      text(`candidate-${index}-distance`, `${formatDistance(m.distanceM)} / ${formatBearing(m.bearingDegTrue)}`, 0, y + 39, 24, C.muted, 107, 267, 32, "left");
      targets.push({ id: `candidate-row-${index}`, x: 65, y, w: 324, h: 76, action: { type: "SELECT", id }, label: `Open ${m.label}` });
    });
  } else if (state.view === "info") {
    header(0, "CONNECTION");
    lines("connection", status, 0, 109, 28, C.warning);
    text("source-count", state.snapshot ? `${state.snapshot.markers.length}${state.snapshot.truncated ? "+" : ""}` : "—", 0, 199, 64, C.white, 65, 324, 77);
    text("range-label", "MARKERS / 500 m", 0, 276, 24, C.muted);
    text("receipt-age", `Received ${ageText(age.link)}`, 0, 313, 26, C.muted);
    text("actions-hint", "SELECT for actions", 0, 349, 24, C.teal, 65, 324, 28);
    header(1, "POSITION");
    text("position-age-label", "SOURCE AGE", 1, 108, 24, C.muted);
    text("source-ages", ageText(age.position), 1, 145, 56, C.warning, 65, 324, 76);
    text("accuracy-label", "POSITION ACCURACY", 1, 257, 24, C.muted);
    text("position-accuracy", accuracy, 1, 292, 36);
    header(2, "WRIST"); heading(2);
    header(3, "ACTIONS");
    INFO_ACTIONS.forEach((item, index) => {
      text(`action-${index}`, `${index === state.focus ? "› " : "  "}${item.label}`, 3, 121 + index * 77, 34, index === state.focus ? C.teal : C.muted, 82, 302, 52, "left");
    });
    text("action-hint", "SELECT opens · BACK", 3, 350, 24, C.muted, 65, 324, 28);
  } else {
    header(0, "MARKER");
    text("removed-title", "Marker unavailable", 0, 157, 32);
    text("removed-hint", "Out of range or hidden", 0, 221, 24, C.muted);
    text("back-hint", "BACK returns to radar", 0, 309, 24, C.teal);
  }
  return { nodes, targets, status, title: state.view, hasRadar: false, pages, page: Math.min(state.panel, pages - 1) };
}
