// T-Rex 2's working compass lives in the legacy device runtime (3ada53de).
// Keep this mini app on that runtime; Side Service and settings are unchanged.
export const ui = typeof hmUI !== "undefined" ? hmUI : null;
export const ble = typeof hmBle !== "undefined" ? hmBle : null;
// px is provided by Zeus/the legacy host from the 454-pixel design width.
export const getPackageInfo = () => typeof hmApp.packageInfo === "function"
  ? hmApp.packageInfo() : hmApp.getPackageInfo();
export const push = (route) => hmApp.gotoPage(route);
export function acquireInput({ key, gesture }, scope = getApp()._options.globalData) {
  const owner = {};
  // Page entry points are separate bundles. Ownership belongs to the shared
  // App data, not to a module-local variable duplicated in each page bundle.
  scope.inputOwner = owner;
  hmApp.registerKeyEvent((...args) => scope.inputOwner === owner ? key(...args) : false);
  hmApp.registerGestureEvent((...args) => scope.inputOwner === owner ? gesture(...args) : false);
  return () => {
    if (scope.inputOwner !== owner) return false;
    scope.inputOwner = null;
    hmApp.unregisterKeyEvent();
    hmApp.unregisterGestureEvent();
    return true;
  };
}
export const resetLayerOffset = () => hmApp.setLayerY(0);
export const KEY_BACK = typeof hmApp !== "undefined" ? hmApp.key.BACK : undefined;
export const KEY_UP = typeof hmApp !== "undefined" ? hmApp.key.UP : undefined;
export const KEY_DOWN = typeof hmApp !== "undefined" ? hmApp.key.DOWN : undefined;
export const KEY_SELECT = typeof hmApp !== "undefined" ? hmApp.key.SELECT : undefined;
export const KEY_EVENT_CLICK = typeof hmApp !== "undefined" ? hmApp.action.CLICK : undefined;
export const GESTURE_RIGHT = typeof hmApp !== "undefined" ? hmApp.gesture.RIGHT : undefined;
export const GESTURE_UP = typeof hmApp !== "undefined" ? hmApp.gesture.UP : undefined;
export const GESTURE_DOWN = typeof hmApp !== "undefined" ? hmApp.gesture.DOWN : undefined;
