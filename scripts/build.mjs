import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

await import("./prepare-vendor.mjs");

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of [
  "index.html",
  "styles.css",
  "app.js",
  "theme.js",
  "projects",
  "data",
  "assets",
])
  await cp(path.join(root, name), path.join(dist, name), { recursive: true });
await writeFile(path.join(dist, ".nojekyll"), "");
const projects = JSON.parse(
  await readFile(path.join(root, "data/projects.json"), "utf8"),
);
console.log(
  `Built static portfolio with ${projects.length} project${projects.length === 1 ? "" : "s"} in dist/`,
);
