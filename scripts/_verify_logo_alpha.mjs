/**
 * Throwaway: is the original logo's alpha channel actually LOAD-BEARING?
 *
 * sharp reported hasAlpha=true on the 2048x2048 original and hasAlpha=false on
 * the 512x512 palette output. That is only safe if the original's alpha channel
 * is fully opaque everywhere (i.e. the channel exists but carries no
 * information). If it has real transparency, flattening it paints the
 * background colour across the whole 6%-opacity full-page watermark.
 */
import fs from "node:fs";
import sharp from "sharp";

const orig = fs.readFileSync("backups/logos/kprupvc.png.1786283379244.bak");
const resized = fs.readFileSync("backups/logos/kprupvc.png.resized-preview.png");

for (const [label, buf] of [["ORIGINAL", orig], ["RESIZED ", resized]]) {
  const img = sharp(buf);
  const meta = await img.metadata();
  const stats = await img.stats();
  console.log(`\n=== ${label}  ${meta.width}x${meta.height} channels=${meta.channels} hasAlpha=${meta.hasAlpha}`);
  stats.channels.forEach((c, i) => {
    const names = meta.hasAlpha ? ["R", "G", "B", "A"] : ["R", "G", "B"];
    console.log(
      `  ch${i}(${names[i] ?? i})  min=${c.min}  max=${c.max}  mean=${c.mean.toFixed(2)}`,
    );
  });

  // Corner + centre sampling of the raw RGBA.
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const o = (y * info.width + x) * info.channels;
    return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  };
  const w = info.width - 1;
  const h = info.height - 1;
  console.log(
    `  corners TL=${px(0, 0)} TR=${px(w, 0)} BL=${px(0, h)} BR=${px(w, h)} ` +
      `centre=${px(info.width >> 1, info.height >> 1)}`,
  );

  // How many pixels are actually transparent?
  let transparent = 0;
  let semi = 0;
  for (let o = 3; o < data.length; o += info.channels) {
    if (data[o] === 0) transparent++;
    else if (data[o] < 255) semi++;
  }
  const total = info.width * info.height;
  console.log(
    `  fully transparent: ${transparent} / ${total} (${((transparent / total) * 100).toFixed(1)}%)   ` +
      `semi: ${semi}`,
  );
}
