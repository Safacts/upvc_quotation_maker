/**
 * Throwaway benchmark: prove the PDF logo fix actually worked, against the REAL
 * production assets. Mirrors the harness described in
 * troubleshooting/pdf-logo-bloat-2026-08-09.md so the numbers are comparable.
 *
 * Run with:  npx tsx? -- no. We avoid a TS toolchain by re-implementing the two
 * image code paths (old vs new) directly against pdf-lib, which is exactly what
 * the original measurement harness did.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const KPR = "https://gumpmnbjdtzajhysnnaz.supabase.co/storage/v1/object/public/assets/logos/kprupvc.png";
const VENK = "https://gumpmnbjdtzajhysnnaz.supabase.co/storage/v1/object/public/assets/logos/venkateshwara.png";

const A4 = [595.28, 841.89];

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

function sniff(bytes) {
  const isPng =
    bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return isPng ? "png" : isJpg ? "jpg" : "unknown";
}

/** OLD behaviour: embedPng twice, swallow errors. */
async function buildOld(bytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let wm = null;
  let logo = null;
  try { wm = await doc.embedPng(bytes); } catch { /* ignore */ }
  try { logo = await doc.embedPng(bytes); } catch { /* ignore */ }
  if (wm) {
    const s = Math.min(A4[0] / wm.width, A4[1] / wm.height);
    page.drawImage(wm, {
      x: (A4[0] - wm.width * s) / 2, y: (A4[1] - wm.height * s) / 2,
      width: wm.width * s, height: wm.height * s, opacity: 0.06,
    });
  }
  if (logo) {
    const lh = 40;
    page.drawImage(logo, { x: 20, y: 760, width: (logo.width / logo.height) * lh, height: lh });
  }
  page.drawText("Quotation", { x: 30, y: 700, size: 12, font, color: rgb(0, 0, 0) });
  return { bytes: await doc.save(), drewLogo: !!logo, drewWatermark: !!wm };
}

/** NEW behaviour: sniff magic bytes, embed ONCE, reuse for both draws. */
async function buildNew(bytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const kind = sniff(bytes);
  let img = null;
  try {
    if (kind === "png") img = await doc.embedPng(bytes);
    else if (kind === "jpg") img = await doc.embedJpg(bytes);
  } catch (e) {
    console.error("   embed failed:", e.message);
  }
  const wm = img;
  const logo = img;
  if (wm) {
    const s = Math.min(A4[0] / wm.width, A4[1] / wm.height);
    page.drawImage(wm, {
      x: (A4[0] - wm.width * s) / 2, y: (A4[1] - wm.height * s) / 2,
      width: wm.width * s, height: wm.height * s, opacity: 0.06,
    });
  }
  if (logo) {
    const lh = 40;
    page.drawImage(logo, { x: 20, y: 760, width: (logo.width / logo.height) * lh, height: lh });
  }
  page.drawText("Quotation", { x: 30, y: 700, size: 12, font, color: rgb(0, 0, 0) });
  return { bytes: await doc.save(), drewLogo: !!logo, drewWatermark: !!wm };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

async function bench(label, bytes, fn) {
  const times = [];
  let out;
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    out = await fn(bytes);
    times.push(performance.now() - t);
  }
  console.log(
    `  ${label.padEnd(26)} median=${median(times).toFixed(0).padStart(5)} ms   ` +
      `pdf=${(out.bytes.length / 1048576).toFixed(2)} MB   ` +
      `logo=${out.drewLogo ? "YES" : "NO "}  watermark=${out.drewWatermark ? "YES" : "NO "}`,
  );
  return out;
}

for (const [name, url] of [["kprupvc", KPR], ["venkateshwara", VENK]]) {
  const bytes = await fetchBytes(url);
  console.log(
    `\n=== ${name}  ${bytes.length.toLocaleString()} bytes  actual format=${sniff(bytes)}`,
  );
  await bench("OLD (embed twice, PNG)", bytes, buildOld);
  await bench("NEW (sniff + embed once)", bytes, buildNew);
}

// Concurrency check: 4 users pressing "Download PDF" simultaneously.
const kpr = await fetchBytes(KPR);
const t = performance.now();
await Promise.all([buildNew(kpr), buildNew(kpr), buildNew(kpr), buildNew(kpr)]);
console.log(`\n4 concurrent NEW builds (kprupvc): ${(performance.now() - t).toFixed(0)} ms`);
console.log(`peak RSS: ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
