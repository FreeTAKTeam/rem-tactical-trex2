import { validateSnapshot } from "./state.js";

export const RADAR_METHOD = "REM_RADAR_SNAPSHOT";
export const RADAR_CONFIG_KEY = "remRadarConfig";
export const RADAR_RESPONSE = "rem.radar.response";
export const RADAR_ERROR = "rem.radar.error";
const MAX_BYTES = 65536;
const fail = (code) => Object.assign(new Error(code), { code });

export function parsePhoneConfig(raw) {
  let value;
  try { value = JSON.parse(raw || "{}"); } catch { throw fail("NotConfigured"); }
  if (value.enabled !== true) throw fail("NotConfigured");
  if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535 ||
      typeof value.token !== "string" || !/^[a-f0-9]{64}$/.test(value.token)) throw fail("NotConfigured");
  return { port: value.port, token: value.token };
}

export function utf8Size(value) {
  let count = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (count > MAX_BYTES) break;
  }
  return count;
}

export async function decodeRadarResponse(response, requestId) {
  if (!response) throw fail("TransportUnavailable");
  const status = response.status === undefined ? 200 : Number(response.status);
  if (!Number.isInteger(status) || status < 100 || status > 599) throw fail("TransportUnavailable");
  if (status === 401 || status === 403) throw fail("PermissionDenied");
  if (status === 429) throw fail("Busy");
  let body = response.body;
  if (body === undefined && typeof response.text === "function") body = await response.text();
  if (body === undefined && typeof response.json === "function") body = await response.json();
  const json = typeof body === "string" ? body : JSON.stringify(body);
  if (!json) throw fail(status >= 400 ? "SourceUnavailable" : "InvalidSnapshot");
  if (utf8Size(json) > MAX_BYTES) throw fail("ResponseTooLarge");
  let value;
  try { value = JSON.parse(json); } catch { throw fail(status >= 400 ? "SourceUnavailable" : "InvalidSnapshot"); }
  if (!value || typeof value !== "object") throw fail("InvalidSnapshot");
  if (value.ok === false) {
    if (value.protocolVersion !== 1 || value.requestId !== requestId || !value.error) throw fail("InvalidSnapshot");
    const code = value.error.code;
    if (["PermissionDenied", "Unauthorized", "SessionExpired", "RadarDisabled"].includes(code)) throw fail("PermissionDenied");
    if (["InvalidRequest", "ResponseTooLarge"].includes(code)) throw fail(code);
    throw fail("SourceUnavailable");
  }
  if (status < 200 || status >= 300 || response.ok === false) throw fail("SourceUnavailable");
  if (value.requestId !== requestId || !validateSnapshot(value)) throw fail("InvalidSnapshot");
  // Pass the validated projection, not arbitrary fields from the HTTP service.
  return { ...validateSnapshot(value), requestId };
}

/** Credentials and fixed loopback destination are exclusively phone-owned. */
export function createRadarPhoneClient({ readConfig, fetchImpl, setTimer = setTimeout, clearTimer = clearTimeout,
  timeoutMs = 6000, channelId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }) {
  let active = true;
  let pending = null;
  let lastConfig = null;
  let channel = channelId();
  let sourceSession = null;
  let generation = 0;
  function config() { try { return readConfig(); } catch { throw fail("NotConfigured"); } }
  function request(requestId) {
    if (!active) return Promise.reject(fail("PhoneStopped"));
    if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(requestId)) return Promise.reject(fail("InvalidRequest"));
    let raw;
    let settings;
    try {
      raw = config();
      settings = parsePhoneConfig(raw);
    } catch (error) { return Promise.reject(error); }
    if (raw !== lastConfig) { lastConfig = raw; generation++; channel = channelId(); sourceSession = null; }
    if (pending) return Promise.reject(fail("Busy"));
    if (typeof fetchImpl !== "function") return Promise.reject(fail("TransportUnavailable"));
    const requestGeneration = generation;
    return new Promise((resolve, reject) => {
      const job = { timer: null, settled: false, reject };
      pending = job;
      function finish(error, snapshot) {
        if (pending === job) pending = null;
        if (job.settled) return;
        job.settled = true;
        if (job.timer !== null) clearTimer(job.timer);
        job.timer = null;
        let current = false;
        try { current = active && generation === requestGeneration && config() === raw; } catch { /* Revoked. */ }
        if (!current) reject(fail("ConfigurationChanged"));
        else if (error) reject(error);
        else {
          // A validated authenticated source restart starts a fresh watch channel,
          // even when the outage completed between polls. Credentials stay on the phone.
          if (sourceSession !== null && sourceSession !== snapshot.sessionId) channel = channelId();
          sourceSession = snapshot.sessionId;
          resolve({ type: RADAR_RESPONSE, requestId, channelId: channel, snapshot });
        }
      }
      job.timer = setTimer(() => {
        job.timer = null;
        if (job.settled) return;
        job.settled = true;
        reject(fail("TransportTimeout"));
        // Zepp fetch has no documented cancellation API. Retain the single
        // HTTP slot until it settles; repeated timeouts cannot create a queue.
      }, timeoutMs);
      try {
        Promise.resolve(fetchImpl({
          url: `http://127.0.0.1:${settings.port}/northbound/watch/radar`, method: "GET",
          headers: { Accept: "application/json", Authorization: `Bearer ${settings.token}`, "X-REM-Radar-Request": requestId },
        })).then((response) => decodeRadarResponse(response, requestId))
          .then((snapshot) => finish(null, snapshot), (error) => finish(fail(
            ["PermissionDenied", "Busy", "SourceUnavailable", "InvalidRequest", "ResponseTooLarge", "InvalidSnapshot"].includes(error && error.code)
              ? error.code : "TransportUnavailable")));
      } catch { finish(fail("TransportUnavailable")); }
    });
  }
  function stop() {
    active = false;
    generation++;
    if (pending && !pending.settled) {
      pending.settled = true;
      if (pending.timer !== null) clearTimer(pending.timer);
      pending.timer = null;
      pending.reject(fail("PhoneStopped"));
    }
  }
  return { request, stop };
}
