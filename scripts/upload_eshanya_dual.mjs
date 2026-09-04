import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:\\Projects\\myprojects\\flutterprojects\\upvc_quotation_maker\\.env' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing supabase env'); process.exit(1); }
const supa = createClient(url, key);

async function upload(local, bucketPath) {
  const buf = fs.readFileSync(local);
  const { error } = await supa.storage.from('assets').upload(bucketPath, buf, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) console.error('upload fail', bucketPath, error);
  else console.log('uploaded', bucketPath, buf.length);
  const { data } = supa.storage.from('assets').getPublicUrl(bucketPath);
  console.log('public', data.publicUrl);
  return data.publicUrl;
}

(async () => {
  const luftungLocal = 'C:\\Users\\aadi\\Downloads\\eeshanya client\\WhatsApp Image 2026-09-02 at 3.11.23 PM.jpeg';
  const eshanyaNewLocal = 'C:\\Users\\aadi\\Downloads\\eeshanya client\\WhatsApp Image 2026-09-02 at 3.12.33 PM.jpeg';
  const dualLocal = 'C:\\Users\\aadi\\Downloads\\eeshanya client\\WhatsApp Image 2026-09-02 at 3.12.12 PM.jpeg';
  const luftungUrl = await upload(luftungLocal, 'logos/luftung.jpg');
  const eshanyaUrl = await upload(eshanyaNewLocal, 'logos/eshanya_trade_links.jpg');
  const dualUrl = await upload(dualLocal, 'logos/eshanya_luftung_bill.jpg');
  // also upload as invoice-top
  await upload(dualLocal, 'logos/eshanya_trade_links-invoice-top.jpg');
  console.log(JSON.stringify({ luftungUrl, eshanyaUrl, dualUrl }, null, 2));
})();
