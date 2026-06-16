import "./shared/device-polyfill";
import { getPackageInfo } from "@zos/app";
import { MessageBuilder } from "./shared/message";

App({
  globalData: {
    messageBuilder: null,
    latestStatus: null,
    latestError: null,
  },

  onCreate() {
    const { appId } = getPackageInfo();
    const messageBuilder = new MessageBuilder({
      appId,
    });
    this.globalData.messageBuilder = messageBuilder;
    messageBuilder.connect();
  },

  onDestroy() {
    this.globalData.messageBuilder &&
      this.globalData.messageBuilder.disConnect();
  },
});
