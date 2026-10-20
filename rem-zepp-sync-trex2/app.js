import "./shared/device-polyfill";
import { ble, getPackageInfo } from "./common/deviceRuntime.js";
import { createDisplaySession } from "./common/displaySession.js";
import { MessageBuilder } from "./shared/message";

App({
  globalData: {
    messageBuilder: null,
    latestStatus: null,
    latestError: null,
    displaySession: null,
    inputOwner: null,
  },

  onCreate() {
    if (this.globalData.messageBuilder) {
      return;
    }

    const displaySession = createDisplaySession({
      onDiagnostic: (code, result) => console.log("REM display " + code + (result === null ? "" : " " + result)),
    });
    this.globalData.displaySession = displaySession;
    try {
      displaySession.start();
      const { appId } = getPackageInfo();
      const messageBuilder = new MessageBuilder({ appId, ble });
      console.log("REM Sync bridge appId=" + appId);
      this.globalData.messageBuilder = messageBuilder;
      messageBuilder.connect();
    } catch (error) {
      displaySession.stop();
      this.globalData.displaySession = null;
      this.globalData.messageBuilder = null;
      throw error;
    }
  },

  onDestroy() {
    this.globalData.inputOwner = null;
    const messageBuilder = this.globalData.messageBuilder;
    this.globalData.messageBuilder = null;
    try {
      messageBuilder && messageBuilder.disConnect();
    } finally {
      const bindings = this.globalData.compassBindings;
      this.globalData.compassBindings = null;
      if (bindings) { for (const binding of bindings.values()) binding.release(); bindings.clear(); }
      const displaySession = this.globalData.displaySession;
      this.globalData.displaySession = null;
      displaySession && displaySession.stop();
    }
  },
});
