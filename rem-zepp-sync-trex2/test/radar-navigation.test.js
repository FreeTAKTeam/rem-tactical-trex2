import assert from "node:assert/strict";
import test from "node:test";
import { fixtureState } from "../common/radar/fixtures.js";
import { createState, reduce } from "../common/radar/state.js";
import { activate } from "../common/radar/navigation.js";
import { radarScene } from "../common/radar/view.js";

test("four-button navigation reaches information, all actions, and marker details without touch", () => {
  let state = createState();
  state = reduce(state, activate(state)); assert.equal(state.view, "info");
  state = reduce(state, activate(state)); assert.equal(state.panel, 3);
  assert.equal(activate(state).type, "CONNECT");
  state = reduce(state, { type: "NAVIGATE", direction: 1 }); assert.equal(activate(state).type, "STATUS");
  state = reduce(state, { type: "NAVIGATE", direction: 1 }); assert.equal(activate(state).type, "DEMO");
  state = reduce(state, { type: "BACK" }); assert.equal(state.view, "radar");
  state = fixtureState("radar"); state.selectedId = null;
  state = reduce(state, { type: "NAVIGATE", direction: 1 });
  const id = state.selectedId;
  state = reduce(state, activate(state));
  assert.equal(state.view, "details"); assert.equal(state.selectedId, id);
  state = reduce(state, { type: "NAVIGATE", direction: 1 }); assert.equal(state.panel, 1);
  state = reduce(state, { type: "NAVIGATE", direction: 1 }); assert.equal(state.panel, 2);
  state = reduce(state, { type: "NAVIGATE", direction: 1 }); assert.equal(state.panel, 3);
  state = reduce(state, { type: "NAVIGATE", direction: 1 }); assert.equal(state.panel, 3);
  state = reduce(state, { type: "INFO" }); state = reduce(state, { type: "BACK" });
  assert.equal(state.view, "details");
});

test("source updates preserve action focus and a candidate's stable ID after deletion", () => {
  let state = fixtureState("radar", 0, 1790000000000);
  state = reduce(state, { type: "INFO" }); state = reduce(state, { type: "PANEL", panel: 3 });
  state = reduce(state, { type: "NAVIGATE", direction: 1 });
  state = reduce(state, { type: "SNAPSHOT", snapshot: { ...state.snapshot, sequence: 2 }, now: 1, wall: 1790000000000 });
  assert.equal(activate(state).type, "STATUS");
  state = { ...state, view: "candidates", candidates: state.snapshot.markers.map((m) => m.id), candidateOffset: 3, focus: 1 };
  const focused = activate(state).id;
  state = reduce(state, { type: "SNAPSHOT", snapshot: { ...state.snapshot, sequence: 3, markers: state.snapshot.markers.slice(1).reverse() }, now: 2, wall: 1790000000000 });
  assert.equal(activate(state).id, focused);
  state = reduce(state, { type: "CANDIDATE_PAGE", direction: -1 });
  assert.equal(state.candidateOffset, 0);
});

test("Back from Connection reconciles a removed marker or empty candidate list", () => {
  const wall = 1790000000000;
  let state = fixtureState("details", 0, wall);
  state = reduce(state, { type: "NAVIGATE", direction: 1 });
  state = reduce(state, { type: "INFO" });
  state = reduce(state, { type: "SNAPSHOT", snapshot: { ...state.snapshot, sequence: 2,
    markers: state.snapshot.markers.filter((m) => m.id !== "alpha") }, now: 1, wall });
  state = reduce(state, { type: "BACK" });
  assert.equal(state.view, "removed");
  const scene = radarScene(state, 1);
  assert.equal(scene.pages, 1);
  assert.ok(scene.nodes.some((node) => node.text === "Marker unavailable"));
  state = reduce(state, { type: "NAVIGATE", direction: 1 });
  assert.equal(state.panel, 0);

  state = { ...fixtureState("radar", 0, wall), view: "candidates", candidates: ["alpha"] };
  state = reduce(state, { type: "INFO" });
  state = reduce(state, { type: "SNAPSHOT", snapshot: { ...state.snapshot, sequence: 2, markers: [] }, now: 1, wall });
  assert.equal(state.view, "info", "source updates do not interrupt Connection");
  state = reduce(state, { type: "BACK" });
  assert.equal(state.view, "radar");
});
