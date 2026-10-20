import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.REM_RADAR_PREVIEW_PORT || 4782);
const allowed = ["preview/radar/", "rem-zepp-sync-trex2/common/radar/", "rem-zepp-sync-trex2/assets/trex2/radar/"];
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/") { response.writeHead(302, { Location: "/preview/radar/" }); response.end(); return; }
  try {
    let relative = decodeURIComponent(url.pathname).slice(1);
    if (relative.endsWith("/")) relative += "index.html";
    const target = path.resolve(root, relative);
    const normalized = path.relative(root, target).replaceAll("\\", "/");
    if (!allowed.some((prefix) => normalized.startsWith(prefix)) || normalized.startsWith("..")) throw new Error("Forbidden");
    const data = await readFile(target);
    response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(data);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`REM RADAR app UI: http://127.0.0.1:${port}/preview/radar/`));
