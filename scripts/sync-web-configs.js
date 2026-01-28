const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "configs");
const targetDir = path.join(rootDir, "apps", "web", "configs");

if (!fs.existsSync(sourceDir)) {
  console.error("configs directory not found:", sourceDir);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(targetDir)) {
  const fullPath = path.join(targetDir, entry);
  if (fs.statSync(fullPath).isFile()) {
    fs.unlinkSync(fullPath);
  }
}

for (const entry of fs.readdirSync(sourceDir)) {
  const fullPath = path.join(sourceDir, entry);
  const targetPath = path.join(targetDir, entry);
  if (fs.statSync(fullPath).isFile()) {
    fs.copyFileSync(fullPath, targetPath);
  }
}

console.log(`Synced configs to ${targetDir}`);
