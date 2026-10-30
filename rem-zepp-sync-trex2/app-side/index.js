import { MessageBuilder } from "../shared/message";
import {
  REM_DIAGNOSTICS_METHOD,
  REM_DIAGNOSTICS_RESPONSE,
  REM_MESSAGE_TYPES,
  REM_REQUEST_METHOD,
} from "../common/messageTypes";
import { remConfig, normalizeRemConfig } from "../common/remConfig";
import { mockCompactStatus, nextMockState } from "../common/mockRem";
import { buildRemStatusUrl, fetchRemWatchStatus } from "../common/remClient";
import { makeErrorStatus } from "../common/remModel";
import { createRadarPhoneClient, RADAR_CONFIG_KEY, RADAR_METHOD, RADAR_ERROR } from "../common/radar/phoneClient.js";

const APP_VERSION = "0.1.32";
const messageBuilder = new MessageBuilder();
const sideStartedAt = Date.now();

let currentMockState = "normal";
let lastStatus = null;
let radarClient = null;
let lastDiagnostic = {
  fetchStartedAt: "",
  fetchOkAt: "",
  fetchError: "",
  fetchUrl: "",
};

function nextVisibleMockStatus() {
  if (currentMockState === "api-error") {
    currentMockState = nextMockState(currentMockState);
  }

  const state = currentMockState;
  const status = mockCompactStatus(state);
  currentMockState = nextMockState(currentMockState);
  lastStatus = status;
  return { state, status };
}

function responseTime() {
  return String(Date.now());
}

async function resolveStatus(config) {
  const normalized = normalizeRemConfig(config);
  if (normalized.mockMode) {
    return nextVisibleMockStatus();
  }

  lastDiagnostic = {
    ...lastDiagnostic,
    fetchStartedAt: responseTime(),
    fetchError: "",
    fetchUrl: buildRemStatusUrl(normalized.baseUrl),
  };

  const status = await fetchRemWatchStatus(normalized);
  lastDiagnostic = {
    ...lastDiagnostic,
    fetchOkAt: responseTime(),
    fetchError: "",
  };
  lastStatus = status;
  return { state: "api", status };
}

function diagnosticsPayload() {
  return {
    type: REM_DIAGNOSTICS_RESPONSE,
    appVersion: APP_VERSION,
    sideStartedAt: String(sideStartedAt),
    now: responseTime(),
    fetchAvailable: typeof fetch === "function",
    ...lastDiagnostic,
  };
}

function handleDiagnosticsRequest(ctx) {
  ctx.response({
    data: diagnosticsPayload(),
  });
}

function handleStatusRequest(ctx, payload) {
  const config = normalizeRemConfig({
    ...remConfig,
    ...(payload.params && payload.params.config ? payload.params.config : {}),
  });

  resolveStatus(config)
    .then(({ state, status }) => {
      ctx.response({
        data: {
          type: REM_MESSAGE_TYPES.response,
          data: status,
          fetchedAt: responseTime(),
          mockState: config.mockMode ? state : undefined,
          diagnostics: diagnosticsPayload(),
        },
      });
    })
    .catch((error) => {
      lastDiagnostic = {
        ...lastDiagnostic,
        fetchError: String(error && error.message ? error.message : error),
      };
      ctx.response({
        data: {
          type: REM_MESSAGE_TYPES.error,
          error: String(error && error.message ? error.message : error),
          data: makeErrorStatus("ERROR", lastStatus),
          diagnostics: diagnosticsPayload(),
        },
      });
    });
}

function handleRequest(ctx) {
  let payload = {};
  try {
    payload = messageBuilder.buf2Json(ctx.request.payload);
  } catch (error) {
    ctx.response({
      data: {
        type: REM_MESSAGE_TYPES.error,
        error: "invalid request",
        data: makeErrorStatus("ERROR", lastStatus),
      },
    });
    return;
  }

  if (payload.method === RADAR_METHOD) {
    const requestId = payload.requestId;
    if (!radarClient) {
      ctx.response({ data: { type: RADAR_ERROR, requestId, code: "PhoneStopped" } });
      return;
    }
    // Ignore every watch-supplied URL, token and configuration field.
    radarClient.request(requestId).then((data) => ctx.response({ data }), (error) => {
      ctx.response({ data: { type: RADAR_ERROR, requestId, code: error.code || "TransportUnavailable" } });
    });
    return;
  }

  if (
    payload.type === REM_MESSAGE_TYPES.request ||
    payload.method === REM_REQUEST_METHOD
  ) {
    handleStatusRequest(ctx, payload);
    return;
  }

  if (payload.method === REM_DIAGNOSTICS_METHOD) {
    handleDiagnosticsRequest(ctx);
    return;
  }

  if (payload.method === "SET_MOCK_STATE") {
    currentMockState = payload.params && payload.params.state
      ? payload.params.state
      : nextMockState(currentMockState);
    const status = mockCompactStatus(currentMockState);
    lastStatus = status;
    ctx.response({ data: { result: "ok", state: currentMockState } });
    return;
  }

  ctx.response({ data: { result: "unknown-method" } });
}

AppSideService({
  onInit() {
    radarClient = createRadarPhoneClient({
      readConfig: () => typeof settings !== "undefined" && settings.settingsStorage
        ? settings.settingsStorage.getItem(RADAR_CONFIG_KEY) : null,
      fetchImpl: typeof fetch === "function" ? fetch : null,
    });
    messageBuilder.listen(() => {});
    messageBuilder.on("request", handleRequest);
  },

  onRun() {},

  onDestroy() {
    if (radarClient) radarClient.stop();
    radarClient = null;
    messageBuilder.disConnect();
  },
});
