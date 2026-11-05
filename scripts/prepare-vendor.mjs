import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "node_modules/@splidejs/splide");
const destination = path.join(root, "assets/vendor/splide");
await mkdir(destination, { recursive: true });
await Promise.all(
  [
    ["dist/js/splide.min.js", "splide.min.js"],
    ["dist/js/splide.min.js.map", "splide.min.js.map"],
    ["dist/css/splide.min.css", "splide.min.css"],
    ["LICENSE", "LICENSE"],
  ].map(([input, output]) =>
    copyFile(path.join(source, input), path.join(destination, output)),
  ),
);
