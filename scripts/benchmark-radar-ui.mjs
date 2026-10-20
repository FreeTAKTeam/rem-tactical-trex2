import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fixtureState } from "../rem-zepp-sync-trex2/common/radar/fixtures.js";
import { radarScene } from "../rem-zepp-sync-trex2/common/radar/view.js";
import { createWidgetRenderer } from "../rem-zepp-sync-trex2/common/radar/widgetRenderer.js";

// A local work-count benchmark, not a measurement of physical watch latency.
const output = [];
for (const name of ["radar", "maximum"]) {
  let creates = 0, writes = 0, deletes = 0, scales = 0;
  const widget = () => { creates++; return { createWidget: widget, setProperty() { writes++; }, addEventListener() {} }; };
  const ui = { widget: { GROUP: "GROUP", IMG: "IMG", TEXT: "TEXT", CIRCLE: "CIRCLE", FILL_RECT: "FILL_RECT" },
    prop: { MORE: "MORE", VISIBLE: "VISIBLE" }, align: {}, text_style: {}, event: { CLICK_UP: "CLICK_UP" },
    createWidget: widget, deleteWidget() { deletes++; } };
  const renderer = createWidgetRenderer(ui, (n) => { scales++; return n; }, () => {});
  const state = fixtureState(name, 0, 1790000000000); state.demo = false;
  const scene = radarScene(state, 0);
  renderer.render(scene);
  const initial = { creates, writes, scales };
  const start = performance.now();
  for (let i = 0; i < 1000; i++) renderer.render(scene);
  const repeated = { cpuMs: performance.now() - start, creates: creates - initial.creates, writes: writes - initial.writes, scales: scales - initial.scales };
  renderer.destroy();
  output.push({ scenario: name, initial, repeatedFrames: 1000, repeated, teardownDeletes: deletes });
}
const report = { measuredAt: new Date().toISOString(), limitation: "Node.js with UI stubs; no firmware latency or battery claim", scenarios: output };
await fs.mkdir(new URL("../dist/rem-radar-ui/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../dist/rem-radar-ui/render-work-0.1.27.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
