// Layout preview of the actual production widget definitions with fixture data.
// This checks assets/positions, not firmware binding behavior or sensor accuracy.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { watchfaceHarness } from "./testing/watchface-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const assetRoot = path.join(root, "assets/trex2");
const out = path.join(root, "dist");
await fs.mkdir(out, { recursive: true });
const extremes = process.argv.includes("--extremes");
const values = extremes
  ? { HEART: "172", BATTERY: "100", ALTITUDE: "-12345", ALTIMETER: "1200" }
  : { HEART: "72", BATTERY: "78", ALTITUDE: "124", ALTIMETER: "1007" };
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

async function render(widgets, name, level = 1) {
  const content = [];
  async function img(src, x, y, width, height, transform = "") {
    const data = await fs.readFile(path.join(assetRoot, src));
    const meta = await sharp(data).metadata();
    content.push(`<image x="${x}" y="${y}" width="${width || meta.width}" height="${height || meta.height}" transform="${transform}" href="data:image/png;base64,${data.toString("base64")}"/>`);
    return meta.width;
  }
  for (const { type, props: p } of widgets) {
    if (!p.visible || p.show_level !== level) continue;
    if (type === "IMG") {
      const positioned = p.pos_x !== undefined;
      await img(p.src, positioned ? p.pos_x : p.x, positioned ? p.pos_y : p.y,
        positioned ? undefined : p.w, positioned ? undefined : p.h,
        p.angle ? `rotate(${p.angle} ${p.center_x} ${p.center_y})` : "");
    } else if (type === "TEXT") {
      const centered = p.align_h === "CENTER_H";
      content.push(`<text x="${centered ? p.x + p.w / 2 : p.x}" y="${p.y + p.h / 2}" dy=".35em" text-anchor="${centered ? "middle" : "start"}" font-family="Arial" font-size="${p.text_size}" fill="#${p.color.toString(16).padStart(6, "0")}">${xml(p.text)}</text>`);
    } else if (type === "FILL_RECT") {
      content.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#${p.color.toString(16).padStart(6, "0")}"/>`);
    } else if (type === "IMG_TIME") {
      for (const [part, value] of [["hour", "10"], ["minute", "09"]]) {
        let x = p[`${part}_startX`];
        for (const c of value) x += await img(p[`${part}_array`][Number(c)], x, p[`${part}_startY`]);
      }
    } else if (type === "TEXT_IMG") {
      const parts = [];
      for (const c of values[p.type] || "") {
        parts.push(c === ":" ? p.dot_image : c === "-" ? p.negative_image : p.font_array[Number(c)]);
      }
      if (p.unit_en) parts.push(p.unit_en);
      const widths = await Promise.all(parts.map(async (src) => {
        const data = await fs.readFile(path.join(assetRoot, src));
        return (await sharp(data).metadata()).width;
      }));
      let x = p.x;
      if (p.align_h === "CENTER_H" && Number.isFinite(p.w)) x += Math.max(0, (p.w - widths.reduce((sum, width) => sum + width, 0)) / 2);
      for (const [index, src] of parts.entries()) x += await img(src, x, p.y, widths[index]);
    } else if (type === "IMG_LEVEL") {
      await img(p.image_array[7], p.x, p.y, p.w, p.h);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="454" height="454"><defs><clipPath id="round"><circle cx="227" cy="227" r="227"/></clipPath></defs><g clip-path="url(#round)">${content.join("")}</g></svg>`;
  const output = path.join(out, `${name}${extremes ? "-extremes" : ""}.png`);
  await sharp(Buffer.from(svg)).png().toFile(output);
  console.log(output);
}

const h = watchfaceHarness(); h.build();
await render(h.widgets, "REM-Tactical-1.3.28-offline-layout");
await render(h.widgets, "REM-Tactical-1.3.28-aod-layout", 2);
h.tap();
h.requests[0].resolve({ data: { connection: "CONNECTED", updatedAt: h.now(), operator: "CORVO", operatorStatus: "ACTIVE", teamStatus: "GREEN", lastSyncAge: "NOW", lastEvent: { title: "MECP/0/P01", source: "POCO", time: new Date(h.now()).toISOString() } } });
await h.flush();
await render(h.widgets, "REM-Tactical-1.3.28-connected-layout");
