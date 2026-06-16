import "./shared/device-polyfill";
import { MessageBuilder } from "./shared/message";
import { REM_SYNC_APP_ID } from "./common/messageTypes";

const messageBuilder = new MessageBuilder({ appId: REM_SYNC_APP_ID });

App({
  globalData: {
    messageBuilder,
  },

  onCreate() {},

  onDestroy() {
    try {
      messageBuilder.disConnect();
    } catch (error) {
    }
  },
});
