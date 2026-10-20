import { fixtureState, SCENARIOS } from "../../rem-zepp-sync-trex2/common/radar/fixtures.js";
import { reduce } from "../../rem-zepp-sync-trex2/common/radar/state.js";
import { radarScene, actionAt } from "../../rem-zepp-sync-trex2/common/radar/view.js";
import { formatBearing } from "../../rem-zepp-sync-trex2/common/radar/geometry.js";
import { activate } from "../../rem-zepp-sync-trex2/common/radar/navigation.js";
import { sceneToSvg } from "./svg.js";

const display = document.querySelector("#display");
const scenario = document.querySelector("#scenario");
const heading = document.querySelector("#heading");
const images = Object.fromEntries(["dial", "cone", "operator", "cone-grey", "operator-grey", "cone-warning", "operator-warning"].map((name) => [`radar/${name}.png`, `/rem-zepp-sync-trex2/assets/trex2/radar/${name}.png`]));
let now = 0;
let state = fixtureState("radar", now);
let scene;

for (const [value, label] of SCENARIOS) scenario.add(new Option(label, value));

function draw() {
  scene = radarScene(state, now);
  display.innerHTML = sceneToSvg(scene, images);
  heading.value = Math.round(state.heading || 0);
  document.querySelector("#heading-value").value = formatBearing(state.heading);
  document.querySelector("#screen-status").textContent = `${state.demo ? "DEMO / " : ""}${scene.status} · ${state.view === "details" ? "Marker details" : state.view === "candidates" ? "Choose a marker" : "SELECT opens information"}${scene.pages > 1 ? ` · ${scene.page + 1}/${scene.pages}` : ""}`;
}

function act(action) {
  if (action.type === "DEMO") state = fixtureState("radar", now);
  else if (action.type === "CONNECT") {
    document.querySelector("#screen-status").textContent = "On the watch, this requests the paired REM radar source.";
    return;
  }
  else if (action.type === "STATUS") {
    document.querySelector("#screen-status").textContent = "On the watch, this opens the existing REM Status page.";
    return;
  } else state = reduce(state, action);
  draw();
}

display.addEventListener("click", (event) => {
  if (suppressTap) { suppressTap = false; return; }
  const box = display.getBoundingClientRect();
  const action = actionAt(scene, state, (event.clientX - box.left) * 454 / box.width, (event.clientY - box.top) * 454 / box.height);
  if (action) act(action);
});
function back() {
  act({ type: state.view === "radar" && state.selectedId ? "FOCUS_CLEAR" : state.view === "radar" && state.demo ? "RESET" : "BACK" });
}
function physical(key) {
  if (key === "back") back();
  else act(key === "select" ? activate(state) : { type: "NAVIGATE", direction: key === "up" ? -1 : 1 });
}
display.addEventListener("keydown", (event) => {
  const key = { ArrowUp: "up", ArrowDown: "down", Enter: "select", Escape: "back" }[event.key];
  if (key) { event.preventDefault(); physical(key); }
});
document.querySelectorAll("[data-key]").forEach((button) => button.addEventListener("click", () => physical(button.dataset.key)));
function swipe(direction) {
  if (state.view === "candidates") act({ type: "CANDIDATE_PAGE", direction });
  else if (state.view !== "radar") act({ type: "PANEL", panel: state.panel + direction });
}
let pointerY = null, suppressTap = false;
display.addEventListener("pointerdown", (event) => { pointerY = event.clientY; suppressTap = false; });
display.addEventListener("pointerup", (event) => {
  if (pointerY !== null && Math.abs(event.clientY - pointerY) > 35) { suppressTap = true; swipe(event.clientY < pointerY ? 1 : -1); }
  pointerY = null;
});
display.addEventListener("pointercancel", () => { pointerY = null; suppressTap = false; });
display.addEventListener("wheel", (event) => { if (state.view !== "radar") { event.preventDefault(); swipe(event.deltaY > 0 ? 1 : -1); } }, { passive: false });
scenario.addEventListener("change", () => { now = 0; state = fixtureState(scenario.value, now); draw(); });
heading.addEventListener("input", () => act({ type: "HEADING", status: "valid", reference: "true", value: Number(heading.value), weight: 1 }));
document.querySelectorAll("[data-heading]").forEach((button) => button.addEventListener("click", () => act({ type: "HEADING", status: "valid", reference: "true", value: Number(button.dataset.heading), weight: 1 })));
document.querySelector("#back").addEventListener("click", back);
document.querySelector("#age").addEventListener("click", () => { now += 15000; draw(); });
document.querySelector("#reset").addEventListener("click", () => { now = 0; state = fixtureState(scenario.value, now); draw(); });
draw();
