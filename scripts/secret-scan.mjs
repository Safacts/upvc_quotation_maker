import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const staged = args.includes("--staged");
const rangeIndex = args.indexOf("--range");
const range = rangeIndex >= 0 ? args[rangeIndex + 1] : undefined;
const files = range
  ? execFileSync("git", ["diff", "--name-only", range + "...HEAD"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean)
  : staged
    ? execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean)
    : execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);

const ignored = /(^|[\\/])(?:node_modules|\.git|\.next|build|dist|coverage|public[\\/]app)(?:[\\/]|$)|\.(?:png|jpe?g|gif|webp|apk|pdf|woff2?|ttf|dill|wasm)$/i;
// Reviewed-and-accepted findings (false positives). Keep this list SHORT and
// always note WHY, so real leaks can't hide behind it.
const allowlist = {
  // URI is built from process.env at runtime — no literal password.
  "run_foundation_migration.py": ["database URI password"],
  // Test fixtures only (hash fixtures, fake logins) — no live credentials.
  "tests/portal-auth.test.ts": ["credential assignment"],
  // Fake HMAC secret for token-derivation tests ("bugsy-test-quote-token-secret").
  "tests/api-quotation.test.ts": ["credential assignment"],
  // PUBLIC anon key baked for client bundles (role=anon, RLS is the boundary).
  "src/lib/supabase-public.ts": ["JWT"],
  // PUBLIC anon key baked for the Flutter client bundle (role=anon, RLS is the boundary).
  "lib/config/client_config.dart": ["JWT"],
  // Test-only fake Google credential strings; no live credential is used.
  "tests/auth_flows.test.ts": ["credential assignment"],
};
const patterns = [
  { name: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: "database URI password", re: /(?:postgres(?:ql)?|mysql):\/\/[^\s:@]+:[^\s@]+@/i },
  { name: "credential assignment", re: /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"'\n]{8,}["']/i },
];
const findings = [];
for (const file of files) {
  if (ignored.test(file)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      const allowed = allowlist[file]?.includes(pattern.name) || false;
      if (!allowed) findings.push(file + ": " + pattern.name);
    }
  }
}
if (findings.length) {
  console.error("Secret scan failed:");
  for (const finding of findings) console.error("- " + finding);
  process.exit(1);
}
console.log("Secret scan passed (" + files.length + " tracked candidate files).");
