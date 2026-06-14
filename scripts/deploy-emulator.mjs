import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import WebSocket from "ws";

const sourceZip = process.argv[2];
const slotId = Number(process.argv[3] ?? 11611);
const endpoint = process.argv[4] ?? "ws://127.0.0.1:7833/SIMULATOR";

if (!sourceZip || !fs.existsSync(sourceZip)) {
  throw new Error("Usage: node scripts/deploy-emulator.mjs <device.zip> [slotId]");
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "rem-zepp-deploy-"));
const packageDir = path.join(workDir, "package");
const outputZip = path.join(workDir, "device-emulator.zip");
fs.mkdirSync(packageDir);

execFileSync("tar", ["-xf", path.resolve(sourceZip), "-C", packageDir]);

const manifestPath = path.join(packageDir, "app.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.app.appId = slotId;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

execFileSync(
  "tar",
  ["-a", "-c", "-f", outputZip, ...fs.readdirSync(packageDir)],
  { cwd: packageDir },
);

const payload = fs.readFileSync(outputZip);
const appIdHex = slotId.toString(16).toUpperCase().padStart(8, "0");
const installHeader = Buffer.from(
  JSON.stringify({
    method: "Project",
    type: "install",
    appid: appIdHex,
    length: payload.length,
    file: "",
  }).replace('""}', ""),
);
const installMessage = Buffer.concat([
  installHeader,
  payload,
  Buffer.from('"}'),
]);

await new Promise((resolve, reject) => {
  const socket = new WebSocket(endpoint);
  const timeout = setTimeout(() => {
    socket.terminate();
    reject(new Error("Timed out waiting for the simulator"));
  }, 30000);

  socket.on("open", () => {
    socket.send(installMessage, (installError) => {
      if (installError) {
        reject(installError);
        return;
      }

      socket.send(
        JSON.stringify({
          method: "ChangeWatchFace",
          appid: appIdHex,
        }),
        (activationError) => {
          if (activationError) {
            reject(activationError);
            return;
          }

          setTimeout(() => {
            clearTimeout(timeout);
            socket.close();
            resolve();
          }, 2000);
        },
      );
    });
  });
  socket.on("message", (data) => {
    console.log(data.toString());
  });
  socket.on("error", reject);
});

console.log(`Installed and activated emulator watch-face slot ${slotId}.`);
