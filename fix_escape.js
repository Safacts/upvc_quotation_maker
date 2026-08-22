const fs = require('fs');
const p = 'src/lib/mail.ts';
let c = fs.readFileSync(p, 'utf8');
const i = c.indexOf('export function escapeHtml');
const j = c.indexOf('export async function sendSignupConfirmation');
const newFunc = 'export function escapeHtml(s: string): string {\n  return String(s ?? "").replace(/[&<>"'']/g, (ch) =>\n    ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[ch] as string),\n  );\n}\n\n';
const out = c.slice(0, i) + newFunc + c.slice(j);
fs.writeFileSync(p, out);
console.log('Fixed');