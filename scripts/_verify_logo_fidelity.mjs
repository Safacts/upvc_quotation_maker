/**
 * Throwaway: measure how much the palette quantisation actually degraded the
 * logo, at the size it is ACTUALLY DRAWN.
 *
 * Comparing the 512x512 palette output against the 2048x2048 original at full
 * resolution would be measuring the downscale, not the quantisation, and would
 * overstate the damage. The header logo renders at ~100x60 pt and the watermark
 * at 6% opacity, so the honest test is: render both through the same downscale
 * to the drawn size, then diff.
 */
import fs from "node:fs";
import sharp from "sharp";

const orig = fs.readFileSync("backups/logos/kprupvc.png.1786283379244.bak");
const resized = fs.readFileSync("backups/logos/kprupvc.png.resized-preview.png");

async function rmseAt(size) {
  const toRaw = (buf) =>
    sharp(buf)
      .resize(size, size, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

  const [a, b] = await Promise.all([toRaw(orig), toRaw(resized)]);
  let sum = 0;
  let maxDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
    if (Math.abs(d) > maxDiff) maxDiff = Math.abs(d);
  }
  const rmse = Math.sqrt(sum / a.length);
  return { rmse, maxDiff };
}

// 512 = the stored size. 100 = roughly the header draw size in points.
for (const size of [512, 100]) {
  const { rmse, maxDiff } = await rmseAt(size);
  console.log(
    `at ${size}x${size}:  RMSE=${rmse.toFixed(2)}/255 (${((rmse / 255) * 100).toFixed(2)}%)  ` +
      `maxChannelDiff=${maxDiff}`,
  );
}
