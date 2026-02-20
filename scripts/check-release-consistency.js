import { readFileSync } from "fs";

function fail(message) {
  console.error(`\u2717 ${message}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");

if (pkg.version !== server.version) {
  fail(`Version mismatch: package.json (${pkg.version}) vs server.json (${server.version})`);
}

const serverPkgVersion = server.packages?.[0]?.version;
if (serverPkgVersion !== pkg.version) {
  fail(`Version mismatch: package.json (${pkg.version}) vs server.json.packages[0].version (${serverPkgVersion})`);
}

if (!changelog.includes(`## ${pkg.version} (`)) {
  fail(`CHANGELOG.md is missing a section for version ${pkg.version}`);
}

console.log(`\u2713 Release consistency checks passed for v${pkg.version}`);
