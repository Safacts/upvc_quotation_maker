import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || '7086815967';

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const clients = [
  {
    id: 'venkateshwara',
    name: 'Venkateshwara UPVC Quote',
    url: 'https://jqjxhhgfwdzckijnnede.supabase.co/storage/v1/object/public/app-releases/venkateshwara/upvc-quote.apk',
    filename: 'Venkateshwara-UPVC-Quote-v1.0.17-arm64-release.apk'
  },
  {
    id: 'eshanya_trade_links',
    name: 'Eeshanya Trade Links',
    url: 'https://jqjxhhgfwdzckijnnede.supabase.co/storage/v1/object/public/app-releases/eshanya_trade_links/upvc-quote.apk',
    filename: 'Eeshanya-Trade-Links-v1.0.17-arm64-release.apk'
  }
];

async function sendApk(client) {
  console.log(`Downloading APK for ${client.name} from ${client.url}...`);
  const res = await fetch(client.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch APK for ${client.name}: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`Downloaded ${client.name} APK (${buffer.length} bytes). Sending to Telegram...`);

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', `📦 *${client.name}* (v1.0.17 / Build 17)\n• Target: Android ARM64 (Release)\n• Permanent Vitharn Keystore Signed\n• Includes 2D CAD Elevation Engine & Quotation Fixes\n• Size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);
  formData.append('parse_mode', 'Markdown');
  formData.append('document', new Blob([buffer], { type: 'application/vnd.android.package-archive' }), client.filename);

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  const data = await tgRes.json();
  if (!data.ok) {
    throw new Error(`Telegram error for ${client.name}: ${JSON.stringify(data)}`);
  }
  console.log(`✅ Sent ${client.name} APK successfully! Telegram msg ID: ${data.result.message_id}`);
  return data.result;
}

async function main() {
  const results = [];
  for (const client of clients) {
    try {
      const res = await sendApk(client);
      results.push({ client: client.id, ok: true, msgId: res.message_id });
    } catch (e) {
      console.error(`❌ Error sending ${client.name}:`, e.message);
      results.push({ client: client.id, ok: false, error: e.message });
    }
  }
  console.log('Final results:', results);
}

main();
