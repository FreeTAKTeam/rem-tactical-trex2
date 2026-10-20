import { MAX_MARKERS, RANGE_M, wrap360, smoothHeading, hitCandidates, shortText } from "./geometry.js";
import { navigate, panelCount } from "./navigation.js";

export const STALE_MS = 15000;

export function createState() {
  return {
    demo: false, transport: "disconnected", snapshot: null, receipt: null, clockReliable: true,
    sourceAgeAtReceipt: null, positionAgeAtReceipt: null, markerAgesAtReceipt: {},
    heading: null, orientation: 0, headingState: "unavailable", headingReference: "unverified",
    view: "radar", selectedId: null, candidates: [], candidateOffset: 0, error: null, acceptSession: true,
    panel: 0, focus: 0, infoReturn: "radar",
  };
}

const validTime = (value) => value === null || (Number.isFinite(value) && value > 0);
const ageAt = (time, generated) => time === null || time > generated + 5000 ? null : Math.max(0, generated - time);

// Validate the complete native radar projection before replacing UI state.
export function validateSnapshot(value) {
  if (!value || value.protocolVersion !== 1 || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId.length > 128 ||
      typeof value.snapshotId !== "string" || !value.snapshotId || value.snapshotId.length > 128 ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      !Number.isFinite(value.generatedAtUnixMs) || value.generatedAtUnixMs <= 0 ||
      !value.observer || typeof value.observer.positionValid !== "boolean" ||
      !validTime(value.observer.positionUpdatedAtUnixMs) ||
      value.observer.bearingReference !== "true" || !Array.isArray(value.markers) ||
      value.markers.length > MAX_MARKERS) return null;
  const accuracyM = value.observer.accuracyM === undefined ? null : value.observer.accuracyM;
  if ((accuracyM !== null && (!Number.isFinite(accuracyM) || accuracyM < 0)) ||
      (!value.observer.positionValid && value.markers.length !== 0)) return null;
  const ids = new Set();
  const markers = [];
  for (const m of value.markers) {
    if (!m || typeof m.id !== "string" || !m.id || m.id.length > 128 || ids.has(m.id) ||
        !Number.isInteger(m.color) || m.color < 0 || m.color > 0xffffff ||
        typeof m.label !== "string" || m.label.length > 256 || !Number.isFinite(m.distanceM) || m.distanceM < 0 ||
        (m.distanceM >= 0.5 && (wrap360(m.bearingDegTrue) === null || m.bearingDegTrue < 0 || m.bearingDegTrue >= 360)) ||
        !validTime(m.markerUpdatedAtUnixMs)) return null;
    ids.add(m.id);
    markers.push({
      id: m.id, label: shortText(m.label, 32), color: m.color,
      distanceM: m.distanceM, bearingDegTrue: m.distanceM < 0.5 ? null : m.bearingDegTrue,
      markerUpdatedAtUnixMs: m.markerUpdatedAtUnixMs,
    });
  }
  return {
    protocolVersion: 1, sessionId: String(value.sessionId).slice(0, 128),
    snapshotId: String(value.snapshotId).slice(0, 128), sequence: value.sequence,
    generatedAtUnixMs: value.generatedAtUnixMs,
    observer: { positionValid: value.observer.positionValid, positionUpdatedAtUnixMs: value.observer.positionUpdatedAtUnixMs,
      accuracyM: value.observer.positionValid ? accuracyM : null, bearingReference: "true" },
    markers, truncated: value.truncated === true,
  };
}

export function receiveSnapshot(state, raw, monotonicMs, wallMs) {
  const snapshot = validateSnapshot(raw);
  if (!snapshot) return { ...state, error: "INVALID_SNAPSHOT" };
  const previous = state.snapshot;
  if (previous && previous.sessionId === snapshot.sessionId && previous.sequence >= snapshot.sequence) return state;
  // A session switch must be explicit at the transport boundary (reconnect).
  if (previous && previous.sessionId !== snapshot.sessionId && !state.acceptSession) return state;
  const sourceAge = ageAt(snapshot.generatedAtUnixMs, wallMs);
  const inRange = (id) => snapshot.markers.some((m) => m.id === id && m.distanceM <= RANGE_M);
  const selectedExists = inRange(state.selectedId);
  const candidates = state.candidates.filter(inRange);
  const focusedCandidate = state.candidates[state.candidateOffset + state.focus];
  const retainedFocus = candidates.indexOf(focusedCandidate);
  const candidateIndex = retainedFocus >= 0 ? retainedFocus : Math.max(0, Math.min(state.candidateOffset + state.focus, candidates.length - 1));
  const reconcileView = (view) => view === "details" && !selectedExists ? "removed"
    : view === "candidates" && !candidates.length ? "radar" : view;
  const view = reconcileView(state.view);
  const markerAgesAtReceipt = Object.create(null);
  for (const m of snapshot.markers) markerAgesAtReceipt[m.id] = ageAt(m.markerUpdatedAtUnixMs, wallMs);
  return {
    ...state, snapshot, receipt: monotonicMs, transport: "connected", error: null, acceptSession: false,
    sourceAgeAtReceipt: sourceAge,
    positionAgeAtReceipt: ageAt(snapshot.observer.positionUpdatedAtUnixMs, wallMs), markerAgesAtReceipt,
    selectedId: selectedExists ? state.selectedId : null,
    view, infoReturn: reconcileView(state.infoReturn), panel: view === state.view ? state.panel : 0,
    candidates, candidateOffset: Math.floor(candidateIndex / 3) * 3, focus: state.view === "candidates" ? candidateIndex % 3 : state.focus,
  };
}

export function reduce(state, action) {
  switch (action.type) {
    case "SNAPSHOT": return receiveSnapshot({ ...state, clockReliable: action.clockReliable !== false }, action.snapshot, action.now, action.wall);
    case "ERROR": return { ...state, error: action.error };
    case "DISCONNECT": return { ...state, transport: "disconnected" };
    case "RECONNECT": return { ...state, transport: "connecting", acceptSession: true };
    case "DENIED": return { ...createState(), error: "PERMISSION_DENIED",
      // REM revocation clears contacts, not this watch's independent compass.
      ...(!state.demo ? { heading: state.heading, orientation: state.orientation,
        headingState: state.headingState, headingReference: state.headingReference } : {}),
    };
    case "HEADING": {
      if (action.status !== "valid" || wrap360(action.value) === null) {
        return { ...state, headingState: action.status === "calibration" ? "calibration" : "unavailable" };
      }
      const reference = action.reference === "true" ? "true" : "unverified";
      const previous = !action.reset && state.headingState === "valid" && state.headingReference === reference ? state.heading : null;
      const heading = smoothHeading(previous, action.value, action.weight);
      // User-approved watch-compass mode rotates with valid local readings.
      // The reference stays unverified, retaining the amber/WRIST warning.
      return { ...state, heading, headingReference: reference, headingState: "valid", orientation: heading };
    }
    case "TAP": {
      if (!state.snapshot || state.view !== "radar") return state;
      const candidates = hitCandidates(state.snapshot.markers, state.orientation, action.x, action.y);
      if (candidates.length === 1) return { ...state, selectedId: candidates[0], view: "details", panel: 0 };
      if (candidates.length > 1) return { ...state, candidates, candidateOffset: 0, focus: 0, view: "candidates", panel: 0 };
      return state;
    }
    case "SELECT": return state.snapshot && state.snapshot.markers.some(({ id }) => id === action.id)
      ? { ...state, selectedId: action.id, view: "details", panel: 0 } : state;
    case "MORE": return state.candidates.length ? { ...state, candidateOffset: state.candidateOffset + 3 >= state.candidates.length ? 0 : state.candidateOffset + 3 } : state;
    case "CANDIDATE_PAGE": return { ...state, candidateOffset: Math.max(0, Math.min(Math.max(0, Math.floor((state.candidates.length - 1) / 3) * 3), state.candidateOffset + action.direction * 3)), focus: 0 };
    case "INFO": return { ...state, view: "info", panel: 0, focus: 0, infoReturn: state.view === "info" ? state.infoReturn : state.view };
    case "NAVIGATE": return navigate(state, action.direction);
    case "PANEL": return { ...state, panel: Math.max(0, Math.min(panelCount(state) - 1, action.panel)), focus: 0 };
    case "FOCUS_CLEAR": return { ...state, selectedId: null };
    case "BACK": return { ...state, view: state.view === "info" ? state.infoReturn : "radar", panel: 0, focus: 0 };
    case "RESET": return createState();
    default: return state;
  }
}

export function ages(state, now) {
  const elapsed = state.receipt === null ? 0 : Math.max(0, now - state.receipt);
  const add = (age) => age === null || age === undefined ? null : age + elapsed;
  return {
    link: state.receipt === null || !state.clockReliable ? null : elapsed,
    source: state.clockReliable ? add(state.sourceAgeAtReceipt) : null,
    position: state.clockReliable ? add(state.positionAgeAtReceipt) : null,
    marker: state.clockReliable ? add(state.markerAgesAtReceipt[state.selectedId]) : null,
  };
}

export function ageText(ms) {
  if (ms === null || ms === undefined) return "unknown";
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h`;
}

export function sourceStatus(state, now) {
  if (state.error === "PERMISSION_DENIED") return "ACCESS DENIED";
  if (!state.snapshot) return state.transport === "connecting" ? "WAITING FOR REM" : "REM NOT CONNECTED";
  if (state.transport !== "connected") return "REM DISCONNECTED";
  if (state.error) return "SNAPSHOT REJECTED";
  if (!state.clockReliable) return "WATCH CLOCK UNVERIFIED";
  if (!state.snapshot.observer.positionValid) return "POSITION UNAVAILABLE";
  const age = ages(state, now);
  if (age.position === null) return "POSITION AGE UNKNOWN";
  if (age.position > STALE_MS) return "POSITION STALE";
  if (age.source === null) return "CHECK PHONE CLOCK";
  if (age.source > STALE_MS || age.link > STALE_MS) return "SNAPSHOT STALE";
  return "REM CONNECTED";
}
