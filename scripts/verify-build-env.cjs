const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scope = process.argv.slice(2).find(arg => arg !== "--") || "all";

const checks = {
  electron: [
    {
      path: path.join(root, "node_modules"),
      stage: "build:electron",
      label: "root dependencies",
      fix: "Run pnpm install in the project root.",
    },
    {
      path: path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),
      stage: "build:electron",
      label: "Electron TypeScript compiler",
      fix: "Run pnpm install in the project root.",
    },
  ],
  frontend: [
    {
      path: path.join(root, "frontend", "node_modules"),
      stage: "build:frontend",
      label: "frontend dependencies",
      fix: "Run pnpm --dir frontend install.",
    },
    {
      path: path.join(root, "frontend", "node_modules", ".bin", process.platform === "win32" ? "vue-tsc.cmd" : "vue-tsc"),
      stage: "build:frontend",
      label: "frontend Vue TypeScript compiler",
      fix: "Run pnpm --dir frontend install.",
    },
  ],
};

const scopes =
  scope === "all" ? ["electron", "frontend"] : Object.prototype.hasOwnProperty.call(checks, scope) ? [scope] : [];

if (scopes.length === 0) {
  console.error(`Build environment check failed: unknown stage "${scope}".`);
  process.exit(1);
}

const missing = scopes.flatMap(name => checks[name]).filter(check => !fs.existsSync(check.path));

if (missing.length > 0) {
  console.error("Build environment check failed:");
  for (const check of missing) {
    console.error(`- Stage ${check.stage}: missing ${check.label}: ${check.path}`);
    console.error(`  ${check.fix}`);
  }
  process.exit(1);
}

console.log(`Build environment check passed for ${scopes.join(", ")}.`);
