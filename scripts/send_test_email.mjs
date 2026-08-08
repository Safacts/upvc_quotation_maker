import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI: node scripts/send_test_email.mjs <to> [envFile]
//   to       = recipient email address (required)
//   envFile  = path to env file (default: <repo-root>/.env)
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const to = args[0];
if (!to || !to.includes('@')) {
  console.error('Usage: node scripts/send_test_email.mjs <to> [envFile]');
  console.error('  to       = recipient email address');
  console.error('  envFile  = path to env file (default: .env in repo root)');
  process.exit(1);
}

const envFile = args[1] ? resolve(args[1]) : resolve(__dirname, '..', '.env');

// Load env file manually (no dotenv dep needed for a diagnostic script)
try {
  const raw = readFileSync(envFile, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
} catch (e: any) {
  console.error(`Failed to read env file ${envFile}: ${e.message}`);
  process.exit(1);
}

// Mirror mail.ts transporter() EXACTLY — keep in sync if mail.ts changes
const host = (process.env.SMTP_HOST || 'smtp-relay.brevo.com').trim();
const port = Number(process.env.SMTP_PORT || '587');
const user = (process.env.SMTP_USER || 'b4c47f001@smtp-brevo.com').trim();
const pass = (process.env.SMTP_PASS || '').trim();

// Guard: refuse placeholder / missing key before wasting a send
if (!pass) {
  console.error('SMTP_PASS is missing — add it to your env file.');
  process.exit(1);
}
if (pass.startsWith('PASTE')) {
  console.error('SMTP_PASS is a placeholder — paste the real Brevo key.');
  process.exit(1);
}

// Same ignore-stale-pinned-IP guard as mail.ts
let ip = (process.env.SMTP_HOST_IP || '').trim();
if (ip && !host.includes('hostinger')) ip = '';

const address = ip || host;
const fromEmail = (process.env.SMTP_FROM || 'vitarn.dev@gmail.com').trim();
const fromName = (process.env.SMTP_FROM_NAME || 'Vitharn ERP Services').trim();
const from = `${fromName} <${fromEmail}>`;

const opts: any = {
  host: address,
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user, pass },
  timeout: 30000,
  connectionTimeout: 30000,
};
if (ip) {
  opts.tls = { servername: host, rejectUnauthorized: true };
}

const transporter = nodemailer.createTransport(opts);

async function run() {
  console.log(`SMTP config: ${host}:${port} (connect address: ${address})`);
  console.log(`Auth user: ${user}`);
  console.log(`From: ${from}`);
  console.log(`To: ${to}`);

  try {
    await transporter.verify();
    console.log('✅ SMTP verify() passed — credentials accepted by Brevo.');
  } catch (e: any) {
    console.error('❌ SMTP verify() FAILED:', e.message);
    if (e.code === 'EAUTH') {
      console.error('   → 535/534 auth error: SMTP_PASS is wrong or Brevo sender not verified.');
    }
    process.exit(1);
  }

  try {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Vitharn ERP Services — Test Email ✅',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: #EA580C; padding: 20px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Vitharn ERP Services</h1>
          </div>
          <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e3a5f; margin-top: 0;">Email System Live ✅</h2>
            <p style="color: #334155; font-size: 16px; line-height: 1.6;">
              This confirms that Vitharn ERP Services email system is fully operational.
            </p>
            <p style="color: #334155; font-size: 16px; line-height: 1.6;">
              <strong>From:</strong> ${fromEmail}<br>
              <strong>Provider:</strong> Brevo SMTP<br>
              <strong>Date:</strong> ${now}
            </p>
            <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 15px; border-radius: 8px; margin-top: 20px;">
              <p style="color: #166534; margin: 0; font-size: 14px;">
                ✅ All systems operational. Ready to send invoices and onboarding emails.
              </p>
            </div>
          </div>
          <p style="color: #94A3B8; font-size: 12px; text-align: center; margin-top: 20px;">
            © 2026 Vitharn ERP Services | ${fromEmail}
          </p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Accepted:', info.accepted);
    console.log('   Rejected:', info.rejected);
  } catch (e: any) {
    console.error('❌ Send failed:', e.message);
    process.exit(1);
  }
}

run();
