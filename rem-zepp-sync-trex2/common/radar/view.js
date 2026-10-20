import { RADAR, RANGE_M, MAX_MARKERS, project, visibleMarkers, hitCandidates, formatDistance } from "./geometry.js";
import { sourceStatus } from "./state.js";
import { documentScene } from "./documentView.js";

export const C = {
  background: 0x030809, white: 0xf2f6f5, muted: 0x91a7ab, grid: 0x27434a,
  teal: 0x65dfd2, orange: 0xff893d, warning: 0xffd15c, line: 0x21373b,
};

// One scene drives the native watch and review. Only the radar owns a tap layer.
export function radarScene(state, now) {
  if (state.view !== "radar") return documentScene(state, now);
  const nodes = [], targets = [];
  const text = (id, value, x, y, w, h, size, color = C.white) =>
    nodes.push({ id, type: "text", text: String(value), x, y, w, h, size, color, align: "center" });
  const circle = (id, x, y, r, color, visible = true) => nodes.push({ id, type: "circle", x, y, r, color, visible });
  const image = (id, src, x, y, w, h) => nodes.push({ id, type: "image", src, x, y, w, h });
  const status = sourceStatus(state, now);
  const healthy = status === "REM CONNECTED";
  const disconnected = state.transport !== "connected";
  const indicator = disconnected ? "grey" : healthy && state.headingState === "valid" && state.headingReference === "true" ? "" : "warning";
  const suffix = indicator ? `-${indicator}` : "";
  const plotted = state.snapshot ? visibleMarkers(state.snapshot.markers, state.orientation) : [];
  nodes.push({ id: "background", type: "rect", x: 0, y: 0, w: 454, h: 454, color: C.background });
  image("dial", "radar/dial.png", 0, 0, RADAR.size, RADAR.size);
  image("cone", `radar/cone${suffix}.png`, RADAR.cx - RADAR.coneWidth / 2, RADAR.cy - RADAR.radius, RADAR.coneWidth, RADAR.radius);
  for (const [label, bearing] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
    const p = project(bearing, RANGE_M, state.orientation, RADAR.radius - 30);
    text(`cardinal-${label}`, label, p.x - 14, p.y - 14, 28, 28, 22, label === "N" ? C.white : C.muted);
  }
  text("range", formatDistance(RANGE_M), 313, 53, 62, 20, 12, C.muted);
  text("half-range", String(RANGE_M / 2), 303, 163, 35, 18, 11, C.muted);
  for (let index = 0; index < MAX_MARKERS; index++) {
    const m = plotted[index];
    if (!m) {
      for (const part of ["outline", "separator", "color"]) circle(`marker-${index}-${part}`, RADAR.cx, RADAR.cy, 1, C.background, false);
      continue;
    }
    const selected = m.id === state.selectedId;
    circle(`marker-${index}-outline`, m.point.x, m.point.y, selected ? 13 : 10, selected ? C.white : healthy ? C.background : C.muted);
    circle(`marker-${index}-separator`, m.point.x, m.point.y, selected ? 10 : 8, C.background);
    circle(`marker-${index}-color`, m.point.x, m.point.y, 7, m.color);
  }
  image("operator", `radar/operator${suffix}.png`, RADAR.cx - 14, RADAR.cy - 16, 28, 32);
  targets.push({ x: RADAR.cx - 24, y: RADAR.cy - 24, w: 48, h: 48, action: { type: "INFO" }, label: "Connection details" });
  if (state.snapshot && state.snapshot.truncated) for (let i = 0; i < 3; i++) circle(`source-limit-${i}`, 215 + i * 12, 407, 3, C.warning);
  if (state.demo) for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    circle(`demo-${i}`, RADAR.cx + 220 * Math.sin(a), RADAR.cy - 220 * Math.cos(a), 2, C.teal);
  }
  return { nodes, targets, status, title: state.view, hasRadar: true, pages: 1, page: 0 };
}

export function actionAt(scene, state, x, y) {
  if (state.view === "radar" && state.snapshot && hitCandidates(state.snapshot.markers, state.orientation, x, y).length) return { type: "TAP", x, y };
  const contentY = y + (scene.page || 0) * 454;
  const target = scene.targets.find((t) => x >= t.x && x <= t.x + t.w && contentY >= t.y && contentY <= t.y + t.h);
  if (target) return target.action;
  if (state.view === "radar" && state.snapshot && Math.hypot(x - RADAR.cx, y - RADAR.cy) <= RADAR.radius + 24) return { type: "TAP", x, y };
  return null;
}
