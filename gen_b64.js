const correct = `export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[ch] as string),
  );
}
`;
console.log(Buffer.from(correct).toString('base64'));