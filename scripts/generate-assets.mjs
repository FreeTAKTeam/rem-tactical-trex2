import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const assetDir = path.join(root, "assets", "trex2");
const imageDir = path.join(assetDir, "images");
const fontSourceDir = path.join(root, "design", "fonts");
const timeImageDir = path.join(imageDir, "time");
const metricImageDir = path.join(imageDir, "metrics", "operator");

const timeFonts = {
  teko: {
    file: "Teko.ttf",
    font: "Teko SemiBold",
    distress: true,
  },
  "black-ops": {
    file: "BlackOpsOne-Regular.ttf",
    font: "Black Ops One",
    distress: false,
  },
};

const timeGlyphHeight = 108;
const timeDigitWidth = 68;
const timeColonWidth = 24;
const metricGlyphHeight = 34;
const metricDigitWidth = 22;

async function renderGlyph(character, config, fontPath, width) {
  const text = await sharp({
    text: {
      text: `<span foreground="#e5e5e5">${character}</span>`,
      font: config.font,
      fontfile: fontPath,
      width: width - 4,
      height: timeGlyphHeight - 6,
      align: "center",
      rgba: true,
    },
  })
    .extend({
      top: 2,
      bottom: 2,
      left: 2,
      right: 2,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(width, timeGlyphHeight, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  if (!config.distress) {
    return text;
  }

  const wear = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${timeGlyphHeight}">
      <g fill="white" opacity=".78">
        <path d="M8 19h8v1H8zM34 14h6v2h-6zM18 36h10v1H18z"/>
        <path d="M7 52h7v2H7zM33 61h10v1H33zM13 72h8v1H13z"/>
        <path d="M40 28h6v1h-6zM23 45h5v1h-5z"/>
      </g>
    </svg>`);

  return sharp(text)
    .composite([{ input: wear, blend: "dest-out" }])
    .png()
    .toBuffer();
}

async function generateTimeFonts() {
  for (const [name, config] of Object.entries(timeFonts)) {
    const outputDir = path.join(timeImageDir, name);
    const fontPath = path.join(fontSourceDir, config.file);
    await fs.mkdir(outputDir, { recursive: true });

    for (let digit = 0; digit <= 9; digit += 1) {
      await fs.writeFile(
        path.join(outputDir, `${digit}.png`),
        await renderGlyph(String(digit), config, fontPath, timeDigitWidth),
      );
    }

    await fs.writeFile(
      path.join(outputDir, "colon.png"),
      await renderGlyph(":", config, fontPath, timeColonWidth),
    );
  }
}

async function generateMetricFont() {
  await fs.mkdir(metricImageDir, { recursive: true });

  for (let digit = 0; digit <= 9; digit += 1) {
    const image = await sharp({
      text: {
        text: `<span foreground="#e5e5e5">${digit}</span>`,
        font: "Arial Narrow",
        width: metricDigitWidth,
        height: metricGlyphHeight,
        align: "center",
        rgba: true,
      },
    })
      .resize(metricDigitWidth, metricGlyphHeight, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    await fs.writeFile(path.join(metricImageDir, `${digit}.png`), image);
  }
}

const contourPaths = Array.from({ length: 19 }, (_, index) => {
  const y = 18 + index * 17;
  const bend = index % 2 ? 14 : -11;
  return `<path d="M12 ${y} C85 ${y + bend}, 116 ${y - bend}, 182 ${y}
    S302 ${y + bend}, 442 ${y - 2}" />`;
}).join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="454" height="454" viewBox="0 0 454 454">
  <defs>
    <radialGradient id="dial" cx="50%" cy="45%" r="60%">
      <stop offset="0" stop-color="#091109"/>
      <stop offset="0.68" stop-color="#030703"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="2" r=".55" fill="#9bb69a" opacity=".11"/>
      <circle cx="5" cy="6" r=".45" fill="#9bb69a" opacity=".08"/>
    </pattern>
    <clipPath id="round"><circle cx="227" cy="227" r="225"/></clipPath>
  </defs>

  <g clip-path="url(#round)">
    <rect width="454" height="454" fill="url(#dial)"/>
    <rect width="454" height="454" fill="url(#grain)" opacity=".55"/>

    <g fill="none" stroke="#486946" stroke-width=".55" opacity=".28">
      ${contourPaths}
      <path d="M28 31 C70 64 55 114 94 139 S168 175 145 210 S73 262 103 304 S184 355 151 416"/>
      <path d="M397 22 C356 69 388 118 344 146 S285 192 315 229 S395 280 361 323 S293 371 319 438"/>
    </g>

    <circle cx="227" cy="227" r="224" fill="none" stroke="#314d2e" stroke-width="2"/>
    <circle cx="227" cy="227" r="218" fill="none" stroke="#162516" stroke-width="1"/>

    <g fill="#030703" fill-opacity=".72" stroke="#4c713e" stroke-width="1.15">
      <path d="M156 8 H298 L316 38 L294 67 H160 L138 38 Z"/>
      <path d="M43 72 H184 L204 92 L191 148 H35 L25 120 Z"/>
      <path d="M270 72 H411 L429 120 L419 148 H263 L250 92 Z"/>
      <path d="M25 153 H429 L439 180 V245 L424 273 H30 L15 245 V180 Z"/>
      <path d="M27 280 H158 V365 L112 407 H46 L18 365 Z"/>
      <path d="M164 280 H290 V403 H164 Z"/>
      <path d="M296 280 H427 L436 365 L408 407 H342 L296 365 Z"/>
      <path d="M132 410 H322 L342 432 H112 Z"/>
    </g>

    <g stroke="#3f6338" stroke-width="1" opacity=".75">
      <path d="M28 151 H426"/>
      <path d="M28 276 H426"/>
      <path d="M48 394 H112"/>
      <path d="M342 394 H406"/>
    </g>

    <!-- heart -->
    <path d="M52 115 C47 108 35 110 35 119 C35 129 52 139 52 139 C52 139 69 129 69 119 C69 110 57 108 52 115Z"
      fill="#76d35d" opacity=".9"/>

    <!-- battery -->
    <rect x="397" y="108" width="15" height="27" rx="2" fill="none" stroke="#76d35d" stroke-width="2"/>
    <rect x="401" y="113" width="7" height="18" fill="#76d35d" opacity=".78"/>
    <rect x="401" y="104" width="7" height="4" fill="#76d35d"/>

    <!-- GPS pin and signal bars -->
    <path d="M52 318 C52 303 75 303 75 318 C75 331 63.5 343 63.5 343 C63.5 343 52 331 52 318Z"
      fill="#76d35d"/>
    <circle cx="63.5" cy="317" r="4.5" fill="#071007"/>
    <g fill="#76d35d">
      <rect x="49" y="372" width="7" height="8"/>
      <rect x="60" y="367" width="7" height="13"/>
      <rect x="71" y="361" width="7" height="19"/>
      <rect x="82" y="354" width="7" height="26"/>
    </g>

    <!-- operator separators and sync signal -->
    <path d="M318 348 H400" stroke="#3f6338"/>
    <g fill="#76d35d">
      <rect x="371" y="417" width="5" height="6"/>
      <rect x="379" y="413" width="5" height="10"/>
      <rect x="387" y="408" width="5" height="15"/>
      <rect x="395" y="402" width="5" height="21"/>
    </g>
  </g>
</svg>`;

await fs.mkdir(imageDir, { recursive: true });
await generateTimeFonts();
await generateMetricFont();
await sharp({
  create: {
    width: 138,
    height: 105,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .png()
  .toFile(path.join(imageDir, "touch-target.png"));

const compassDial = `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <circle cx="40" cy="40" r="38" fill="#020602" stroke="#4c9a3d" stroke-width="1.3"/>
  <circle cx="40" cy="40" r="37" fill="none" stroke="#315f2e" stroke-width="1"/>
  <g stroke="#76d35d" stroke-width="1">
    <path d="M40 3V10 M40 70V77 M3 40H10 M70 40H77"/>
    <path d="M14 14L19 19 M61 61L66 66 M66 14L61 19 M19 61L14 66"/>
  </g>
</svg>`;

const compassArrow = `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <path d="M40 7L51 45L40 40L29 45Z" fill="#76d35d"/>
  <path d="M40 73L32 41L40 46L48 41Z" fill="#173817"/>
  <path d="M40 7L44 20H36Z" fill="#ff9f2e"/>
  <circle cx="40" cy="40" r="3" fill="#d8e2d5"/>
</svg>`;

await sharp(Buffer.from(compassDial))
  .png()
  .toFile(path.join(imageDir, "compass-dial.png"));
await sharp(Buffer.from(compassArrow))
  .png()
  .toFile(path.join(imageDir, "compass-arrow.png"));
await sharp(Buffer.from(svg)).png().toFile(path.join(imageDir, "tactical-bg-v3.png"));

const previewOverlay = `
<svg xmlns="http://www.w3.org/2000/svg" width="454" height="454">
  <style>
    .green{fill:#76d35d}.white{fill:#e5e5e5}.dim{fill:#8fa08c}
    .agency{font-family:'Agency FB','Arial Narrow',sans-serif;font-weight:bold}
    .center{text-anchor:middle}.start{text-anchor:start}
  </style>
  <g class="agency">
    <text x="227" y="39" class="green center" font-size="32">REM</text>
    <circle cx="168" cy="55" r="4" fill="#76d35d"/>
    <text x="233" y="61" class="green center" font-size="16">CONNECTED</text>
    <text x="105" y="91" class="green center" font-size="15">HEART RATE</text>
    <text x="127" y="129" class="white center" font-size="42">72</text>
    <text x="127" y="145" class="dim center" font-size="13">BPM</text>
    <text x="333" y="91" class="green center" font-size="15">BATTERY</text>
    <text x="330" y="130" class="white center" font-size="40">78%</text>
    <text x="101" y="306" class="green center" font-size="14">GPS</text>
    <text x="116" y="337" class="white center" font-size="25">3D</text>
    <text x="116" y="365" class="white center" font-size="21">FIX</text>
    <text x="227" y="301" class="green center" font-size="14">HEADING</text>
    <text x="227" y="331" class="white center" font-size="27">NW 328°</text>
    <text x="358" y="306" class="green center" font-size="14">C0rv0</text>
    <text x="358" y="337" class="white center" font-size="23">ACTIVE</text>
    <text x="358" y="363" class="green center" font-size="12">TEAM</text>
    <text x="358" y="387" class="white center" font-size="21">Yellow</text>
    <text x="174" y="425" class="green center" font-size="12">LAST SYNC</text>
    <text x="264" y="425" class="white center" font-size="14">14:30 UTC</text>
  </g>
</svg>`;

await sharp(path.join(imageDir, "tactical-bg-v3.png"))
  .composite([
    { input: Buffer.from(previewOverlay) },
    { input: path.join(imageDir, "compass-dial.png"), left: 187, top: 330 },
    { input: path.join(imageDir, "compass-arrow.png"), left: 187, top: 330 },
    { input: path.join(timeImageDir, "teko", "1.png"), left: 79, top: 153 },
    { input: path.join(timeImageDir, "teko", "4.png"), left: 147, top: 153 },
    { input: path.join(timeImageDir, "teko", "colon.png"), left: 215, top: 153 },
    { input: path.join(timeImageDir, "teko", "3.png"), left: 239, top: 153 },
    { input: path.join(timeImageDir, "teko", "5.png"), left: 307, top: 153 },
  ])
  .png()
  .toFile(path.join(assetDir, "preview-v2.png"));

await fs.copyFile(
  path.join(assetDir, "preview-v2.png"),
  path.join(assetDir, "preview.png"),
);

console.log("Generated tactical background, preview, and Teko/Black Ops time glyphs");
