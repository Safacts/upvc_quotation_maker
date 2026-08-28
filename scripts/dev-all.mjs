import { spawn } from "node:child_process";
import process from "node:process";
import fs from "node:fs";

const cwd = process.cwd();
const children = [];

function start(name, cmd, args) {
  const child = spawn(cmd, args, { cwd, shell: true });
  child.stdout.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const c of children) {
    if (!c || !c.pid || c.killed) continue;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(c.pid), "/t", "/f"]);
      } else {
        c.kill("SIGTERM");
      }
    } catch {}
  }
  if (gateway) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(gateway.pid), "/t", "/f"]);
      } else {
        gateway.kill("SIGTERM");
      }
    } catch {}
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let gateway;
if (process.env.DEV_ALL_GATEWAY !== "0") {
  gateway = spawn("node", ["scripts/dev-gateway.mjs"], { cwd, shell: true });
  gateway.stdout.on("data", (d) => process.stdout.write(`[gateway] ${d}`));
  gateway.stderr.on("data", (d) => process.stderr.write(`[gateway] ${d}`));
  gateway.on("exit", (code) => {
    console.log(`[gateway] exited with code ${code}`);
    shutdown();
  });
  children.push(gateway);
}

start("next   ", "npm", ["run", "dev", "--", "-p", "3100"]);
// Local Flutter must target the same Supabase as Next (staging for devfix).
let dartDefines = [];
try {
  const envRaw = fs.readFileSync(".env", "utf8");
  const get = (k) => (envRaw.match(new RegExp(`^${k}=([^\r\n]+)`, "m")) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
  const stagingUrl = get("STAGING_SUPABASE_URL");
  const stagingKey = get("STAGING_SUPABASE_ANON_KEY");
  const prodUrl = get("SUPABASE_URL");
  const prodKey = get("SUPABASE_ANON_KEY");
  const url = stagingUrl || prodUrl;
  const key = stagingKey || prodKey;
  if (url && key) dartDefines = [`--dart-define=SUPABASE_URL=${url}`, `--dart-define=SUPABASE_ANON_KEY=${key}`];
} catch {}
start("flutter", "flutter", ["run", "-d", "web-server", "--web-port", "8080", "--web-hostname", "127.0.0.1", ...dartDefines]);

console.log("");
console.log("Gateway:  http://localhost:3000  (forwards to Next :3100 + Flutter :8080)");
console.log("Next.js:  http://localhost:3100  (direct, skip gateway)");
console.log("Flutter:  http://127.0.0.1:8080  (hot reload direct)");
console.log("Press Ctrl+C to stop all.");
console.log("");
