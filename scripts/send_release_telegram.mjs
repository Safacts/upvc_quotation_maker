import { readFileSync } from "fs";

const TOKEN = "7790745552:AAGVmXZLXm5MMoWfSG5i2YJBGBY4lU80qzM";
const mdPath = "public/upvc/changelog/whatsapp-2026-08.md";

const raw = readFileSync(mdPath, "utf8");
const lines = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => !l.startsWith("#") && !l.startsWith(">") && l.length > 0);
const msg = lines.join("\n");

const chats = [
  ["Madhan", "8141124947"],
  ["Aadi", "1295597987"],
];

for (const [name, id] of chats) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text: msg }),
  });
  const j = await res.json();
  console.log(
    `${name} (${id}): ${j.ok ? "SENT msg#" + j.result.message_id : "FAILED " + JSON.stringify(j)}`
  );
}
