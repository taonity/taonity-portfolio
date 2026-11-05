import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.resolve(
  process.argv[2] || path.join(root, "../sinair-llm-bot/screenshots"),
);
const project = process.argv[3] || "sinair-llm-bot";
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project))
  throw new Error(
    "Use a project slug containing lowercase letters, numbers, and hyphens",
  );
const manifest = JSON.parse(
  await readFile(path.join(source, "manifest.json"), "utf8"),
);
if (manifest.status !== "passed" || !manifest.images?.length)
  throw new Error("Only successful, nonempty screenshot captures can be imported");
const order = [
  "messages",
  "pipelines",
  "pipeline-details",
  "llm-payloads",
  "outbound",
  "summaries",
  "config",
  "config-persona",
  "admin",
  "events",
  "about",
];
const labels = {
  "pipeline-details": "Pipeline details",
  "config-persona": "Persona",
  "llm-payloads": "LLM JSON",
  config: "Configuration",
};
const screens = {
  project,
  viewports: manifest.viewports || {
    desktop: { width: 1440, height: 1000 },
    phone: { width: 390, height: 844 },
  },
  scenes: {
    light: { desktop: [], phone: [] },
    dark: { desktop: [], phone: [] },
  },
};

for (const image of manifest.images) {
  if (!["desktop", "phone"].includes(image.format))
    throw new Error(`Unsupported format: ${image.format}`);
  if (!/^[a-z0-9-]+$/.test(image.scene))
    throw new Error("Invalid screenshot scene");
  const theme = image.theme || "light";
  if (!["light", "dark"].includes(theme))
    throw new Error(`Unsupported theme: ${theme}`);
  const input = path.resolve(source, image.file);
  const relative = path.relative(source, input);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Screenshot path must stay within its source directory");
  const bytes = await readFile(input);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error(`Expected a PNG: ${image.file}`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const pixelRatio = image.pixelRatio || 1;
  const src = `assets/projects/${project}/${theme}/${image.format}/${image.scene}.png`;
  const destination = path.join(root, src);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(input, destination);
  const cssWidth = image.cssWidth || width / pixelRatio;
  const previews = [];
  for (const previewWidth of [cssWidth, cssWidth * 2].map(Math.round)) {
    if (previewWidth >= width) continue;
    const previewSrc = src.replace(/\.png$/, `@${previewWidth}.png`);
    const info = await sharp(bytes)
      .resize({ width: previewWidth, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(path.join(root, previewSrc));
    previews.push({ src: previewSrc, width: info.width, height: info.height });
  }
  screens.scenes[theme][image.format].push({
    id: image.scene,
    label:
      labels[image.scene] ||
      image.scene[0].toUpperCase() + image.scene.slice(1),
    src,
    width,
    height,
    cssWidth,
    cssHeight: image.cssHeight || height / pixelRatio,
    pixelRatio,
    previews,
  });
}
for (const theme of ["light", "dark"]) {
  for (const format of ["desktop", "phone"]) {
    if (!screens.scenes[theme][format].length)
      throw new Error(`No ${theme} ${format} screenshots found`);
    screens.scenes[theme][format].sort(
      (a, b) =>
        (order.indexOf(a.id) < 0 ? 99 : order.indexOf(a.id)) -
        (order.indexOf(b.id) < 0 ? 99 : order.indexOf(b.id)),
    );
  }
}
await mkdir(path.join(root, "data/screenshots"), { recursive: true });
await writeFile(
  path.join(root, `data/screenshots/${project}.json`),
  JSON.stringify(screens, null, 2) + "\n",
);
console.log(`Imported ${manifest.images.length} screenshots for ${project}`);
