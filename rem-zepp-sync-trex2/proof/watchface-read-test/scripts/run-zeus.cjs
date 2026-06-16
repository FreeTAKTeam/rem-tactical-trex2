const path = require("path");
const moduleAlias = require("module-alias");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..", "..", "..");
const zeusRoot = path.join(repoRoot, "node_modules", "@zeppos", "zeus-cli");

moduleAlias.addAlias(
  "zeppos-app-utils",
  path.join(zeusRoot, "private-modules", "zeppos-app-utils")
);

require(path.join(zeusRoot, "bin", "main.js"));
