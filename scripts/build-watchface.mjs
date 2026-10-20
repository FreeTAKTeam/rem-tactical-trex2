import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Zeus empties its project's dist directory. Build a source snapshot so the
// repository's retained app packages, QRs and verification records survive.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
if (!["build", "preview", "bridge"].includes(command)) {
  throw new Error("Usage: node scripts/build-watchface.mjs <build|preview|bridge> [Zeus options]");
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
if (manifest.app.appType !== "watchface") throw new Error("Expected the watch-face manifest");
fs.mkdirSync(path.join(root, ".tools"), { recursive: true });
const stage = fs.mkdtempSync(path.join(root, ".tools", "watchface-build-"));
for (const name of ["app.json", "app.js", "package.json"]) {
  fs.copyFileSync(path.join(root, name), path.join(stage, name));
}
for (const name of ["common", "shared", "watchface", "assets"]) {
  fs.cpSync(path.join(root, name), path.join(stage, name), { recursive: true });
}
console.log(`Watch-face build workspace: ${stage}`);
const result = spawnSync(process.execPath, [path.join(root, "scripts", "run-zeus.cjs"), command, ...args], {
  cwd: stage, stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (command !== "bridge") {
  const packages = fs.readdirSync(path.join(stage, "dist")).filter((name) => name.endsWith(".zab"));
  if (packages.length !== 1) throw new Error("Expected one freshly built watch-face package");
  const destination = path.join(root, "dist", `REM-Tactical-${manifest.app.version.name}${command === "build" ? "-development" : ""}.zab`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(stage, "dist", packages[0]), destination);
  console.log(`Retained watch-face package: ${destination}`);
}
