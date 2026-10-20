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
    const handlers = new Map();
    const widget = {
      type, props: { ...props }, handlers, visible: true, deleted: false,
      setProperty(name, value) {
        writes++;
        if (name === "MORE") Object.assign(this.props, value);
        else if (name === "VISIBLE") this.visible = value;
      },
      createWidget,
      addEventListener(name, callback) { events.set(name, callback); handlers.set(name, callback); },
    };
    widgets.push(widget); return widget;
  }
  const enums = (values) => Object.fromEntries(values.split(" ").map((key) => [key, key]));
  return {
    ui: {
      widget: enums("GROUP TEXT IMG CIRCLE FILL_RECT"), prop: enums("MORE VISIBLE"), event: enums("CLICK_UP CLICK_DOWN MOVE"),
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
  assert.equal(scene.pages, 4);
  assert.equal(scene.targets.length, 0, "details use physical buttons and native vertical scrolling");
});

test("source accuracy is visible in details and Connection, while radar remains free of quality text", () => {
  const state = fixtureState("details", 0, wall);
  assert.equal(radarScene(state, 0).nodes.find((n) => n.id === "position-accuracy").text, "13 m");
  const info = radarScene(reduce(state, { type: "INFO" }), 0);
  assert.equal(info.nodes.find((n) => n.id === "position-accuracy").text, "13 m");
  state.snapshot.observer.accuracyM = null;
  assert.equal(radarScene(state, 0).nodes.find((n) => n.id === "position-accuracy").text, "Unknown");
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

test("watch-compass rotation keeps the amber radar and unverified WRIST warning", () => {
  const initial = reduce(fixtureState("radar", 0, wall), { type: "HEADING", status: "valid", reference: "unverified", value: 0, weight: 1 });
  const turned = reduce(initial, { type: "HEADING", status: "valid", reference: "unverified", value: 90, weight: 1 });
  const first = radarScene(initial, 0), second = radarScene(turned, 0);
  const node = (scene, id) => scene.nodes.find((n) => n.id === id);
  assert.equal(turned.headingReference, "unverified");
  assert.deepEqual(node(first, "operator"), node(second, "operator"));
  assert.equal(node(second, "operator").src, "radar/operator-warning.png");
  assert.deepEqual(node(first, "cone"), node(second, "cone"));
  assert.notDeepEqual(node(first, "cardinal-N"), node(second, "cardinal-N"));
  assert.notEqual(node(first, "marker-0-color").x, node(second, "marker-0-color").x);
  assert.equal(node(first, "marker-0-color").color, node(second, "marker-0-color").color);
  const wrist = radarScene({ ...turned, view: "info", panel: 2 }, 0);
  assert.equal(node(wrist, "heading-note").text, "North reference unverified");
  const disconnected = radarScene(reduce(turned, { type: "DISCONNECT" }), 0);
  assert.equal(node(disconnected, "operator").src, "radar/operator-grey.png");
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
    if (!scene.hasRadar && scene.title !== "candidates") assert.equal(scene.targets.length, 0);
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

test("native candidate rows tap current stable IDs after paging and ignore hidden or disposed rows", () => {
  const h = fakeUi();
  const base = fixtureState("crowded", 0, wall);
  let state = { ...base, view: "candidates", candidates: base.snapshot.markers.map((m) => m.id), focus: 0, candidateOffset: 0 };
  let scene, chosen = null;
  const renderer = createWidgetRenderer(h.ui, (n) => n * 2, (x, y) => { chosen = actionAt(scene, state, x, y); });
  const render = () => { scene = radarScene(state, 0); renderer.render(scene); };
  render();
  const rows = h.widgets.filter((widget) => widget.props.src === "transparent-touch.png");
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.props.h === 152 && row.props.w === 648));
  rows[0].handlers.get("CLICK_DOWN")({ x: 0, y: 0 });
  rows[0].handlers.get("CLICK_UP")({ x: 0, y: 0 });
  assert.equal(chosen.id, "cluster-0");
  state = reduce(state, { type: "CANDIDATE_PAGE", direction: 1 }); render();
  rows[0].handlers.get("CLICK_DOWN")({ x: 0, y: 0 });
  rows[0].handlers.get("CLICK_UP")({ x: 0, y: 0 });
  assert.equal(chosen.id, "cluster-3", "reused rows resolve the current stable ID");
  state = reduce(state, { type: "CANDIDATE_PAGE", direction: 1 }); render();
  chosen = null; rows[1].handlers.get("CLICK_UP")(); assert.equal(chosen, null);
  state = { ...state, view: "info" }; render();
  rows[0].handlers.get("CLICK_UP")(); assert.equal(chosen, null);
  assert.ok(rows.every((row) => row.deleted));
  renderer.destroy();
  assert.equal(h.widgets.filter((widget) => !widget.deleted).length, 0);
});

test("a candidate tap cannot switch identity during a source update or become a swipe click", () => {
  const h = fakeUi();
  let state = fixtureState("marker-list", 0, wall), scene, chosen = null;
  const renderer = createWidgetRenderer(h.ui, (n) => n, (x, y) => { chosen = actionAt(scene, state, x, y); });
  const render = () => { scene = radarScene(state, 0); renderer.render(scene); };
  render();
  const row = h.widgets.find((widget) => widget.props.src === "transparent-touch.png");
  row.handlers.get("CLICK_DOWN")({ x: 80, y: 140 });
  state = reduce(state, { type: "SNAPSHOT", snapshot: { ...state.snapshot, sequence: 2, markers: state.snapshot.markers.slice(1) }, now: 0, wall });
  render(); row.handlers.get("CLICK_UP")();
  assert.equal(chosen, null, "removing the pressed marker must not open its replacement row");
  row.handlers.get("CLICK_DOWN")({ x: 80, y: 140 });
  row.handlers.get("CLICK_UP")();
  assert.equal(chosen.id, "cluster-1");
  chosen = null;
  row.handlers.get("CLICK_DOWN")({ x: 80, y: 140 });
  row.handlers.get("MOVE")({ x: 80, y: 180 });
  row.handlers.get("CLICK_UP")();
  assert.equal(chosen, null, "vertical movement cancels the tap before either gesture event order");
  renderer.destroy();
});

test("wide marker labels stay above distance and bearing has its own full panel", () => {
  const state = fixtureState("details", 0, wall);
  state.snapshot.markers[0].label = "救".repeat(32);
  const scene = radarScene(state, 0);
  const names = scene.nodes.filter((node) => node.id.startsWith("detail-name-"));
  const distance = scene.nodes.find((node) => node.id === "detail-distance");
  assert.equal(names.length, 4);
  assert.equal(names.map((node) => node.text).join(""), state.snapshot.markers[0].label);
  assert.ok(names.every((node) => Array.from(node.text).length <= 10 && node.y + node.h < distance.y));
  assert.ok(scene.nodes.find((node) => node.id === "detail-bearing").y >= 454);
  assert.equal(scene.pages, 4);
});

test("wide punctuation wraps without hiding the full name or overflowing the candidate preview", () => {
  const state = fixtureState("wide-name", 0, wall);
  const names = radarScene(state, 0).nodes.filter((node) => node.id.startsWith("detail-name-"));
  assert.equal(names.map((node) => node.text).join(""), "@".repeat(32));
  assert.ok(names.every((node) => node.text.length <= 9));
  const list = fixtureState("marker-list", 0, wall);
  list.snapshot.markers[0].label = "@".repeat(32);
  const preview = radarScene(list, 0).nodes.find((node) => node.id === "candidate-0-name");
  assert.ok(preview.text.endsWith("…"));
  assert.ok(preview.text.length <= 8, "the abbreviated name reserves room for the ellipsis");
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
