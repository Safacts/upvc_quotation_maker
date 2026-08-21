import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const source = resolve(
  valueAfter('--source') ??
    String.raw`C:\Users\aadi\Downloads\DOC-20260813-WA0014-1,DOC-20260813-WA0014-2\DOC-20260813-WA0014-1.svg`,
);
const output = resolve(
  valueAfter('--output') ??
    String.raw`C:\Users\aadi\Downloads\vaishnavi_design_generated.svg`,
);

const svg = await readFile(source, 'utf8');

if (!svg.trimStart().startsWith('<svg')) {
  throw new Error(`Not an SVG document: ${source}`);
}
if (!svg.includes('viewBox="0 0 594.95999 841.92"')) {
  throw new Error('Unexpected page geometry; refusing to change the final design.');
}
if (/<script\b|\son[a-z]+\s*=/i.test(svg)) {
  throw new Error('Unsafe executable SVG content detected.');
}

// Stage 1 is intentionally design-only. The supplied SVG is the canonical
// Vaishnavi visual template, so the generator preserves every path, glyph,
// colour and coordinate. Dynamic field replacement will be added only after
// Aadi approves this rendered design.
const generated = svg.replace(
  /(<svg\b[^>]*>)/,
  '$1\n<!-- Generated from the approved Vaishnavi client template; visual geometry preserved exactly. -->',
);

await writeFile(output, generated, 'utf8');
process.stdout.write(`${output}\n`);
