import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { RADAR } from "../rem-zepp-sync-trex2/common/radar/geometry.js";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "rem-zepp-sync-trex2/assets/trex2/radar");
await fs.mkdir(out, { recursive: true });
const save = async (name, w, h, body) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(out, `${name}.png`));
};

const ticks = Array.from({ length: 60 }, (_, i) => {
  const a = i * Math.PI / 30;
  const inner = i % 5 === 0 ? RADAR.cx - 10 : RADAR.cx - 5;
  return `<line x1="${RADAR.cx + inner * Math.sin(a)}" y1="${RADAR.cy - inner * Math.cos(a)}" x2="${RADAR.cx + (RADAR.cx - 1) * Math.sin(a)}" y2="${RADAR.cy - (RADAR.cx - 1) * Math.cos(a)}" stroke="${i % 5 === 0 ? "#456168" : "#263b40"}" stroke-width="${i % 5 === 0 ? 2 : 1}"/>`;
}).join("");
const rings = [RADAR.radius / 2, RADAR.radius].map((r) => `<circle cx="${RADAR.cx}" cy="${RADAR.cy}" r="${r}" fill="none" stroke="#2c4b53" stroke-width="1"/>`).join("");
const low = RADAR.cx - RADAR.radius;
const high = RADAR.cx + RADAR.radius;
await save("dial", RADAR.size, RADAR.size, `${ticks}${rings}<path d="M${low} ${RADAR.cy}H${high}M${RADAR.cx} ${low}V${high}" stroke="#21383e" stroke-width="1"/>`);
const mid = RADAR.coneWidth / 2;
const left = mid - Math.round(RADAR.radius * Math.sin(Math.PI / 9));
const top = RADAR.radius - Math.round(RADAR.radius * Math.cos(Math.PI / 9));
for (const [suffix, pointer, cone] of [["", "#ff893d", "#5ed7cc"], ["-grey", "#83919a", "#83919a"], ["-warning", "#ffd15c", "#ffd15c"]]) {
  await save(`cone${suffix}`, RADAR.coneWidth, RADAR.radius, `<path d="M${mid} ${RADAR.radius}L${left} ${top}Q${mid} ${-top} ${RADAR.coneWidth - left} ${top}Z" fill="${cone}" fill-opacity=".17"/><path d="M${mid} ${RADAR.radius}L${left} ${top}M${mid} ${RADAR.radius}L${RADAR.coneWidth - left} ${top}" stroke="${cone}" stroke-opacity=".35" stroke-width="1"/>`);
  await save(`operator${suffix}`, 28, 32, `<path d="M14 1L27 31L14 25L1 31Z" fill="${pointer}"/>`);
}
console.log(`Radar assets: ${out}`);
