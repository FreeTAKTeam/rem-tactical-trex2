import { readFileSync } from "@zos/fs";
import { SessionStorage } from "@zos/storage";
import ui from "@zos/ui";
import { px } from "@zos/utils";

const KEYS = [
  "REM_STATUS_CONNECTION",
  "REM_STATUS_OPERATOR_STATE",
  "REM_STATUS_LAST_SYNC",
];

function readSessionValues() {
  try {
    const sessionStorage = new SessionStorage();
    return KEYS.map((key) => sessionStorage.getItem(key, "")).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function readFileValues() {
  try {
    const raw = readFileSync({
      path: "rem-status-cache.json",
      options: { encoding: "utf8" },
    });
    return raw ? [raw] : [];
  } catch (error) {
    return [];
  }
}

function text(x, y, w, h, value, color, size) {
  return ui.createWidget(ui.widget.TEXT, {
    x: px(x),
    y: px(y),
    w: px(w),
    h: px(h),
    text: value,
    color,
    text_size: px(size),
    align_h: ui.align.CENTER_H,
    align_v: ui.align.CENTER_V,
    text_style: ui.text_style.NONE,
  });
}

WatchFace({
  build() {
    ui.createWidget(ui.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: px(454),
      h: px(454),
      color: 0x000000,
    });

    const sessionValues = readSessionValues();
    const fileValues = readFileValues();
    const ok = sessionValues.length > 0 || fileValues.length > 0;

    text(20, 120, 414, 50, ok ? "FACE READ OK" : "FACE READ FAIL", ok ? 0x76d35d : 0xff4a32, 32);
    text(
      20,
      184,
      414,
      38,
      `SESSION ${sessionValues.length} FILE ${fileValues.length}`,
      0xe5e5e5,
      20
    );
    text(
      24,
      236,
      406,
      80,
      ok ? "Mini Program cache visible" : "Mini Program cache not visible",
      0x8fa08c,
      18
    );
  },
});
