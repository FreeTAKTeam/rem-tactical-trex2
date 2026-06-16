import ui from "@zos/ui";
import { px } from "@zos/utils";
import { mockCompactStatus, nextMockState } from "../../common/mockRem";
import { COLORS, LAYOUT } from "./index.style";

let widgets = {};
let currentStatus = mockCompactStatus("normal");
let currentMockState = "normal";
let lastFetchTime = "--";
let lastApiError = "--";
let lastPayload = "mock normal";

function textWidget({ x, y, w, h, text, color, size, align }) {
  return ui.createWidget(ui.widget.TEXT, {
    x: px(x),
    y: px(y),
    w: px(w),
    h: px(h),
    text,
    color,
    text_size: px(size),
    align_h: align || ui.align.LEFT,
    align_v: ui.align.CENTER_V,
    text_style: ui.text_style.NONE,
  });
}

function setText(widget, text, color) {
  widget &&
    widget.setProperty(ui.prop.MORE, {
      text: String(text || "--"),
      color,
    });
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
  LAYOUT.rows.forEach((row) => {
    setText(widgets[row.value], status[row.value], valueColor(status));
  });
  setText(
    widgets.debug,
    `FETCH ${lastFetchTime} | ERR ${lastApiError}\nPAYLOAD ${lastPayload} | CACHE OFF`,
    COLORS.dim
  );
}

function receiveStatus(payload) {
  if (payload && payload.type === "rem-status") {
    lastFetchTime = payload.fetchedAt || "--";
    lastApiError = "--";
    lastPayload = payload.mockState || "api";
    renderStatus(payload.status);
  } else if (payload && payload.type === "rem-error") {
    lastFetchTime = payload.fetchedAt || "--";
    lastApiError = payload.error || "ERROR";
    renderStatus(payload.status || { ...currentStatus, connection: "ERROR" });
  }
}

function cycleMockState() {
  currentMockState = nextMockState(currentMockState);
  lastFetchTime = "local";
  lastApiError = currentMockState === "api-error" ? "mock API error" : "--";
  lastPayload = `mock ${currentMockState}`;
  renderStatus(mockCompactStatus(currentMockState));

  const messageBuilder = getApp()._options.globalData.messageBuilder;
  messageBuilder &&
    messageBuilder.request({
      method: "SET_MOCK_STATE",
      params: { state: currentMockState },
    });
}

Page({
  build() {
    ui.createWidget(ui.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: px(454),
      h: px(454),
      color: COLORS.background,
    });

    textWidget({
      ...LAYOUT.header,
      text: "REM SYNC",
      color: COLORS.green,
      align: ui.align.CENTER_H,
    });

    LAYOUT.rows.forEach((row) => {
      textWidget({
        x: row.x,
        y: row.y,
        w: row.w,
        h: 18,
        text: row.label,
        color: COLORS.green,
        size: 13,
      });
      widgets[row.value] = textWidget({
        x: row.x,
        y: row.y + 18,
        w: row.w,
        h: 26,
        text: "--",
        color: COLORS.white,
        size: 22,
      });
    });

    widgets.debug = textWidget({
      ...LAYOUT.debug,
      text: "",
      color: COLORS.dim,
    });

    ui.createWidget(ui.widget.BUTTON, {
      x: px(0),
      y: px(0),
      w: px(454),
      h: px(454),
      text: "",
      normal_src: "transparent-touch.png",
      press_src: "transparent-touch.png",
      click_func: cycleMockState,
    });

    const messageBuilder = getApp()._options.globalData.messageBuilder;
    if (messageBuilder) {
      messageBuilder.on("call", ({ payload }) => {
        receiveStatus(messageBuilder.buf2Json(payload));
      });
    }

    renderStatus(currentStatus);
  },
});
