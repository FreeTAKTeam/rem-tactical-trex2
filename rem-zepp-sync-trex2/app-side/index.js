import { MessageBuilder } from "../shared/message";
import { remConfig, normalizeRemConfig } from "../common/remConfig";
import { mockCompactStatus, nextMockState } from "../common/mockRem";
import { fetchRemWatchStatus } from "../common/remClient";
import { makeErrorStatus } from "../common/remModel";

const messageBuilder = new MessageBuilder();
const REM_STATUS_REQUEST = "REM_STATUS_REQUEST";
const REM_STATUS_RESPONSE = "REM_STATUS_RESPONSE";
const REM_STATUS_ERROR = "REM_STATUS_ERROR";
const REM_REQUEST_METHOD = "rem.status.get";

let currentMockState = "normal";
let lastStatus = null;

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

  const status = await fetchRemWatchStatus(normalized);
  lastStatus = status;
  return { state: "api", status };
}

function handleStatusRequest(ctx, payload) {
  const config = normalizeRemConfig({
    ...remConfig,
    ...(payload.params && payload.params.config ? payload.params.config : {}),
  });

  resolveStatus(config)
    .then(({ state, status }) => {
      ctx.response({
        type: REM_STATUS_RESPONSE,
        data: status,
        fetchedAt: responseTime(),
        mockState: config.mockMode ? state : undefined,
      });
    })
    .catch((error) => {
      ctx.response({
        type: REM_STATUS_ERROR,
        error: String(error && error.message ? error.message : error),
        data: makeErrorStatus("ERROR", lastStatus),
      });
    });
}

function handleRequest(ctx) {
  let payload = {};
  try {
    payload = messageBuilder.buf2Json(ctx.request.payload);
  } catch (error) {
    ctx.response({
      type: REM_STATUS_ERROR,
      error: "invalid request",
      data: makeErrorStatus("ERROR", lastStatus),
    });
    return;
  }

  if (
    payload.type === REM_STATUS_REQUEST ||
    payload.method === REM_REQUEST_METHOD
  ) {
    handleStatusRequest(ctx, payload);
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
    messageBuilder.listen(() => {});
    messageBuilder.on("request", handleRequest);
  },

  onRun() {},

  onDestroy() {},
});
