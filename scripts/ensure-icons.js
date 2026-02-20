import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const iconsDir = path.join(root, "src-tauri", "icons");
const icon32 = path.join(iconsDir, "32x32.png");

if (!fs.existsSync(icon32)) {
  console.log("Icons not found. Generating from app-icon.svg...");
  execSync("npx tauri icon app-icon.svg", {
    cwd: root,
    stdio: "inherit",
  });
}
