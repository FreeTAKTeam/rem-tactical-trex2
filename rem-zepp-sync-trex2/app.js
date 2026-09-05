import "./shared/device-polyfill";
import * as ble from "@zos/ble";
import { REM_SYNC_APP_ID } from "./common/messageTypes";
import { MessageBuilder } from "./shared/message";

App({
  globalData: {
    messageBuilder: null,
    latestStatus: null,
    latestError: null,
  },

  onCreate() {
    if (this.globalData.messageBuilder) {
      return;
    }

    const messageBuilder = new MessageBuilder({
      appId: REM_SYNC_APP_ID,
      ble,
    });
    this.globalData.messageBuilder = messageBuilder;
    messageBuilder.connect();
  },

  onDestroy() {
    const messageBuilder = this.globalData.messageBuilder;
    this.globalData.messageBuilder = null;
    messageBuilder && messageBuilder.disConnect();
  },
});
