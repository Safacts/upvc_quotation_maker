import fs from "node:fs";
import path from "node:path";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!token || !chatId) {
  throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID are required");
}

const files = process.argv.slice(2);
if (!files.length || files.some((file) => !fs.existsSync(file))) {
  throw new Error("Pass existing APK paths as arguments");
}

for (const file of files) {
  if (!file.toLowerCase().includes("release") || file.toLowerCase().includes("debug")) {
    throw new Error(`Refusing non-release APK: ${file}`);
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", `Client release APK: ${path.basename(file)}`);
  form.append("document", new Blob([fs.readFileSync(file)]), path.basename(file));

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram delivery failed: ${result.description}`);
  console.log(`${path.basename(file)}: SENT message ${result.result.message_id}`);
}
