import { readFileSync, writeFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));

let changed = false;
if (server.version !== pkg.version) {
  server.version = pkg.version;
  changed = true;
}

if (server.packages?.[0] && server.packages[0].version !== pkg.version) {
  server.packages[0].version = pkg.version;
  changed = true;
}

if (changed) {
  writeFileSync("server.json", JSON.stringify(server, null, 2) + "\n");
  console.log(`\u2713 Synced server.json to v${pkg.version}`);
} else {
  console.log(`\u2713 server.json already synced to v${pkg.version}`);
}
