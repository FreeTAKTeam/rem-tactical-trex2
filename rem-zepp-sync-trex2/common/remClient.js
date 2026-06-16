import { compactRemStatus } from "./remModel.js";
import { normalizeRemConfig } from "./remConfig.js";

export function buildRemStatusUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, "")}/northbound/watch/status`;
}

export function buildRemHeaders(config) {
  const headers = {
    Accept: "application/json",
  };

  if (config.apiToken) {
    headers.Authorization = `Bearer ${config.apiToken}`;
  }

  return headers;
}

async function parseRemResponse(response) {
  if (!response || response.ok === false) {
    throw new Error(`REM API request failed with status ${response?.status || "unknown"}`);
  }

  if (response.body !== undefined) {
    return typeof response.body === "string"
      ? JSON.parse(response.body)
      : response.body;
  }

  if (typeof response.json === "function") {
    return response.json();
  }

  if (typeof response.text === "function") {
    return JSON.parse(await response.text());
  }

  return response;
}

export async function fetchRemWatchStatus(config, fetchImpl = globalThis.fetch) {
  const normalized = normalizeRemConfig(config);

  if (!normalized.baseUrl) {
    throw new Error("REM API baseUrl is not configured");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Side Service environment");
  }

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("REM API request timed out")), normalized.timeoutMs);
  });

  const request = fetchImpl({
    url: buildRemStatusUrl(normalized.baseUrl),
    method: "GET",
    headers: buildRemHeaders(normalized),
  }).then(async (response) => {
    const body = await parseRemResponse(response);
    return compactRemStatus(body);
  });

  return Promise.race([request, timeout]);
}
