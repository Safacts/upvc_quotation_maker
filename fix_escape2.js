const fs = require('fs');
const p = 'src/lib/mail.ts';
let c = fs.readFileSync(p, 'utf8');
const i = c.indexOf('export function escapeHtml');
const j = c.indexOf('export async function sendSignupConfirmation');

// Build the correct function with proper HTML entity strings
const amp = '&' + 'amp;';
const lt = '&' + 'lt;';
const gt = '&' + 'gt;';
const quot = '&' + 'quot;';
const apos = '&#' + '39;';

const lines = [];
lines.push('export function escapeHtml(s: string): string {');
lines.push('  return String(s ?? "").replace(new RegExp("[&<>\\"\\'']", "g"), (ch) =>');
lines.push('    ({ "&": "' + amp + '", "<": "' + lt + '", ">": "' + gt + '", "\\"": "' + quot + '", "\\'": "' + apos + '" }[ch] as string),');
lines.push('  );');
lines.push('}');
lines.push('');

const newFunc = lines.join('\n');

const out = c.slice(0, i) + newFunc + '\n' + c.slice(j);
fs.writeFileSync(p, out);
console.log('Fixed');
console.log('newFunc:', newFunc);