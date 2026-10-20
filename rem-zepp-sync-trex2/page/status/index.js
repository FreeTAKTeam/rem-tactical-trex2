import "../../shared/device-polyfill";
import { ui, acquireInput, resetLayerOffset, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from "../../common/deviceRuntime.js";
import { fromNativePanel, toNativePanel } from "../../common/radar/widgetRenderer.js";
import {
  REM_DIAGNOSTICS_RESPONSE,
  REM_MESSAGE_TYPES,
  REM_REQUEST_METHOD,
} from "../../common/messageTypes";
import { remConfig } from "../../common/remConfig";
import { makeErrorStatus } from "../../common/remModel";
import { COLORS, LAYOUT } from "./index.style";

const APP_VERSION = "0.1.30";
const BRIDGE_WATCHDOG_MS = 7000;

let widgets = {};
let currentStatus = makeErrorStatus("OFFLINE", null);
let lastFetchTime = "--";
let lastApiError = "--";
let lastPayload = "idle";
let lastSideState = "?";
let requestInFlight = false;
let bridgeWatchdog = null;
let pageActive = false;
let pageGeneration = 0;
let requestGeneration = 0;
let pageMessageBuilder = null;
let callHandler = null;
let releaseInput = null;
let ownedWidgets = [];
const widgetValues = new Map();

function isCurrentPage(generation) {
  return pageActive && generation === pageGeneration &&
    pageMessageBuilder === getApp()._options.globalData.messageBuilder;
}

function isCurrentRequest(generation) {
  return isCurrentPage(pageGeneration) && requestInFlight &&
    generation === requestGeneration;
}

function destroyPage() {
  pageActive = false;
  pageGeneration += 1;
  requestGeneration += 1;
  requestInFlight = false;
  clearBridgeWatchdog();
  if (pageMessageBuilder && callHandler) {
    pageMessageBuilder.off("call", callHandler);
  }
  callHandler = null;
  pageMessageBuilder = null;
  const ownedInput = releaseInput && releaseInput();
  releaseInput = null;
  if (ownedInput) {
    if (typeof ui.setScrollView === "function") ui.setScrollView(false, px(454), 1, true);
    resetLayerOffset();
  }
  if (typeof ui.deleteWidget === "function") for (const widget of ownedWidgets) ui.deleteWidget(widget);
  ownedWidgets = [];
  widgetValues.clear();
  widgets = {};
}

function textWidget({ x, y, w, h, text, color, size, align }) {
  const widget = ui.createWidget(ui.widget.TEXT, {
    x: px(x),
    y: px(y),
    w: px(w),
    h: px(h),
    text,
    color,
    text_size: px(size),
    align_h: align || ui.align.LEFT,
    align_v: ui.align.CENTER_V,
    text_style: h > 50 ? ui.text_style.WRAP : ui.text_style.NONE,
  });
  ownedWidgets.push(widget);
  return widget;
}

function setText(widget, text, color) {
  if (!widget) return;
  const value = String(text === undefined || text === null || text === "" ? "--" : text);
  const previous = widgetValues.get(widget);
  if (previous && previous.text === value && previous.color === color) return;
  widgetValues.set(widget, { text: value, color });
  widget.setProperty(ui.prop.MORE, { text: value, color });
}

function valueColor(status) {
  const priority = status.priority;
  const connection = status.connection;
  const alert = status.alert;
  if (connection === "ERROR" || alert === "EMERGENCY" || priority === "EMERGENCY") {
    return COLORS.red;
  }
  if (connection === "STALE") {
    return COLORS.orange;
  }
  return COLORS.white;
}

function renderStatus(status) {
  currentStatus = status;
  const color = valueColor(status);
  const banner = `${status.connection || "OFFLINE"}  ${status.priority || "NORMAL"}  ${status.alert || "NORMAL"}`;

  setText(widgets.banner, compactValue(banner, 25), color);
  setText(
    widgets.primary,
    compactValue(`${status.operator || "--"}  ${status.operatorStatus || "--"}  EAM ${status.operatorEam || "--"}`, 30),
    COLORS.white,
  );
  setText(
    widgets.team,
    compactValue(`TEAM ${status.team || "--"} / ${status.teamStatus || "--"}  EV ${status.activeEvents || 0}`, 30),
    COLORS.white,
  );
  setText(widgets.eventTitle, compactValue(statusValue(status, "latestEventTitle"), 28), COLORS.white);
  setText(widgets.eventMeta, compactValue(statusValue(status, "latestEventMeta"), 32), COLORS.dim);
  setText(widgets.position, compactValue(`POS ${status.position || "--"}`, 32), COLORS.white);
  setText(widgets.sync, `SYNC ${status.lastSyncAge || "--"}`, COLORS.dim);
  setText(widgets.side, compactValue(`SIDE ${lastSideState}  ${lastPayload}`, 30), COLORS.dim);
  setText(widgets.error, compactValue(`ERR ${lastApiError || "--"}`, 34), lastApiError === "--" ? COLORS.dim : COLORS.orange);
}

function compactValue(value, maxLength) {
  const text = String(value === undefined || value === null || value === "" ? "--" : value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function statusValue(status, value) {
  const event = (status && status.lastEvent) || {};
  if (value === "teamSummary") {
    return `${status.team || "--"} / ${status.teamStatus || "--"}`;
  }
  if (value === "latestEventTitle") {
    return compactValue(event.title, 24);
  }
  if (value === "latestEventSource") {
    return compactValue(event.source || status.operator, 12);
  }
  if (value === "latestEventMeta") {
    return `${event.source || status.operator || "--"}  ${event.severity || status.priority || "--"}  ${event.time || "--"}`;
  }

  return status[value];
}

function receiveStatus(payload) {
  if (payload && payload.type === REM_MESSAGE_TYPES.response) {
    lastFetchTime = payload.fetchedAt || "--";
    lastApiError = "--";
    lastPayload = payload.mockState || "api";
    if (payload.diagnostics) {
      receiveDiagnostics(payload.diagnostics);
    }
    renderStatus(payload.data);
  } else if (payload && payload.type === REM_MESSAGE_TYPES.error) {
    lastFetchTime = payload.fetchedAt || "--";
    lastApiError = payload.error || "ERROR";
    lastPayload = "error";
    if (payload.diagnostics) {
      receiveDiagnostics(payload.diagnostics);
    }
    renderStatus(payload.data || makeErrorStatus("ERROR", currentStatus));
  } else if (payload && payload.connection) {
    lastFetchTime = String(Date.now());
    lastApiError = "--";
    lastPayload = "api";
    renderStatus(payload);
  }
}

function receiveDiagnostics(payload) {
  if (!payload || payload.type !== REM_DIAGNOSTICS_RESPONSE) {
    return;
  }

  lastSideState = payload.fetchAvailable
    ? `OK v${payload.appVersion || "?"}`
    : `NOFETCH v${payload.appVersion || "?"}`;
  if (payload.fetchError) {
    lastApiError = payload.fetchError;
  }
}

function clearBridgeWatchdog() {
  if (bridgeWatchdog === null) {
    return;
  }

  clearTimeout(bridgeWatchdog);
  bridgeWatchdog = null;
}

function startBridgeWatchdog(generation) {
  clearBridgeWatchdog();
  bridgeWatchdog = setTimeout(() => {
    if (!isCurrentRequest(generation)) {
      return;
    }

    bridgeWatchdog = null;
    requestInFlight = false;
    lastFetchTime = String(Date.now());
    lastApiError = "BRIDGE HANDSHAKE TIMEOUT";
    lastPayload = "timeout";
    lastSideState = "TIMEOUT";
    renderStatus(makeErrorStatus("ERROR", currentStatus));
  }, BRIDGE_WATCHDOG_MS);
}

function requestStatus() {
  if (!isCurrentPage(pageGeneration) || requestInFlight) {
    return;
  }

  const messageBuilder = pageMessageBuilder;
  if (!messageBuilder || typeof messageBuilder.request !== "function") {
    lastApiError = "NO BRIDGE";
    lastPayload = "offline";
    lastSideState = "NO BRIDGE";
    renderStatus(makeErrorStatus("OFFLINE", currentStatus));
    return;
  }

  const generation = ++requestGeneration;
  requestInFlight = true;
  lastPayload = "fetching";
  renderStatus(currentStatus);
  startBridgeWatchdog(generation);

  const handleError = (error) => {
    if (!isCurrentRequest(generation)) {
      return;
    }
    clearBridgeWatchdog();
    requestInFlight = false;
    lastFetchTime = String(Date.now());
    lastApiError = String(error && error.message ? error.message : error);
    lastPayload = "error";
    lastSideState = "TIMEOUT";
    renderStatus(makeErrorStatus("ERROR", currentStatus));
  };

  try {
    messageBuilder
      .request(
        {
          type: REM_MESSAGE_TYPES.request,
          method: REM_REQUEST_METHOD,
          params: {
            config: remConfig,
          },
        },
        { timeout: Number(remConfig.timeoutMs) || 5000 },
      )
      .then((payload) => {
        if (!isCurrentRequest(generation)) {
          return;
        }
        clearBridgeWatchdog();
        receiveStatus(payload);
        requestInFlight = false;
      })
      .catch(handleError);
  } catch (error) {
    handleError(error);
  }
}

Page({
  build() {
    destroyPage();
    pageActive = true;
    const generation = pageGeneration;
    pageMessageBuilder = getApp()._options.globalData.messageBuilder;
    ownedWidgets.push(ui.createWidget(ui.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: px(454),
      h: px(454 * 5),
      color: COLORS.background,
    }));

    ownedWidgets.push(ui.createWidget(ui.widget.IMG, {
      x: px(LAYOUT.icon.x),
      y: px(LAYOUT.icon.y),
      w: px(LAYOUT.icon.w),
      h: px(LAYOUT.icon.h),
      src: "icon.png",
    }));

    textWidget({
      ...LAYOUT.header,
      text: "REM SYNC",
      color: COLORS.green,
      align: ui.align.CENTER_H,
    });

    textWidget({
      ...LAYOUT.version,
      text: `v${APP_VERSION}`,
      color: COLORS.dim,
    });

    widgets.banner = textWidget({ ...LAYOUT.banner, text: "--", color: COLORS.orange, align: ui.align.CENTER_H });
    widgets.primary = textWidget({ ...LAYOUT.primary, text: "--", color: COLORS.white, align: ui.align.CENTER_H });
    widgets.team = textWidget({ ...LAYOUT.team, text: "--", color: COLORS.white, align: ui.align.CENTER_H });
    widgets.eventTitle = textWidget({ ...LAYOUT.eventTitle, text: "--", color: COLORS.white, align: ui.align.CENTER_H });
    widgets.eventMeta = textWidget({ ...LAYOUT.eventMeta, text: "--", color: COLORS.dim, align: ui.align.CENTER_H });
    widgets.position = textWidget({ ...LAYOUT.position, text: "--", color: COLORS.white, align: ui.align.CENTER_H });
    widgets.sync = textWidget({ ...LAYOUT.sync, text: "--", color: COLORS.dim, align: ui.align.CENTER_H });
    widgets.side = textWidget({ ...LAYOUT.side, text: "--", color: COLORS.dim, align: ui.align.CENTER_H });
    widgets.error = textWidget({ ...LAYOUT.error, text: "--", color: COLORS.orange, align: ui.align.CENTER_H });

    for (const [panel, title] of [[1, "TEAM"], [2, "LATEST EVENT"], [3, "POSITION"], [4, "DIAGNOSTICS"]]) {
      textWidget({ x: 75, y: panel * 454 + 40, w: 304, h: 40, text: title, color: COLORS.white, size: 28, align: ui.align.CENTER_H });
    }
    for (let panel = 0; panel < 5; panel++) {
      textWidget({ x: 77, y: panel * 454 + 381, w: 300, h: 30, text: `UP / DOWN   ${panel + 1} / 5`, color: COLORS.dim, size: 22, align: ui.align.CENTER_H });
      textWidget({ x: 65, y: panel * 454 + 344, w: 324, h: 30, text: "SELECT refresh · BACK", color: COLORS.dim, size: 24, align: ui.align.CENTER_H });
    }
    resetLayerOffset();
    if (typeof ui.setScrollView === "function") ui.setScrollView(true, px(454), 5, true);
    if (typeof ui.setLayerScrolling === "function") ui.setLayerScrolling(false);
    releaseInput = acquireInput({
      key: (key, event) => {
        if (!isCurrentPage(generation) || event !== KEY_EVENT_CLICK) return false;
        if (key === KEY_SELECT) { requestStatus(); return true; }
        if (key !== KEY_UP && key !== KEY_DOWN) return false;
        const panel = typeof ui.getScrollCurrentPage === "function" ? fromNativePanel(ui.getScrollCurrentPage()) || 0 : 0;
        if (typeof ui.scrollToPage === "function") ui.scrollToPage(toNativePanel(Math.max(0, Math.min(4, panel + (key === KEY_UP ? -1 : 1)))), false);
        return true;
      },
      gesture: () => false,
    });

    const messageBuilder = pageMessageBuilder;
    if (messageBuilder) {
      callHandler = ({ payload }) => {
        if (!isCurrentPage(generation)) {
          return;
        }
        receiveStatus(messageBuilder.buf2Json(payload));
      };
      messageBuilder.on("call", callHandler);
    }

    renderStatus(currentStatus);
    requestStatus();
  },

  onDestroy() {
    destroyPage();
  },
});
