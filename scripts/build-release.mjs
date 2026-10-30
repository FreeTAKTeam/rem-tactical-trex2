import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// Zeus clears dist before building. Stage each project to preserve installed
// baseline packages and leave development manifests unchanged. An optional
// argument selects another output directory, e.g. to rebuild without replacing
// the packages already submitted from dist/amazfit-release.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.resolve(process.argv[2] || path.join(root, "dist", "amazfit-release"));
fs.mkdirSync(destination, { recursive: true });
fs.mkdirSync(path.join(root, ".tools"), { recursive: true });
const releases = [];
for (const project of [
  { source: root, name: "REM-Tactical", directories: ["common", "shared", "watchface", "assets"] },
  { source: path.join(root, "rem-zepp-sync-trex2"), name: "REM-Sync", directories: ["common", "shared", "page", "app-side", "setting", "assets"] },
]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(project.source, "app.json"), "utf8"));
  manifest.debug = false;
  const stage = fs.mkdtempSync(path.join(root, ".tools", "release-build-"));
  try {
    fs.writeFileSync(path.join(stage, "app.json"), JSON.stringify(manifest, null, 2) + "\n");
    for (const name of ["app.js", "package.json"]) {
      fs.copyFileSync(path.join(project.source, name), path.join(stage, name));
    }
    for (const directory of project.directories) {
      const source = path.join(project.source, directory);
      if (fs.existsSync(source)) fs.cpSync(source, path.join(stage, directory), { recursive: true });
    }
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "run-zeus.cjs"), "build", "-t", "Amazfit T-Rex 2"], {
      cwd: stage, stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Zeus build failed for ${project.name}`);
    // Ship only the selected devices' compiled packages, without intermediate
    // source products used by Zepp for automatic adaptation to other devices.
    const prune = spawnSync(process.execPath, [path.join(root, "scripts", "run-zeus.cjs"), "prune"], {
      cwd: stage, stdio: "inherit",
    });
    if (prune.error) throw prune.error;
    if (prune.status !== 0) throw new Error(`Zeus prune failed for ${project.name}`);
    const packages = fs.readdirSync(path.join(stage, "dist")).filter((name) => name.endsWith(".zab"));
    if (packages.length !== 1) throw new Error("Expected exactly one fresh release package");
    const filename = `${project.name}-${manifest.app.version.name}-release.zab`;
    const output = path.join(destination, filename);
    fs.copyFileSync(path.join(stage, "dist", packages[0]), output);
    releases.push({
      filename, appId: manifest.app.appId, version: manifest.app.version,
      debug: manifest.debug, buildMode: "production",
      sha256: createHash("sha256").update(fs.readFileSync(output)).digest("hex"),
      bytes: fs.statSync(output).size,
    });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
fs.writeFileSync(path.join(destination, "packages.json"), JSON.stringify({ builtAt: new Date().toISOString(), releases }, null, 2) + "\n");
console.log(JSON.stringify(releases, null, 2));
