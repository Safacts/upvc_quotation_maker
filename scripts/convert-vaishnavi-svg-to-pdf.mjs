import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const source = resolve(arg("--source", String.raw`C:\Users\aadi\Downloads\KPRUPVC-07082026-0153-Vaishnavi-Injected.svg`));
const source2 = arg("--source2");
const output = resolve(arg("--output", String.raw`C:\Users\aadi\Downloads\KPRUPVC-07082026-0153-Vaishnavi-Vector.pdf`));
const chrome = arg("--chrome", process.env.CHROME_PATH || String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`);
const pageWidth = "594.96pt";
const pageHeight = "841.92pt";

const sources = [source, ...(source2 ? [resolve(source2)] : [])];
for (const file of sources) await readFile(file);

const work = await mkdtemp(resolve(tmpdir(), "vaishnavi-svg-pdf-"));
const htmlPath = resolve(work, "document.html");
const profile = resolve(work, "chrome-profile");
const pages = sources.map((file) => `<section class="page"><img src="${pathToFileURL(file).href}" /></section>`).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${pageWidth} ${pageHeight}; margin: 0; }
html, body { margin: 0; padding: 0; width: ${pageWidth}; background: white; }
.page { width: ${pageWidth}; height: ${pageHeight}; break-after: page; overflow: hidden; }
.page:last-child { break-after: auto; }
.page img { display: block; width: 100%; height: 100%; }
</style></head><body>${pages}</body></html>`;
await writeFile(htmlPath, html, "utf8");

const result = spawnSync(chrome, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
  `--user-data-dir=${profile}`, "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
  `--print-to-pdf=${output}`, pathToFileURL(htmlPath).href,
], { encoding: "utf8", windowsHide: true });

await rm(work, { recursive: true, force: true });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
console.log(output);
