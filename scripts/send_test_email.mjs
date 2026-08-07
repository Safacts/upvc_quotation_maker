// Vitharn SMTP diagnostic — proves the Brevo relay end-to-end from the CLI.
//
// Usage:
//   node scripts/send_test_email.mjs <to> [envFile]
//
// envFile defaults to ".env". Because the local .env may still hold the
// SMTP_PASS placeholder, you can point this at a production env pulled with:
//   npx vercel env pull <file> --environment=production --yes
//
// This mirrors the transport rules in src/lib/mail.ts exactly (STARTTLS on 587,
// trimmed creds, and the pinned-IP guard) so a PASS here means the app will
// send too. Keep the two in sync if mail.ts changes.

import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

const to = process.argv[2];
const envFile = process.argv[3] || ".env";

if (!to || !to.includes("@")) {
  console.error("Usage: node scripts/send_test_email.mjs <to> [envFile]");
  process.exit(1);
}

const envPath = path.resolve(envFile);
if (!fs.existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}
dotenv.config({ path: envPath });

const host = (process.env.SMTP_HOST || "smtp-relay.brevo.com").trim();
const port = Number(process.env.SMTP_PORT || "587");
const user = (process.env.SMTP_USER || "b4c47f001@smtp-brevo.com").trim();
const pass = (process.env.SMTP_PASS || "").trim();

// Mailbox is "vitarn.dev@gmail.com" — NO 'h'. The brand name keeps the 'h',
// the address never does. See src/lib/mail.ts.
const fromEmail = (process.env.SMTP_FROM || "vitarn.dev@gmail.com").trim();
const fromName = (process.env.SMTP_FROM_NAME || "Vitharn ERP Services").trim();
const from = `${fromName} <${fromEmail}>`;
const replyTo = (process.env.SMTP_REPLY_TO || fromEmail).trim();

if (!pass || pass.startsWith("PASTE")) {
  console.error(`FAIL: SMTP_PASS missing or still a placeholder in ${envPath}`);
  process.exit(1);
}

// Ignore a stale pinned IP unless it was set for a Hostinger host (see mail.ts).
let ip = (process.env.SMTP_HOST_IP || "").trim();
if (ip && !host.includes("hostinger")) ip = "";

const ORANGE = {
  darkHex: "#7C2D12",
  mainHex: "#EA580C",
  lightHex: "#FFEDD5",
  paperHex: "#FFF7ED",
  inkHex: "#1F2937",
  mutedHex: "#6B7280",
  lineHex: "#E5E7EB",
};

const sentAt = new Date().toISOString();

const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${ORANGE.lineHex};">
      <div style="background:${ORANGE.mainHex};padding:22px 28px;">
        <div style="color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">VITHARN ERP SERVICES</div>
        <div style="color:${ORANGE.lightHex};font-size:12px;margin-top:3px;">Quotation &amp; ERP software for UPVC fabricators</div>
      </div>
      <div style="padding:28px;">
        <h2 style="color:${ORANGE.darkHex};margin:0 0 16px 0;font-size:20px;">Vitharn email is working</h2>
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 14px 0;">
          This is a test message from <strong>Vitharn ERP Services</strong>. If you can read this,
          outbound email over the Brevo SMTP relay is correctly configured.
        </p>
        <div style="background:${ORANGE.paperHex};border:1px solid ${ORANGE.lightHex};border-radius:8px;padding:14px 18px;margin:18px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:7px 0;color:${ORANGE.mutedHex};font-size:13px;">Relay</td>
              <td style="padding:7px 0;color:${ORANGE.inkHex};font-size:13px;font-weight:bold;text-align:right;">${host}:${port}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:${ORANGE.mutedHex};font-size:13px;">From</td>
              <td style="padding:7px 0;color:${ORANGE.inkHex};font-size:13px;font-weight:bold;text-align:right;">${fromEmail}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:${ORANGE.mutedHex};font-size:13px;">Sent at</td>
              <td style="padding:7px 0;color:${ORANGE.inkHex};font-size:13px;font-weight:bold;text-align:right;">${sentAt}</td>
            </tr>
          </table>
        </div>
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">&mdash; Team Vitharn</p>
      </div>
      <div style="border-top:3px solid ${ORANGE.mainHex};background:${ORANGE.paperHex};padding:18px 28px;">
        <div style="color:${ORANGE.inkHex};font-size:13px;font-weight:bold;">Vitharn ERP Services</div>
        <div style="color:${ORANGE.mutedHex};font-size:12px;margin-top:4px;">
          <a href="mailto:${fromEmail}" style="color:${ORANGE.mainHex};text-decoration:none;">${fromEmail}</a>
          &nbsp;|&nbsp;
          <a href="https://app.vitharn.com" style="color:${ORANGE.mainHex};text-decoration:none;">https://app.vitharn.com</a>
        </div>
      </div>
    </div>
  </body>
</html>`;

const opts = {
  host: ip || host,
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user, pass },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
};
if (ip) opts.tls = { servername: host, rejectUnauthorized: true };

console.log(`env      : ${envPath}`);
console.log(`relay    : ${opts.host}:${port} (secure=${opts.secure}, requireTLS=${opts.requireTLS})`);
console.log(`login    : ${user}`);
console.log(`from     : ${from}`);
console.log(`to       : ${to}`);

const transporter = nodemailer.createTransport(opts);

try {
  await transporter.verify();
  console.log("verify   : OK (connection + auth accepted)");

  const info = await transporter.sendMail({
    from,
    to,
    replyTo,
    subject: "Vitharn ERP Services \u2014 Test Email",
    html,
    text:
      "Vitharn email is working. This is a test message from Vitharn ERP Services. " +
      `Relay ${host}:${port}, from ${fromEmail}, sent at ${sentAt}.`,
  });

  console.log("messageId:", info.messageId);
  console.log("response :", info.response);
  console.log("accepted :", JSON.stringify(info.accepted));
  console.log("rejected :", JSON.stringify(info.rejected));
  console.log(info.rejected?.length ? "RESULT   : FAIL (recipient rejected)" : "RESULT   : SENT");
  process.exit(info.rejected?.length ? 1 : 0);
} catch (e) {
  console.error("RESULT   : FAIL");
  console.error("error    :", e?.message ?? e);
  if (e?.code) console.error("code     :", e.code);
  if (e?.responseCode) console.error("smtpCode :", e.responseCode);
  if (e?.response) console.error("smtpResp :", e.response);
  process.exit(1);
}
