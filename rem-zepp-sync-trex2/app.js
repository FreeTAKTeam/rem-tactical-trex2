import "./shared/device-polyfill";
import * as ble from "@zos/ble";
import { REM_SYNC_APP_ID } from "./common/messageTypes";
import { MessageBuilder } from "./shared/message";

const messageBuilder = new MessageBuilder({
  appId: REM_SYNC_APP_ID,
  ble,
});

App({
  globalData: {
    messageBuilder,
    latestStatus: null,
    latestError: null,
  },

  onCreate() {
    messageBuilder.connect();
  },

  onDestroy() {
    this.globalData.messageBuilder &&
      this.globalData.messageBuilder.disConnect();
  },
});
