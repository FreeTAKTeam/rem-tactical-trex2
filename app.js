import { log } from "@zos/utils";

const logger = log.getLogger("rem-tactical");

App({
  globalData: {},

  onCreate() {
    logger.info("REM Tactical loaded");
  },

  onDestroy() {
    logger.info("REM Tactical unloaded");
  },
});
