import { MessageBuilder } from "../shared/message";
import { REM_MESSAGE_TYPES, REM_REQUEST_METHOD } from "../common/messageTypes";
import { remConfig, normalizeRemConfig } from "../common/remConfig";
import { fetchRemWatchStatus } from "../common/remClient";
import { getMockRemStatus, getMockStateCount } from "../common/mockRem";
import { logRemDebug, sanitizeForLog } from "../common/logging";

const messageBuilder = new MessageBuilder();

let mockIndex = 0;
let lastStatus = null;
let lastError = "";

function zeppFetchImpl(url, options) {
  return fetch({
    url,
    method: options?.method || "GET",
    headers: options?.headers || {},
  }).then((response) => {
    const body = response && response.body !== undefined ? response.body : response;
    return {
      ok: !(response && response.status && Number(response.status) >= 400),
      status: response?.status || 200,
      json: async () => (typeof body === "string" ? JSON.parse(body) : body),
      text: async () => (typeof body === "string" ? body : JSON.stringify(body || {})),
    };
  });
}

async function resolveRemStatus(config) {
  const normalized = normalizeRemConfig(config);

  if (normalized.mockMode) {
    const status = getMockRemStatus(mockIndex, Date.now());
    mockIndex = (mockIndex + 1) % getMockStateCount();
    return status;
  }

  return fetchRemWatchStatus(normalized, zeppFetchImpl);
}

async function handleStatusRequest(ctx, request) {
  const params = request?.params || {};
  const config = normalizeRemConfig({ ...remConfig, ...params.config });

  try {
    logRemDebug("app-side request", {
      type: REM_MESSAGE_TYPES.request,
      config: sanitizeForLog(config),
    });
    const status = await resolveRemStatus(config);
    lastStatus = status;
    lastError = "";
    ctx.response({
      type: REM_MESSAGE_TYPES.response,
      data: status,
      debug: {
        mockMode: config.mockMode,
        lastError,
      },
    });
  } catch (error) {
    lastError = String(error?.message || error);
    ctx.response({
      type: REM_MESSAGE_TYPES.error,
      error: lastError,
      data: lastStatus,
    });
  }
}

AppSideService({
  onInit() {
    console.log("REM WF Sync Proof app-side init");
    messageBuilder.listen(() => {});
    messageBuilder.on("request", (ctx) => {
      const request = messageBuilder.buf2Json(ctx.request.payload);
      if (
        request?.type === REM_MESSAGE_TYPES.request ||
        request?.method === REM_REQUEST_METHOD
      ) {
        handleStatusRequest(ctx, request);
      }
    });
  },

  onRun() {
    console.log("REM WF Sync Proof app-side run");
  },

  onDestroy() {
    console.log("REM WF Sync Proof app-side destroy");
  },
});
