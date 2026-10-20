// Hold only this app's display session; restore normal screen timing on exit.
export function createDisplaySession({
  settingApi = typeof hmSetting !== "undefined" ? hmSetting : null,
  appApi = typeof hmApp !== "undefined" ? hmApp : null,
} = {}) {
  let active = false;
  return {
    start() {
      if (active) return;
      active = true;
      if (appApi && typeof appApi.setScreenKeep === "function") appApi.setScreenKeep(true);
      if (settingApi && typeof settingApi.setBrightScreen === "function") settingApi.setBrightScreen(2147483);
    },
    stop() {
      if (!active) return;
      active = false;
      try {
        if (settingApi && typeof settingApi.setBrightScreenCancel === "function") settingApi.setBrightScreenCancel();
      } finally {
        if (appApi && typeof appApi.setScreenKeep === "function") appApi.setScreenKeep(false);
      }
    },
  };
}
