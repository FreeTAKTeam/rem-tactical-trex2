import { validateSnapshot } from "./state.js";
import { RADAR_METHOD, RADAR_RESPONSE, RADAR_ERROR } from "./phoneClient.js";

/** Owns one visible-page request and its retry timer, independent of rendering. */
export function createRadarController({ bridge, emit, clock, wallNow = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout,
  makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }) {
  let active = false;
  let generation = 0;
  let timer = null;
  let pending = null;
  let backoff = 5000;
  let channel = null;
  let session = null;
  let sequence = -1;
  let allowSession = true;
  const retired = [];
  function retire(id) { if (id && !retired.includes(id)) retired.push(id); if (retired.length > 16) retired.shift(); }
  function schedule(delay, current) {
    if (!active || generation !== current) return;
    timer = setTimer(() => { timer = null; poll(); }, delay);
  }
  function poll() {
    if (!active || pending || !bridge || typeof bridge.request !== "function") return;
    const current = generation;
    const requestId = makeId();
    let request;
    try { request = bridge.request({ method: RADAR_METHOD, requestId }, { timeout: 8000 }); }
    catch { emit({ type: "DISCONNECT" }); schedule(backoff, current); return; }
    pending = request;
    request.then((reply) => {
      if (!active || generation !== current || pending !== request) return;
      pending = null;
      if (!reply || reply.requestId !== requestId) { rejected(current); return; }
      if (reply.type === RADAR_ERROR) { failed(reply.code, current); return; }
      const snapshot = validateSnapshot(reply.snapshot);
      if (reply.type !== RADAR_RESPONSE || !snapshot || reply.snapshot.requestId !== requestId ||
          typeof reply.channelId !== "string" || !reply.channelId || reply.channelId.length > 128 ||
          (snapshot.sessionId !== session && retired.includes(snapshot.sessionId))) { rejected(current); return; }
      const changedChannel = channel !== null && channel !== reply.channelId;
      if (session !== null && snapshot.sessionId !== session && !allowSession && !changedChannel) { rejected(current); return; }
      if (snapshot.sessionId === session && snapshot.sequence <= sequence) { rejected(current); return; }
      if (changedChannel) emit({ type: "DENIED" });
      if (snapshot.sessionId !== session) {
        retire(session);
        sequence = -1;
        emit({ type: "RECONNECT" });
      }
      channel = reply.channelId;
      session = snapshot.sessionId;
      sequence = snapshot.sequence;
      allowSession = false;
      emit({ type: "SNAPSHOT", snapshot, now: clock.now(), wall: wallNow(), clockReliable: clock.reliable });
      backoff = 5000;
      schedule(backoff, current);
    }, () => {
      if (!active || generation !== current || pending !== request) return;
      pending = null;
      failed("TransportUnavailable", current);
    });
  }
  function rejected(current) {
    emit({ type: "ERROR", error: "INVALID_SNAPSHOT" });
    emit({ type: "DISCONNECT" });
    active = false;
  }
  function failed(code, current) {
    if (["PermissionDenied", "NotConfigured", "ConfigurationChanged"].includes(code)) {
      emit({ type: "DENIED" });
      active = false;
      return;
    }
    if (["InvalidRequest", "InvalidSnapshot", "ResponseTooLarge"].includes(code)) { rejected(current); return; }
    emit({ type: "DISCONNECT" });
    schedule(backoff, current);
    backoff = Math.min(60000, backoff * 2);
  }
  function stop() {
    active = false;
    generation++;
    if (timer !== null) clearTimer(timer);
    timer = null;
    const request = pending;
    pending = null;
    if (request && typeof request.cancel === "function") request.cancel();
  }
  function start() {
    stop();
    if (!bridge) return;
    active = true;
    allowSession = true;
    backoff = 5000;
    emit({ type: "RECONNECT" });
    poll();
  }
  return { start, stop };
}
