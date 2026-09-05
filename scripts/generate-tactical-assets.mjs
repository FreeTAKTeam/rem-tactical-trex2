import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "assets/trex2/images/tactical");
await fs.mkdir(output, { recursive: true });

async function glyph(name, text, width) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20"><text x="${text.startsWith(" ") ? 3 : 0}" y="15" fill="#e5e5e5" font-family="DejaVu Sans, Arial" font-size="13">${text.trimStart()}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${name}.png`));
}

for (let digit = 0; digit < 10; digit++) await glyph(String(digit), String(digit), 8);
for (const [name, text, width] of [
  ["minus", "-", 5], ["invalid", "--", 12], ["dot", ".", 4], ["colon", ":", 4],
  ["m", " m", 16], ["ft", " ft", 16], ["hpa", " hPa", 28], ["percent", "%", 13],
]) await glyph(name, text, width);

const compactOutput = path.join(output, "compact");
await fs.mkdir(compactOutput, { recursive: true });
for (const [name, text, width] of [
  ...Array.from({ length: 10 }, (_, n) => [String(n), String(n), 7]),
  ["minus", "-", 4], ["invalid", "--", 10], ["dot", ".", 3], ["colon", ":", 3],
  ["percent", "%", 11],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="18"><text x="0" y="14" fill="#e5e5e5" font-family="DejaVu Sans, Arial" font-size="11">${text}</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(compactOutput, `${name}.png`));
}

const largeOutput = path.join(output, "large");
await fs.mkdir(largeOutput, { recursive: true });
for (const [name, text, width] of [
  ["minus", "-", 14], ["invalid", "--", 28], ["dot", ".", 8],
  ["m", "m", 24], ["ft", "ft", 28], ["hpa", "hPa", 42],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="34"><text x="2" y="27" fill="#e5e5e5" font-family="Arial Narrow, Arial" font-size="22">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(largeOutput, `${name}.png`));
}

const batteryPercent = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34"><text x="2" y="29" fill="#e5e5e5" font-family="DejaVu Sans, Arial" font-size="25">%</text></svg>`;
await sharp(Buffer.from(batteryPercent)).png().toFile(path.join(output, "battery-percent.png"));

for (const char of "0123456789:") {
  const width = char === ":" ? 14 : 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64"><text x="${width / 2}" y="51" text-anchor="middle" fill="#71816d" font-family="DejaVu Sans, Arial" font-size="52">${char}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, `aod-${char === ":" ? "colon" : char}.png`));
}

// Thirty native lunar-day levels, from new through waxing to waning.
// The OS selects the phase; these are static assets, not an animation.
for (let phase = 0; phase < 30; phase++) {
  const angle = phase * Math.PI * 2 / 30;
  const pixels = Buffer.alloc(24 * 24 * 4);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const nx = (x - 11.5) / 10.5;
      const ny = (y - 11.5) / 10.5;
      const radius = nx * nx + ny * ny;
      if (radius > 1) continue;
      const z = Math.sqrt(1 - radius);
      const lit = nx * Math.sin(angle) - z * Math.cos(angle) > 0;
      const value = radius > 0.85 ? 143 : (lit ? 229 : 25);
      const offset = (y * 24 + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  await sharp(pixels, { raw: { width: 24, height: 24, channels: 4 } })
    .png().toFile(path.join(output, `moon-${phase}.png`));
}
console.log(`Generated tactical glyphs and 30 moon levels in ${output}`);
