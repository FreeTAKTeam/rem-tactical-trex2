import { RANGE_M } from "./geometry.js";

export const INFO_ACTIONS = [
  { label: "Reconnect", action: { type: "CONNECT" } },
  { label: "REM status", action: { type: "STATUS" } },
  { label: "Try demo", action: { type: "DEMO" } },
];
export const panelCount = (state) => state.view === "info" ? 4 : state.view === "details" ? 3 : 1;
const clamp = (n, max) => Math.max(0, Math.min(max, n));

export function navigate(state, direction) {
  if (state.view === "radar") {
    const markers = state.snapshot ? state.snapshot.markers.filter((m) => m.distanceM <= RANGE_M) : [];
    if (!markers.length) return state;
    const index = markers.findIndex((m) => m.id === state.selectedId);
    const next = index < 0 ? direction > 0 ? 0 : markers.length - 1 : (index + direction + markers.length) % markers.length;
    return { ...state, selectedId: markers[next].id };
  }
  if (state.view === "candidates") {
    if (!state.candidates.length) return state;
    const index = clamp(state.candidateOffset + state.focus + direction, state.candidates.length - 1);
    return { ...state, candidateOffset: Math.floor(index / 3) * 3, focus: index % 3 };
  }
  if (state.view === "info" && state.panel === 3) {
    if (direction < 0 && state.focus === 0) return { ...state, panel: 2 };
    return { ...state, focus: clamp(state.focus + direction, INFO_ACTIONS.length - 1) };
  }
  return { ...state, panel: clamp(state.panel + direction, panelCount(state) - 1), focus: 0 };
}

export function activate(state) {
  if (state.view === "info") return state.panel === 3 ? INFO_ACTIONS[state.focus].action : { type: "PANEL", panel: 3 };
  if (state.view === "candidates") {
    const id = state.candidates[state.candidateOffset + state.focus];
    return id ? { type: "SELECT", id } : { type: "INFO" };
  }
  if (state.view === "radar" && state.selectedId && state.snapshot && state.snapshot.markers.some((m) => m.id === state.selectedId && m.distanceM <= RANGE_M)) {
    return { type: "SELECT", id: state.selectedId };
  }
  return { type: "INFO" };
}
