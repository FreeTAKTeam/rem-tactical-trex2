import "../../shared/device-polyfill";
import { ui, push, acquireInput, resetLayerOffset, KEY_BACK, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK, GESTURE_RIGHT, GESTURE_UP, GESTURE_DOWN } from "../../common/deviceRuntime.js";
import { createState, reduce, sourceStatus } from "../../common/radar/state.js";
import { activate } from "../../common/radar/navigation.js";
import { fixtureState } from "../../common/radar/fixtures.js";
import { radarScene, actionAt } from "../../common/radar/view.js";
import { createWidgetRenderer } from "../../common/radar/widgetRenderer.js";
import { createRadarController } from "../../common/radar/controller.js";
import { createReceiptClock } from "../../common/radar/clock.js";
import { createWristCompass } from "../../common/radar/compass.js";

// Production starts empty. Source reads are phone-authorized; sample contacts
// require TRY DEMO and the local legacy heading keeps its unverified reference.
Page({
  onInit() {
    this.state = createState();
    this.clock = 0;
    this.active = false;
    this.timer = null;
  },

  build() {
    if (this.controller) this.controller.stop();
    if (this.compass) this.compass.stop();
    if (this.renderer) this.renderer.destroy();
    if (this.releaseInput) this.releaseInput();
    this.stopClock();
    this.state = createState();
    this.clockSource = createReceiptClock();
    this.clock = this.clockSource.now();
    this.active = true;
    const appData = getApp()._options.globalData;
    if (!appData.compassBindings) appData.compassBindings = new Map();
    this.controller = createRadarController({
      bridge: getApp()._options.globalData.messageBuilder,
      emit: (action) => this.dispatch(action), clock: this.clockSource,
    });
    this.compass = createWristCompass({
      sensorApi: typeof hmSensor !== "undefined" ? hmSensor : null,
      emit: (action) => this.dispatch(action),
      bindings: appData.compassBindings,
      onDiagnostic: (code) => console.log("REM compass " + code),
    });
    this.renderer = createWidgetRenderer(ui, px, (x, y) => {
      if (!this.active) return;
      const action = actionAt(this.scene, this.state, x, y);
      if (action) this.dispatch(action);
    }, { resetOffset: resetLayerOffset });
    this.releaseInput = acquireInput({ key: (key, event) => this.key(key, event), gesture: (gesture) => this.gesture(gesture) });
    this.draw();
    // Compass parity can be checked while REM is disconnected.
    this.compass.start();
    this.controller.start();
  },

  syncPanel() {
    if (this.renderer && this.state.view !== "radar") {
      const panel = this.renderer.panel();
      if (panel !== this.state.panel) this.state = reduce(this.state, { type: "PANEL", panel });
    }
  },

  key(key, event) {
    if (!this.active || event !== KEY_EVENT_CLICK) return false;
    if (key === KEY_BACK) return this.back();
    if (key !== KEY_UP && key !== KEY_DOWN && key !== KEY_SELECT) return false;
    this.syncPanel();
    this.dispatch(key === KEY_SELECT ? activate(this.state) : { type: "NAVIGATE", direction: key === KEY_UP ? -1 : 1 });
    return true;
  },

  gesture(gesture) {
    if (!this.active) return false;
    if (gesture === GESTURE_RIGHT) return this.back();
    if (this.state.view === "candidates" && (gesture === GESTURE_UP || gesture === GESTURE_DOWN)) {
      this.dispatch({ type: "CANDIDATE_PAGE", direction: gesture === GESTURE_UP ? 1 : -1 });
      return true;
    }
    return false; // Native vertical scrolling owns info/details swipes.
  },

  draw() {
    if (!this.active) return;
    this.scene = radarScene(this.state, this.clock);
    this.renderer.render(this.scene);
  },

  dispatch(action) {
    if (!this.active) return;
    if (action.type === "STATUS") {
      this.controller.stop();
      this.compass.stop();
      this.stopClock();
      this.active = false;
      if (this.releaseInput) this.releaseInput();
      this.releaseInput = null;
      if (this.renderer) this.renderer.destroy();
      this.renderer = null;
      push({ url: "page/status/index" });
      return;
    }
    if (action.type === "CONNECT") {
      if (this.state.demo) {
        this.stopClock();
        this.compass.stop();
        this.state = { ...createState(), view: "info" };
        this.clock = this.clockSource.now();
      }
      this.compass.start();
      this.controller.start();
      this.draw();
      return;
    }
    if (action.type === "DEMO") {
      this.controller.stop();
      this.compass.stop();
      this.stopClock();
      this.state = fixtureState("radar", this.clock, Date.now());
      this.startClock();
    } else {
      const previous = this.state;
      this.state = reduce(this.state, action);
      if (action.type === "RESET") {
        this.stopClock();
        this.compass.start();
        this.controller.start();
      }
      if (action.type === "SNAPSHOT") {
        this.clock = this.clockSource.now();
        this.startClock();
        this.compass.start();
      }
      if (action.type === "DENIED") {
        this.stopClock();
        this.renderer.clear();
      }
      if (action.type === "HEADING" && this.state.view === "radar" &&
          previous.orientation === this.state.orientation && previous.headingState === this.state.headingState &&
          previous.headingReference === this.state.headingReference) return;
    }
    this.draw();
  },

  back() {
    if (!this.active) return false;
    if (this.state.view !== "radar") this.dispatch({ type: "BACK" });
    else if (this.state.selectedId) this.dispatch({ type: "FOCUS_CLEAR" });
    else if (this.state.demo) this.dispatch({ type: "RESET" });
    else return false;
    return true;
  },

  startClock() {
    if (this.timer !== null) return;
    const generation = this.clockGeneration || 0;
    const tick = () => {
      if (generation !== this.clockGeneration) return;
      this.timer = null;
      if (!this.active || !this.state.snapshot) return;
      this.clock = this.state.demo ? this.clock + 1000 : this.clockSource.now();
      if (!this.state.demo && !this.clockSource.reliable) this.state = { ...this.state, clockReliable: false };
      if (this.state.view !== "radar" || !this.scene || sourceStatus(this.state, this.clock) !== this.scene.status) this.draw();
      this.timer = setTimeout(tick, 1000);
    };
    this.timer = setTimeout(tick, 1000);
  },

  stopClock() {
    this.clockGeneration = (this.clockGeneration || 0) + 1;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  },

  onDestroy() {
    this.active = false;
    this.stopClock();
    if (this.controller) this.controller.stop();
    if (this.compass) this.compass.stop();
    this.controller = null;
    this.compass = null;
    if (this.releaseInput) this.releaseInput();
    this.releaseInput = null;
    if (this.renderer) this.renderer.destroy();
    this.renderer = null;
    // No location persistence; the next page instance requests a fresh source.
    this.state = createState();
  },
});
