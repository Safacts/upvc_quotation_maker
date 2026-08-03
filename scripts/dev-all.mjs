import { spawn } from "node:child_process";
import process from "node:process";

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
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("next   ", "npm", ["run", "dev"]);
start("flutter", "flutter", ["run", "-d", "web-server", "--web-port", "8080", "--web-hostname", "127.0.0.1"]);

console.log("");
console.log("Next.js:  http://localhost:3000");
console.log("Flutter:  http://127.0.0.1:8080 (open via http://localhost:3000/app or /upvc/<client>)");
console.log("Press Ctrl+C to stop both.");
console.log("");
