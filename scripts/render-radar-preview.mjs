import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fixtureState, SCENARIOS } from "../rem-zepp-sync-trex2/common/radar/fixtures.js";
import { radarScene } from "../rem-zepp-sync-trex2/common/radar/view.js";
import { sceneToSvg } from "../preview/radar/svg.js";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist/rem-radar-ui");
await fs.mkdir(out, { recursive: true });
const images = {};
for (const name of ["dial", "cone", "operator", "cone-grey", "operator-grey", "cone-warning", "operator-warning"]) {
  const image = await fs.readFile(path.join(root, `rem-zepp-sync-trex2/assets/trex2/radar/${name}.png`));
  images[`radar/${name}.png`] = `data:image/png;base64,${image.toString("base64")}`;
}
const wall = 1790000000000;
for (const [name] of SCENARIOS) {
  await sharp(Buffer.from(sceneToSvg(radarScene(fixtureState(name, 0, wall), 0), images))).png().toFile(path.join(out, `${name}.png`));
}
const width = 1518;
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="610"><rect width="100%" height="100%" fill="#071012"/><text x="40" y="47" fill="#edf3ef" font-family="sans-serif" font-size="24" letter-spacing="3">REM RADAR / T-REX 2 APP</text><text x="40" y="76" fill="#91a7ab" font-family="sans-serif" font-size="14">Native Zepp UI · 454 × 454 · Sample data</text>${[["HEADING-UP RADAR",40],["FULL-SCREEN DETAILS",532],["DISCONNECTED / COLOURS RETAINED",1024]].map(([label,x])=>`<text x="${x}" y="585" fill="#65dfd2" font-family="sans-serif" font-size="12" letter-spacing="1">${label}</text>`).join("")}</svg>`);
await sharp(background).composite(await Promise.all(["radar", "details", "disconnected"].map(async (name, index) => ({
  input: await fs.readFile(path.join(out, `${name}.png`)), left: 40 + index * 492, top: 100,
})))).png().toFile(path.join(root, "dist/REM-Radar-UI.png"));
console.log(`Rendered ${SCENARIOS.length} app states and dist/REM-Radar-UI.png`);
