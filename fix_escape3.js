const fs = require('fs');
const p = 'src/lib/mail.ts';
let c = fs.readFileSync(p, 'utf8');
const i = c.indexOf('export function escapeHtml');
const j = c.indexOf('export async function sendSignupConfirmation');

// Build the correct function using a template with placeholders
const template = `export function escapeHtml(s: string): string {
  return String(s ?? "").replace(new RegExp("[&<>\\"']", "g"), (ch) =>
    ({ "&": "@@AMP@@", "<": "@@LT@@", ">": "@@GT@@", "@@DQ@@": "@@QUOT@@", "'": "@@APOS@@" }[ch] as string),
  );
}

`;

const newFunc = template
  .replace('@@AMP@@', '&' + 'amp;')
  .replace('@@LT@@', '&' + 'lt;')
  .replace('@@GT@@', '&' + 'gt;')
  .replace('@@QUOT@@', '&' + 'quot;')
  .replace('@@APOS@@', '&#' + '39;')
  .replace('@@DQ@@', '\\"');

const out = c.slice(0, i) + newFunc + c.slice(j);
fs.writeFileSync(p, out);
console.log('Fixed');
console.log('newFunc:', newFunc);