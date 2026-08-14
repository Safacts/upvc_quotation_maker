import { deflateSync } from "node:zlib";

/**
 * Deterministic in-process PNG placeholder generator (truecolor RGB, 8-bit).
 *
 * This exists because there is no real raytracing backend yet: every render
 * record in the `renders` table points at a URL that must resolve to an image.
 * Instead of 404ing, we generate a small branded placeholder on the fly — the
 * POST render route renders it synchronously (that is the "render"), and the
 * GET serving route regenerates the same bytes on demand.
 *
 * No external PNG library is required: the encoder below writes the PNG
 * signature, IHDR/IDAT/IEND chunks and CRCs by hand, using node's zlib for the
 * single deflate step.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** FNV-1a — stable string hash, used to derive a deterministic color per render. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Standard HSV -> RGB. h: 0..360, s/v: 0..1. Returns 0..255 triples. */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

/**
 * Build a placeholder PNG of the requested size. `seed` (e.g. the render's
 * `clientId/designId/type`) deterministically tints the background so
 * different renders are visually distinguishable. Sizes are clamped to
 * [1, 4096] to bound memory use.
 */
export function placeholderPng(width: number, height: number, seed = ""): Buffer {
  const w = Math.max(1, Math.min(4096, Math.floor(width) || 1));
  const h = Math.max(1, Math.min(4096, Math.floor(height) || 1));

  const seedN = fnv1a(seed);
  const hue = seedN % 360;
  const [bgR, bgG, bgB] = hsvToRgb(hue, 0.08, 0.97);
  const [bdR, bdG, bdB] = hsvToRgb((hue + 18) % 360, 0.55, 0.55);

  const border = Math.max(2, Math.min(24, Math.round(Math.min(w, h) * 0.04)));

  const rowLen = 1 + w * 3;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0; // filter: none
    const edgeY = y < border || y >= h - border;
    for (let x = 0; x < w; x++) {
      const idx = rowStart + 1 + x * 3;
      if (edgeY || x < border || x >= w - border) {
        raw[idx] = bdR;
        raw[idx + 1] = bdG;
        raw[idx + 2] = bdB;
      } else {
        raw[idx] = bgR;
        raw[idx + 1] = bgG;
        raw[idx + 2] = bgB;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
