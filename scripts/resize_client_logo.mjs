/**
 * resize_client_logo.mjs — right-size an oversized tenant logo in Supabase Storage.
 *
 * WHY THIS EXISTS (09-08-2026, Nexy)
 * ----------------------------------
 * `kprupvc.png` was a 4,665,338-byte 2048x2048 PNG that `quotation-pdf.ts` draws
 * at ~100x60 pt. Every PDF request decoded and embedded the whole thing (twice —
 * see the double-embedPng fix in that file), which measured at 3,926 ms and a
 * 4.41 MB PDF. A right-sized asset measured at 5 ms / 0.09 MB: 785x faster,
 * 49x smaller. See troubleshooting/pdf-logo-bloat-2026-08-09.md.
 *
 * WHAT IT DOES
 *   1. Downloads the current asset and reports its real dimensions/bytes.
 *   2. Downscales to fit MAX_EDGE (default 512) preserving aspect ratio, never
 *      UPscaling a logo that is already small (`withoutEnlargement`).
 *   3. Re-encodes as PNG, stepping the palette down until it fits MAX_BYTES.
 *   4. Writes a local `.bak` of the original, then PUTs the new bytes over the
 *      same object key so `clients.config.logoUrl` needs no change at all.
 *
 * WHY IT KEEPS PNG (and does not switch to JPEG)
 *   The logo is drawn as a full-page watermark at 6% opacity AND as a header
 *   image. A JPEG has no alpha channel, so a transparent-background logo would
 *   render as a black or white box over the whole page. PNG-8 with a quantised
 *   palette gets us under 100 KB while keeping transparency.
 *
 * USAGE
 *   node scripts/resize_client_logo.mjs kprupvc.png          # dry run, reports only
 *   node scripts/resize_client_logo.mjs kprupvc.png --apply  # actually re-uploads
 *
 * The dry run is the default ON PURPOSE: this overwrites a live client-facing
 * asset. Always eyeball the reported before/after numbers first.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAX_EDGE = 512;
const MAX_BYTES = 100 * 1024;

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const k = trimmed.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = trimmed.slice(i + 1).trim();
  }
}
loadEnv(".env.local");
loadEnv(".env");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  process.exit(1);
}

const name = process.argv[2];
const apply = process.argv.includes("--apply");
if (!name) {
  console.error("usage: node scripts/resize_client_logo.mjs <filename.png> [--apply]");
  process.exit(1);
}

const objectKey = `logos/${name}`;
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/assets/${objectKey}`;
const writeUrl = `${SUPABASE_URL}/storage/v1/object/assets/${objectKey}`;

// ---------------------------------------------------------------------------
// 1. download
// ---------------------------------------------------------------------------
console.log(`GET  ${publicUrl}`);
const res = await fetch(publicUrl);
if (!res.ok) {
  console.error(`FATAL: download failed HTTP ${res.status}`);
  process.exit(1);
}
const original = Buffer.from(await res.arrayBuffer());
const meta = await sharp(original).metadata();

console.log(
  `BEFORE  ${original.length.toLocaleString()} bytes  ${meta.width}x${meta.height}  ` +
    `format=${meta.format}  alpha=${!!meta.hasAlpha}`,
);

// ---------------------------------------------------------------------------
// 2 + 3. downscale, then quantise until it fits
// ---------------------------------------------------------------------------
let out = null;
let usedColors = null;

for (const colors of [256, 128, 64, 32, 16]) {
  const candidate = await sharp(original)
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ palette: true, colors, compressionLevel: 9, effort: 10 })
    .toBuffer();
  console.log(`  try palette=${colors} -> ${candidate.length.toLocaleString()} bytes`);
  if (!out || candidate.length < out.length) {
    out = candidate;
    usedColors = colors;
  }
  if (candidate.length <= MAX_BYTES) {
    out = candidate;
    usedColors = colors;
    break;
  }
}

const outMeta = await sharp(out).metadata();
console.log(
  `AFTER   ${out.length.toLocaleString()} bytes  ${outMeta.width}x${outMeta.height}  ` +
    `format=${outMeta.format}  palette=${usedColors}  alpha=${!!outMeta.hasAlpha}`,
);
console.log(
  `SAVING  ${(original.length / out.length).toFixed(1)}x smaller  ` +
    `(${((1 - out.length / original.length) * 100).toFixed(1)}% reduction)`,
);

if (out.length > MAX_BYTES) {
  console.warn(`WARN: still above the ${MAX_BYTES} byte target.`);
}

// ---------------------------------------------------------------------------
// 4. back up + upload
// ---------------------------------------------------------------------------
const backupDir = path.join("backups", "logos");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `${name}.${Date.now()}.bak`);
fs.writeFileSync(backupPath, original);
console.log(`BACKUP  ${backupPath}`);

const previewPath = path.join(backupDir, `${name}.resized-preview.png`);
fs.writeFileSync(previewPath, out);
console.log(`PREVIEW ${previewPath}  <-- open this and confirm it still looks right`);

if (!apply) {
  console.log("\nDRY RUN — nothing uploaded. Re-run with --apply to overwrite the live asset.");
  process.exit(0);
}

const put = await fetch(writeUrl, {
  method: "PUT",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
  },
  body: out,
});
if (!put.ok) {
  console.error(`FATAL: upload failed HTTP ${put.status}: ${(await put.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`UPLOADED ${writeUrl}`);

// Verify by re-downloading — never trust the write's own 200.
const verify = await fetch(publicUrl + "?v=" + Date.now());
const verifyBytes = Buffer.from(await verify.arrayBuffer());
const verifyMeta = await sharp(verifyBytes).metadata();
console.log(
  `VERIFY  HTTP ${verify.status}  ${verifyBytes.length.toLocaleString()} bytes  ` +
    `${verifyMeta.width}x${verifyMeta.height}  format=${verifyMeta.format}`,
);
if (verifyBytes.length !== out.length) {
  console.error("FATAL: served bytes do not match uploaded bytes.");
  process.exit(1);
}
console.log("OK");
