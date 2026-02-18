// Build script: compiles TypeScript and adds shebang to CLI entry point
import { execSync } from "child_process";
import { readFileSync, writeFileSync, chmodSync, rmSync } from "fs";

// 0. Clean dist directory
rmSync("dist", { recursive: true, force: true });

// 1. Run tsc
console.log("Compiling TypeScript...");
execSync("npx tsc", { stdio: "inherit" });

// 2. Add shebang to dist/index.js
const entryPoint = "dist/index.js";
const content = readFileSync(entryPoint, "utf-8");
if (!content.startsWith("#!")) {
  writeFileSync(entryPoint, "#!/usr/bin/env node\n" + content);
}

// 3. Make executable
chmodSync(entryPoint, "755");

console.log("Build complete.");
