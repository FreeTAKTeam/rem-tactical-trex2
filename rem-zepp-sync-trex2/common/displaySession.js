const HOLD_SECONDS = 60;
const RENEW_MS = 20000;

// The App owns final restoration. Each foreground page supplies its own native
// APIs and renews one bounded hold; App.onCreate runs before a page is loaded.
export function createDisplaySession({
  appApi = typeof hmApp !== "undefined" ? hmApp : null,
  onDiagnostic = () => {},
} = {}) {
  let active = false, owner = null, timer = null, clearTimer = null;
  let settingApi = null;
  let restoreSetting = null, restoreApp = null;
  const last = {};
  const report = (channel, code, result) => {
    const value = `${code}:${typeof result === "number" ? result : ""}`;
    if (last[channel] !== value) {
      last[channel] = value;
      try { onDiagnostic(code, typeof result === "number" && Number.isFinite(result) ? result : null); } catch { /* Diagnostics cannot own the display lifecycle. */ }
    }
  };
  const clearRenewal = () => {
    if (timer !== null && clearTimer) clearTimer(timer);
    timer = null;
  };
  function keepScreenReturn() {
    if (!appApi || typeof appApi.setScreenKeep !== "function") { report("keep", "RETURN_API_UNAVAILABLE"); return; }
    if (!restoreApp) restoreApp = appApi;
    try { appApi.setScreenKeep(true); restoreApp = appApi; report("keep", "RETURN_REQUESTED"); }
    catch { report("keep", "RETURN_FAILED"); }
  }
  return {
    start() {
      if (active) return;
      active = true;
      keepScreenReturn();
    },
    activatePage({ settingApi: pageSetting, appApi: pageApp,
      setTimer = setTimeout, clearTimer: pageClear = clearTimeout }) {
      if (!active) return () => {};
      clearRenewal();
      const lease = {};
      owner = lease;
      settingApi = pageSetting;
      appApi = pageApp;
      clearTimer = pageClear;
      keepScreenReturn();
      const renew = () => {
        if (!active || owner !== lease) return;
        timer = null;
        if (!settingApi || typeof settingApi.setBrightScreen !== "function") report("hold", "HOLD_API_UNAVAILABLE");
        else {
          if (!restoreSetting && typeof settingApi.setBrightScreenCancel === "function") restoreSetting = settingApi;
          try {
            const result = settingApi.setBrightScreen(HOLD_SECONDS);
            if ((result === 0 || typeof result !== "number") && typeof settingApi.setBrightScreenCancel === "function") restoreSetting = settingApi;
            report("hold", result === 0 ? "HOLD_ACCEPTED" : typeof result === "number" ? "HOLD_REJECTED" : "HOLD_RESULT_UNVERIFIED", result);
          } catch { report("hold", "HOLD_FAILED"); }
        }
        if (active && owner === lease) timer = setTimer(renew, RENEW_MS);
      };
      renew();
      return () => {
        if (owner !== lease) return;
        owner = null;
        clearRenewal();
      };
    },
    stop() {
      if (!active) return;
      active = false;
      owner = null;
      clearRenewal();
      try {
        if (restoreSetting && typeof restoreSetting.setBrightScreenCancel === "function") restoreSetting.setBrightScreenCancel();
      } catch { report("hold", "HOLD_CANCEL_FAILED"); }
      finally {
        try { if (restoreApp && typeof restoreApp.setScreenKeep === "function") restoreApp.setScreenKeep(false); }
        catch { report("keep", "RETURN_RESET_FAILED"); }
        settingApi = null;
        restoreSetting = null; restoreApp = null;
      }
    },
  };
}

// This helper is bundled with each Page, so these are the Page's native APIs,
// not globals captured in the separate App bundle before a page exists.
export function activateDisplayPage(data) {
  const session = data && data.displaySession;
  return session && typeof session.activatePage === "function" ? session.activatePage({
    settingApi: typeof hmSetting !== "undefined" ? hmSetting : null,
    appApi: typeof hmApp !== "undefined" ? hmApp : null,
    setTimer: setTimeout, clearTimer: clearTimeout,
  }) : () => {};
}
