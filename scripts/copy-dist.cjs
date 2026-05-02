const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electronOnly = process.argv.includes("--electron-only");

const copyTargets = [
  {
    from: path.join(root, "dist"),
    to: path.join(root, "public", "dist"),
    label: "electron build output",
  },
];

if (!electronOnly) {
  copyTargets.push({
    from: path.join(root, "frontend", "dist"),
    to: path.join(root, "public", "frontend", "dist"),
    label: "frontend build output",
  });
}

function assertDirectory(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Missing ${label}: ${dir}. Run the build step before copying artifacts.`);
  }
}

function copyDirectory(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

try {
  for (const target of copyTargets) {
    assertDirectory(target.from, target.label);
    copyDirectory(target.from, target.to);
  }

  const copiedPaths = copyTargets.map(target => path.relative(root, target.to)).join(" and ");
  console.log(`Build artifacts copied to ${copiedPaths}.`);
} catch (error) {
  console.error(`copy-dist failed: ${error.message}`);
  process.exit(1);
}
