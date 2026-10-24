/**
 * Stages the deployable static site in _site/.
 * Used by the GitHub Pages workflow and for local previews.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "_site");

const rootFiles = ["index.html", "styles.css", "app.js", "export.js", "favicon.svg"];
const directories = ["data", "assets"];

await fs.rm(site, { recursive: true, force: true });
await fs.mkdir(site, { recursive: true });

for (const file of rootFiles) {
  await fs.copyFile(path.join(root, file), path.join(site, file));
}

for (const directory of directories) {
  await fs.cp(path.join(root, directory), path.join(site, directory), { recursive: true });
}

// Keep GitHub Pages from running Jekyll over the generated site.
await fs.writeFile(path.join(site, ".nojekyll"), "");

let files = 0;
let bytes = 0;
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else {
      files += 1;
      bytes += (await fs.stat(full)).size;
    }
  }
}
await walk(site);

console.log(`Staged ${files} files (${(bytes / 1024 / 1024).toFixed(1)} MiB) in _site/.`);
console.log("Preview under a subpath (like a GitHub project site):");
console.log("  python3 -m http.server 8080");
console.log("  open http://localhost:8080/_site/");
