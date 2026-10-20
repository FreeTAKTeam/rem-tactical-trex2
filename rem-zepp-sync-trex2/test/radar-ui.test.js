import assert from "node:assert/strict";
import test from "node:test";
import { fixtureState, SCENARIOS } from "../common/radar/fixtures.js";
import { radarScene, actionAt } from "../common/radar/view.js";
import { reduce } from "../common/radar/state.js";
import { project } from "../common/radar/geometry.js";
import { createWidgetRenderer } from "../common/radar/widgetRenderer.js";
import { activate } from "../common/radar/navigation.js";
const wall = 1790000000000;

export function fakeUi() {
  const widgets = [];
  const events = new Map();
  let writes = 0;
  let deletes = 0;
  let nativePanel = 1;
  const scrolling = [];
  function createWidget(type, props) {
    const widget = {
      type, props: { ...props }, visible: true, deleted: false,
      setProperty(name, value) {
        writes++;
        if (name === "MORE") Object.assign(this.props, value);
        else if (name === "VISIBLE") this.visible = value;
      },
      createWidget,
      addEventListener(name, callback) { events.set(name, callback); },
    };
    widgets.push(widget); return widget;
  }
  const enums = (values) => Object.fromEntries(values.split(" ").map((key) => [key, key]));
  return {
    ui: {
      widget: enums("GROUP TEXT IMG CIRCLE FILL_RECT"), prop: enums("MORE VISIBLE"), event: { CLICK_UP: "CLICK_UP" },
      align: enums("LEFT CENTER_H CENTER_V"), text_style: { NONE: 0 }, createWidget,
      deleteWidget(widget) { assert.equal(widget.deleted, false, "widget deleted once"); widget.deleted = true; deletes++; },
      setScrollView(enabled, height, pages, vertical) { scrolling.push({ enabled, height, pages, vertical }); },
      setLayerScrolling() {},
      scrollToPage(index) { nativePanel = index; }, getScrollCurrentPage() { return nativePanel; },
    },
    widgets, events, scrolling, swipeToPanel: (index) => { nativePanel = index + 1; }, stats: () => ({ writes, deletes }),
  };
}

test("details are full-screen without a radar and report independent source ages", () => {
  const scene = radarScene(fixtureState("details", 0, wall), 1000);
  assert.equal(scene.hasRadar, false);
  assert.ok(scene.nodes.some((n) => n.id === "detail-bearing" && n.text === "090°"));
  assert.ok(scene.nodes.some((n) => n.id === "detail-heading" && n.text === "045°"));
  assert.ok(scene.nodes.some((n) => n.id === "position-age" && n.text === "3s"));
  assert.ok(scene.nodes.some((n) => n.id === "marker-age" && n.text === "3s"));
  assert.equal(scene.nodes.some((n) => /notes/i.test(n.id)), false);
  assert.equal(scene.pages, 3);
  assert.equal(scene.targets.length, 0, "details use physical buttons and native vertical scrolling");
});

test("source accuracy is visible in details and Connection, while radar remains free of quality text", () => {
  const state = fixtureState("details", 0, wall);
  assert.equal(radarScene(state, 0).nodes.find((n) => n.id === "position-accuracy").text, "Accuracy 13 m");
  const info = radarScene(reduce(state, { type: "INFO" }), 0);
  assert.equal(info.nodes.find((n) => n.id === "position-accuracy").text, "13 m");
  state.snapshot.observer.accuracyM = null;
  assert.equal(radarScene(state, 0).nodes.find((n) => n.id === "position-accuracy").text, "Accuracy Unknown");
  assert.equal(radarScene(reduce(state, { type: "BACK" }), 0).nodes.some((n) => n.id === "position-accuracy" || n.id === "receipt-age"), false);
});

test("fixed user pointer and cone never move while cardinals and markers rotate", () => {
  const state = fixtureState("radar", 0, wall);
  const first = radarScene(state, 0);
  const second = radarScene(reduce(state, { type: "HEADING", status: "valid", reference: "true", value: 90, weight: 1 }), 0);
  const node = (scene, id) => scene.nodes.find((n) => n.id === id);
  assert.deepEqual(node(first, "operator"), node(second, "operator"));
  assert.deepEqual(node(first, "cone"), node(second, "cone"));
  assert.notDeepEqual(node(first, "cardinal-N"), node(second, "cardinal-N"));
  assert.notEqual(node(first, "marker-0-color").x, node(second, "marker-0-color").x);
});

test("the radar fills the round screen without a brand header and edge contacts retain their touch target", () => {
  const state = fixtureState("radar", 0, wall);
  state.orientation = 0;
  state.snapshot.markers = [{ ...state.snapshot.markers[0], distanceM: 500, bearingDegTrue: 0 }];
  const scene = radarScene(state, 0);
  const dial = scene.nodes.find((n) => n.id === "dial");
  assert.deepEqual([dial.x, dial.y, dial.w, dial.h], [0, 0, 454, 454]);
  assert.equal(scene.nodes.some((n) => n.text === "REM RADAR"), false);
  const contact = scene.nodes.find((n) => n.id === "marker-0-color");
  assert.equal(contact.y, 19);
  assert.equal(actionAt(scene, state, contact.x, contact.y).type, "TAP");
});

test("stale markers retain exact colors and add a separate visible outline", () => {
  const connected = radarScene(fixtureState("radar", 0, wall), 0);
  const disconnected = radarScene(fixtureState("disconnected", 0, wall), 0);
  const find = (scene, id) => scene.nodes.find((n) => n.id === id);
  for (let i = 0; i < 5; i++) assert.equal(find(connected, `marker-${i}-color`).color, find(disconnected, `marker-${i}-color`).color);
  assert.notEqual(find(connected, "marker-1-outline").color, find(disconnected, "marker-1-outline").color);
  assert.equal(find(disconnected, "operator").src, "radar/operator-grey.png");
  assert.equal(find(disconnected, "cone").src, "radar/cone-grey.png");
  assert.equal(find(connected, "operator").src, "radar/operator.png");
  assert.equal(disconnected.nodes.some((n) => ["connection", "radar-age", "heading", "selected", "empty"].includes(n.id)), false);
});

test("radar uses color and symbols; source ages and count are on a separate information screen", () => {
  const state = fixtureState("maximum", 0, wall);
  const scene = radarScene(state, 0);
  assert.equal(scene.nodes.filter((n) => n.id.startsWith("source-limit-")).length, 3);
  assert.deepEqual(scene.nodes.filter((n) => n.type === "text").map((n) => n.id), ["cardinal-N", "cardinal-E", "cardinal-S", "cardinal-W", "range", "half-range"]);
  const info = reduce(state, actionAt(scene, state, 227, 227));
  assert.equal(info.view, "info");
  const details = radarScene(info, 0);
  assert.equal(details.hasRadar, false);
  assert.equal(details.nodes.find((n) => n.id === "source-count").text, "50+");
  assert.equal(details.pages, 4);
  assert.ok(details.nodes.find((n) => n.id === "source-ages").y >= 454);
  assert.equal(radarScene(fixtureState("stale", 0, wall), 0).nodes.find((n) => n.id === "operator").src, "radar/operator-warning.png");
});

test("crowded tap opens all candidates; selecting and Back use stable IDs", () => {
  const state = fixtureState("crowded", 0, wall);
  const p = project(90, 280, 45);
  const scene = radarScene(state, 0);
  const action = actionAt(scene, state, p.x, p.y);
  const candidates = reduce(state, action);
  assert.equal(candidates.view, "candidates");
  assert.equal(candidates.candidates.length, 7);
  const list = radarScene(candidates, 0);
  const selected = reduce(candidates, activate(candidates));
  assert.equal(selected.view, "details");
  assert.equal(selected.selectedId, "cluster-0");
  assert.equal(reduce(selected, { type: "BACK" }).view, "radar");
});

test("connection controls stay reachable when crowded or coincident contacts cover the center arrow", () => {
  const state = fixtureState("radar", 0, wall);
  state.snapshot.markers = [0, 90, 180, 270].map((bearingDegTrue, i) => ({
    ...state.snapshot.markers[0], id: `close-${i}`, distanceM: 40.795, bearingDegTrue,
  }));
  const crowded = reduce(state, actionAt(radarScene(state, 0), state, 227, 227));
  assert.equal(crowded.view, "candidates");
  assert.equal(reduce(crowded, { type: "INFO" }).view, "info");
  assert.equal(reduce(reduce(crowded, activate(crowded)), activate({ ...crowded, view: "details" })).view, "info");
  state.snapshot.markers = [{ ...state.snapshot.markers[0], distanceM: 0, bearingDegTrue: null }];
  const coincident = reduce(state, actionAt(radarScene(state, 0), state, 227, 227));
  assert.equal(coincident.view, "details");
  assert.equal(reduce(coincident, activate(coincident)).view, "info");
});

test("all review states have unique widget IDs and finite geometry, with no document buttons", () => {
  for (const [name] of SCENARIOS) {
    const scene = radarScene(fixtureState(name, 0, wall), 0);
    assert.equal(new Set(scene.nodes.map((n) => n.id)).size, scene.nodes.length, name);
    for (const n of scene.nodes) for (const key of ["x", "y", "w", "h", "r"]) if (n[key] !== undefined) assert.ok(Number.isFinite(n[key]), `${name}: ${n.id}.${key}`);
    for (const target of scene.targets) {
      assert.ok(target.w >= 44 && target.h >= 44, `${name}: ${target.label}`);
      assert.ok(Math.hypot(target.x + target.w / 2 - 227, target.y + target.h / 2 - 227) < 227, `${name}: unreachable control`);
    }
    if (!scene.hasRadar) assert.equal(scene.targets.length, 0);
  }
});

test("native renderer creates only visible slots, skips identical updates and scales hit coordinates once", () => {
  const h = fakeUi();
  let tapped;
  let scales = 0;
  const renderer = createWidgetRenderer(h.ui, (n) => { scales++; return n * 2; }, (x, y) => { tapped = [x, y]; });
  const state = fixtureState("radar", 0, wall);
  state.demo = false;
  const scene = radarScene(state, 0);
  renderer.render(scene);
  const widgets = h.widgets.length;
  const writes = h.stats().writes;
  assert.equal(h.widgets.filter((w) => w.type === "CIRCLE").length, 15);
  assert.equal(h.widgets.filter((w) => w.type === "CIRCLE" && w.visible).length, 15);
  renderer.render(scene);
  assert.equal(h.stats().writes, writes);
  assert.equal(scales, 1);
  renderer.render(radarScene(reduce(state, { type: "HEADING", value: 90, status: "valid", reference: "true", weight: 1 }), 0));
  assert.equal(h.widgets.length, widgets);
  assert.equal(h.stats().deletes, 0);
  h.events.get("CLICK_UP")({ x: 454, y: 456 });
  assert.deepEqual(tapped, [227, 228]);
  renderer.destroy();
  assert.equal(h.stats().deletes, h.widgets.length);
});

test("native document swipes keep position on data updates and the hidden radar ignores taps", () => {
  const h = fakeUi(); let taps = 0;
  const renderer = createWidgetRenderer(h.ui, (n) => n, () => { taps++; });
  const state = fixtureState("radar", 0, wall); state.demo = false;
  renderer.render(radarScene(state, 0));
  const radarCount = h.widgets.length;
  const tap = h.events.get("CLICK_UP");
  const info = reduce(state, { type: "INFO" });
  renderer.render(radarScene(info, 0));
  tap({ x: 227, y: 227 }); assert.equal(taps, 0);
  h.swipeToPanel(2);
  const configs = h.scrolling.length;
  renderer.render(radarScene(info, 1000));
  assert.equal(renderer.panel(), 2);
  assert.equal(h.scrolling.length, configs);
  const allWidgets = h.widgets.length;
  renderer.render(radarScene(state, 1000));
  assert.equal(h.widgets.length, allWidgets, "returning to radar reuses its widgets");
  assert.ok(allWidgets > radarCount);
  tap({ x: 227, y: 227 }); assert.equal(taps, 1);
  assert.equal(h.scrolling.at(-1).enabled, false);
  renderer.clear();
  assert.equal(h.widgets.filter((w) => !w.deleted).length, 0);
});

test("repeated document transitions have bounded live widgets and no radar reconstruction", () => {
  const h = fakeUi();
  const renderer = createWidgetRenderer(h.ui, (n) => n, () => {});
  const state = fixtureState("maximum", 0, wall); state.demo = false;
  renderer.render(radarScene(state, 0));
  const dial = h.widgets.find((w) => w.props.src === "radar/dial.png");
  for (let i = 0; i < 30; i++) {
    renderer.render(radarScene(reduce(state, { type: "INFO" }), 0));
    renderer.render(radarScene({ ...state, view: "details" }, 0));
    renderer.render(radarScene(state, 0));
    assert.ok(h.widgets.filter((w) => !w.deleted).length < 230);
  }
  assert.equal(dial.deleted, false);
  assert.equal(h.widgets.filter((w) => w.props.src === "radar/dial.png").length, 1);
  renderer.destroy();
});
