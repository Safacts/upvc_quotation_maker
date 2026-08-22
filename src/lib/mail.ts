import nodemailer from "nodemailer";
import {
  EMAIL_TOKENS,
  emailShell,
  ep,
  epHtml,
  ebutton,
  efactBox,
  ecallout,
  echecklist,
} from "./email-template";

// Brevo SMTP relay (300 emails/day free tier). Migrated from Hostinger on
// 07-08-2026 so that ALL outbound mail carries the standalone Vitharn ERP
// Services identity, with no reference to any parent or partner company.
//
// Envelope sender: SMTP_USER is the Brevo relay login (b4c47f001@smtp-brevo.com)
// and is NOT the visible address. The visible From is SMTP_FROM, which must be a
// sender verified in the Brevo dashboard.
//
// SPELLING GOTCHA (07-08-2026): the real mailbox is "vitarn.dev@gmail.com" —
// NO 'h' — even though the company/brand is spelled "Vitharn ERP Services".
// Using vitharn.dev@gmail.com sends to a non-existent inbox and fails Brevo
// sender verification. Display name keeps the 'h'; the address never does.
export const MAIL_FROM_EMAIL = (process.env.SMTP_FROM || "vitarn.dev@gmail.com").trim();
export const MAIL_FROM_NAME = (process.env.SMTP_FROM_NAME || "Vitharn ERP Services").trim();
export const MAIL_FROM = `${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>`;

// Replies from clients should land in a human inbox, not the relay login.
export const MAIL_REPLY_TO = (process.env.SMTP_REPLY_TO || MAIL_FROM_EMAIL).trim();

export const ADMIN_EMAILS = ["kongaaadisheshu@gmail.com", "vitarn.dev@gmail.com", "pusalalaxmi41@gmail.com"];

// Singleton pooled transport. Creating a new nodemailer transport per send was
// the biggest source of email latency: every send re-did DNS + TCP + STARTTLS
// + SMTP handshake (~2-3s). With a module-level cached transport we reuse the
// same connection across sends within a serverless invocation, and `pool: true`
// keeps it warm for subsequent invocations on the same warm lambda.
let cachedTransporter: any = null;

function transporter() {
  // Live Brevo relay config (07-08-2026):
  //   SMTP_HOST = smtp-relay.brevo.com
  //   SMTP_PORT = 587            (STARTTLS; 465 would be implicit TLS)
  //   SMTP_USER = b4c47f001@smtp-brevo.com   <- relay login, NOT the From address
  //   SMTP_PASS = <Brevo SMTP key>           <- secret, env-only, never committed
  // SMTP_PASS is deliberately left without a default so a missing key fails loudly
  // instead of silently sending unauthenticated.
  const host = (process.env.SMTP_HOST || "smtp-relay.brevo.com").trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = (process.env.SMTP_USER || "b4c47f001@smtp-brevo.com").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  if (!host || !user || !pass) throw new Error("SMTP not configured");

  // Serverless DNS resolvers have historically failed to resolve the SMTP
  // hostname ("queryA EBADNAME smtp.hostinger.com"). When a static IP is
  // supplied we connect to it directly and keep the hostname purely for TLS SNI.
  //
  // GOTCHA (07-08-2026): the Hostinger-era SMTP_HOST_IP=172.65.255.143 was still
  // set in .env and on Vercel. Left as-is it would point the Brevo login at
  // Hostinger's server and every send would fail auth with a confusing error.
  // Brevo's relay resolves fine on serverless, so we IGNORE any pinned IP unless
  // it was explicitly set for the SAME host we're configured to talk to.
  let ip = (process.env.SMTP_HOST_IP || "").trim();
  if (ip && !host.includes("hostinger")) ip = "";

  const address = ip || host;
  const opts: any = {
    host: address,
    port,
    // Brevo uses STARTTLS on 587; 465 is implicit TLS.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    timeout: 30000,
    connectionTimeout: 30000,
    // Reuse pooled SMTP connections instead of opening one per email.
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  };
  if (ip) {
    opts.tls = { servername: host, rejectUnauthorized: true };
  }
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(opts);
  }
  return cachedTransporter;
}

export function slugify(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename?: string;
    content?: string | Buffer;
    cid?: string;
    contentType?: string;
  }>;
}): Promise<void> {
  const from = opts.from || MAIL_FROM;
  await transporter().sendMail({
    from,
    to: opts.to,
    replyTo: opts.replyTo || MAIL_REPLY_TO,
    subject: opts.subject,
    html: opts.html,
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
  });
}

export async function sendWelcomeEmail(opts: {
  cfg: Record<string, any>;
  clientId: string;
  email: string;
  tempPassword: string;
}): Promise<void> {
  const { cfg, clientId, email, tempPassword } = opts;
  const loginUrl = "https://app.vitharn.com/upvc/login";
  const resetUrl = `https://app.vitharn.com/upvc/login?action=reset&email=${encodeURIComponent(email)}`;
  const company = cfg.companyName || clientId;
  const appName = cfg.appName || "UPVC Quotation Maker";
  const marketUrl = "https://app.vitharn.com/upvc/" + slugify(company);
  const appUrl = "https://app.vitharn.com/upvc/" + slugify(appName);

  const body = `
    ${ep(`Welcome to <strong>${escapeHtml(appName)}</strong>! Your account has been created on the Vitharn UPVC Quotation Maker Portal.`)}
    ${ep(`You can sign in with this email using Google Sign-In, or with the temporary password below. We recommend changing your password after your first login.`)}
    ${efactBox([
      ["Login Email", email],
      ["Temporary Password", tempPassword],
    ])}
    ${ebutton("Open Your Portal", loginUrl)}
    ${epHtml(`<div style="text-align:center;margin-top:8px;color:${EMAIL_TOKENS.textMuted};font-size:13px;">or <a href="${resetUrl}" style="color:${EMAIL_TOKENS.rust};text-decoration:underline;">Reset Password</a></div>`)}
    ${epHtml(`Quick links: <a href="${marketUrl}" style="color:${EMAIL_TOKENS.rust};text-decoration:underline;">View your Market Page</a> &nbsp;|&nbsp; <a href="${appUrl}" style="color:${EMAIL_TOKENS.rust};text-decoration:underline;">Open Web App</a>`)}
  `;

  const html = emailShell({
    preheader: `Welcome to ${appName} — your login details inside`,
    eyebrow: "WELCOME ABOARD",
    heading: `Welcome, ${escapeHtml(company)}!`,
    body,
  });

  await sendMail({
    to: email,
    subject: `Welcome to ${appName} — Your Login Details`,
    html,
  });
}

export async function sendOtpEmail(recipient: string, otp: string): Promise<void> {
  const body = `
    ${ep(`We received a request to reset your password for the Vitharn UPVC Quotation Maker Portal.`)}
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:${EMAIL_TOKENS.paper};border:1px solid ${EMAIL_TOKENS.lineMid};border-radius:12px;padding:18px 36px;font-family:${EMAIL_TOKENS.font};">
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${EMAIL_TOKENS.ink};font-family:${EMAIL_TOKENS.font};">${escapeHtml(otp)}</div>
      </div>
    </div>
    ${ep(`Enter this code in the portal to reset your password. It expires in 15 minutes. If you didn't request this, you can safely ignore this email.`)}
  `;

  const html = emailShell({
    preheader: `Your password reset code: ${otp}`,
    eyebrow: "SECURITY CODE",
    heading: "Your password reset code",
    body,
  });

  await sendMail({
    from: MAIL_FROM,
    to: recipient,
    subject: "Your Password Reset OTP",
    html,
  });
}

export async function sendSignupNotification(
  kind: "new" | "submitted",
  opts: {
    email: string;
    name?: string;
    phone?: string;
    config?: Record<string, any>;
    submittedAt?: string;
  },
): Promise<void> {
  const { email, name, phone, config = {}, submittedAt } = opts;
  const label = name || email;

  const subject =
    kind === "new"
      ? `New signup request: ${label}`
      : `Signup profile submitted: ${label}`;

  const heading =
    kind === "new"
      ? "New Signup Request"
      : "Signup Profile Submitted";

  const intro =
    kind === "new"
      ? "A new UPVC business has registered via login on the Vitharn UPVC Quotation Maker Portal. Their full profile auto-saves as they type, so check the admin panel and follow up."
      : "A user has completed and submitted their company profile on the Vitharn UPVC Quotation Maker Portal and is awaiting review.";

  const configFields = ([
    ["Company Name", String(config.companyName ?? "")],
    ["Company Contact", String(config.companyContact ?? "")],
    ["Company Address", String(config.companyAddress ?? "")],
    ["GST Number", String(config.gstNumber ?? "")],
    ["City", String(config.city ?? "")],
    ["Business Type", String(config.businessType ?? "")],
  ] as Array<[string, string]>).filter(([, value]) => value !== "");

  const detailRows = ([
    ["Name", name || ""],
    ["Email", email],
    ["Phone", phone || ""],
    ["Submitted At", submittedAt || ""],
    ...configFields,
  ] as Array<[string, string]>).filter(([, value]) => value !== "");

  const note =
    kind === "new"
      ? "Their full profile auto-saves as they type. Please check the admin panel and follow up with this user."
      : "Please review this profile in the admin panel and create the client account when ready.";

  // Build a styled detail table using efactBox-style rows but as a full table for admin
  const t = EMAIL_TOKENS;
  const detailTable = detailRows
    .map(
      ([key, value]) => `
      <tr>
        <td style="padding:10px 0;color:${t.textMuted};font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;padding-right:18px;">${escapeHtml(key)}</td>
        <td style="padding:10px 0;color:${t.ink};font-size:13.5px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");

  const body = `
    ${ep(intro)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.paper};border:1px solid ${t.lineMid};border-radius:12px;padding:14px 20px;margin:20px 0;font-family:${t.font};">
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${t.font};">${detailTable}</table>
      </td></tr>
    </table>
    ${ep(note)}
  `;

  const html = emailShell({
    preheader: `${heading} — ${label}`,
    eyebrow: "ADMIN ALERT",
    heading,
    body,
  });

  await Promise.all(ADMIN_EMAILS.map((admin) => sendMail({ to: admin, subject, html })));
}

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(new RegExp("[&<>\"']", "g"), (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch] as string),
  );
}

export async function sendSignupConfirmation(opts: {
  email: string;
  name?: string;
  companyName?: string;
  submittedAt: string;
}): Promise<void> {
  const { email, name, companyName, submittedAt } = opts;
  const label = companyName || name || email;
  const loginUrl = "https://app.vitharn.com/upvc/login";
  const submittedText = submittedAt
    ? new Date(submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "";

  const body = `
    ${ep(`We received your UPVC business profile on the <strong>Vitharn UPVC Quotation Maker Portal</strong> on ${submittedText}.`)}
    ${ep(`Our team is now reviewing your details. Once approved, you will receive your login details by email and can start creating quotations right away.`)}
    ${efactBox([
      ["Registered Email", email],
      ...(companyName ? [["Company", companyName] as [string, string]] : []),
    ] as [string, string][])}
    ${ebutton("Check Request Status", loginUrl)}
    ${ep(`If you have questions, just reply to this email and our team will help you.`)}
  `;

  const html = emailShell({
    preheader: `We received your request — Vitharn UPVC`,
    eyebrow: "REQUEST RECEIVED",
    heading: `Thank you, ${escapeHtml(label)}!`,
    body,
  });

  await sendMail({
    to: email,
    subject: "We received your request — Vitharn UPVC",
    html,
  });
}

export async function sendAdminCompose(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const { to, subject, text } = opts;
  const paragraphs = String(text ?? "")
    .split(/\n{2,}/)
    .map(
      (p) =>
        epHtml(escapeHtml(p).replace(/\n/g, "<br/>")),
    )
    .join("");

  const body = `
    ${paragraphs}
  `;

  const html = emailShell({
    preheader: `Message from Vitharn ERP Services`,
    eyebrow: "MESSAGE FROM VITHARN",
    heading: "Hello",
    body,
  });

  await sendMail({ to, subject, html });
}

// ---------------------------------------------------------------------------
// 1. KICKOFF EMAIL — Welcome, meeting details, what to prepare.
// ---------------------------------------------------------------------------

export async function sendKickoffEmail(opts: {
  to: string;
  clientName: string;
  clientCompany?: string;
  meetingDate?: string;
  meetingTime?: string;
  meetingLink?: string;
  durationMinutes?: number;
}): Promise<void> {
  const {
    to,
    clientName,
    clientCompany,
    meetingDate,
    meetingTime,
    meetingLink,
    durationMinutes = 45,
  } = opts;

  const meetingDetails: [string, string][] = [];
  if (meetingDate) meetingDetails.push(["Date", meetingDate]);
  if (meetingTime) meetingDetails.push(["Time", `${meetingTime} (IST)`]);
  meetingDetails.push(["Duration", `Approximately ${durationMinutes} minutes`]);
  if (meetingLink) meetingDetails.push(["Meeting Link", meetingLink]);
  else meetingDetails.push(["Meeting Link", "Will be shared via WhatsApp or email prior to the call"]);

  const agendaItems = [
    "Introductions and team overview",
    "Understanding your UPVC operations and business goals",
    "Scope review: pricing structure, GST logic, and customisation",
    "Deployment timeline and immediate next steps",
  ];

  const prepareItems = [
    "Any existing quotation formats, pricing spreadsheets, or mockups you currently use",
    "A list of your required UPVC profiles, hardware items, and supplier margins",
    "Your official GST Number, bank details, and company logo for system configuration",
  ];

  const body = `
    ${ep(`Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},`)}
    ${ep(`Thank you for choosing Vitharn ERP Services as your technology partner. We are thrilled to get your UPVC quotation and ERP system up and running. Let us connect for a brief kickoff call to align on your requirements and plan the deployment.`)}
    ${efactBox(meetingDetails)}
    ${ep(`<strong>AGENDA</strong>`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_TOKENS.paper};border:1px solid ${EMAIL_TOKENS.lineMid};border-radius:12px;padding:14px 20px;margin:20px 0;font-family:${EMAIL_TOKENS.font};">
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${EMAIL_TOKENS.font};">
          ${agendaItems
            .map(
              (item, i) => `
              <tr>
                <td style="padding:8px 0;color:${EMAIL_TOKENS.textMuted};font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;padding-right:18px;">${String(i + 1).padStart(2, "0")}</td>
                <td style="padding:8px 0;color:${EMAIL_TOKENS.textBody};font-size:13.5px;font-weight:600;">${escapeHtml(item)}</td>
              </tr>`,
            )
            .join("")}
        </table>
      </td></tr>
    </table>
    ${echecklist(prepareItems)}
    ${ep(`If you have any questions before the call, simply reply to this email. We look forward to a productive conversation.`)}
    ${ep(`Warm regards,<br/><strong>Your Vitharn Architecture Team</strong>`)}
  `;

  const html = emailShell({
    preheader: `Your Vitharn Kickoff Call — Let Us Get Started`,
    eyebrow: "PROJECT KICKOFF",
    heading: "Let's Get Started",
    body,
  });

  await sendMail({
    to,
    subject: "Your Vitharn Kickoff Call — Let Us Get Started",
    html,
  });
}

// ---------------------------------------------------------------------------
// 2. THANK-YOU EMAIL — Instance ready, login details, support.
// ---------------------------------------------------------------------------

export async function sendThankYouEmail(opts: {
  to: string;
  clientName: string;
  clientCompany?: string;
  loginEmail?: string;
  loginUrl?: string;
  tempPassword?: string;
  marketPageUrl?: string;
  appName?: string;
}): Promise<void> {
  const {
    to,
    clientName,
    clientCompany,
    loginEmail,
    loginUrl = "https://app.vitharn.com/upvc/login",
    tempPassword,
    marketPageUrl,
    appName = "UPVC Quotation Maker",
  } = opts;

  const creds: [string, string][] = [];
  creds.push(["Portal", loginUrl]);
  if (loginEmail) creds.push(["Email", loginEmail]);
  if (tempPassword) creds.push(["Temporary Password", tempPassword]);
  if (marketPageUrl) creds.push(["Your Market Page", marketPageUrl]);

  const promiseItems = [
    "Zero-Error Quotes: High-quality mathematical accuracy with clear GST logic",
    "Speed: Instant PDF generation and WhatsApp integration for your customers",
    "Data Security: Absolute transparency and strict Row-Level Security for your pricing data",
    "Continuous Optimisation: As Vitharn grows, your ERP instance gets faster and smarter",
  ];

  const body = `
    ${ep(`Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},`)}
    ${ep(`Thank you so much for choosing <strong>Vitharn ERP Services</strong> as your technology partner. Your trust means a great deal to us. We are incredibly excited to automate your workflow, eliminate quotation errors, and help your UPVC manufacturing business scale without friction.`)}
    ${efactBox(creds)}
    ${ep(`You can sign in with your email using Google Sign-In, or with the credentials above. We strongly recommend changing your password after your first login.`)}
    ${ebutton("Open Your Portal", loginUrl)}
    ${marketPageUrl ? epHtml(`<div style="text-align:center;margin-top:8px;color:${EMAIL_TOKENS.textMuted};font-size:13px;"><a href="${marketPageUrl}" style="color:${EMAIL_TOKENS.rust};text-decoration:underline;">View Market Page</a></div>`) : ""}
    ${echecklist(promiseItems)}
    ${ep(`If you have any questions, we are just a WhatsApp message or email away. We will check in regularly to ensure everything is on track.`)}
    ${ep(`Warm regards,<br/><strong>Your Vitharn Architecture Team</strong>`)}
  `;

  const html = emailShell({
    preheader: `Your ${appName} Instance Is Ready — Login Inside`,
    eyebrow: "YOUR INSTANCE IS READY",
    heading: "Your Instance Is Ready",
    body,
  });

  await sendMail({
    to,
    subject: `Your ${appName} Instance Is Ready — Login Inside`,
    html,
  });
}

// ---------------------------------------------------------------------------
// 3. TRIAL EXPIRY EMAIL — Expires in X days, how to upgrade.
// ---------------------------------------------------------------------------

export async function sendTrialExpiryEmail(opts: {
  to: string;
  clientName: string;
  clientCompany?: string;
  daysRemaining: number;
  expiryDate?: string;
  upgradeUrl?: string;
  invoiceNumber?: string;
  amountDue?: string;
}): Promise<void> {
  const {
    to,
    clientName,
    clientCompany,
    daysRemaining,
    expiryDate,
    upgradeUrl = "https://app.vitharn.com/billing",
    invoiceNumber,
    amountDue,
  } = opts;

  const dayWord = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;

  const upgradeBenefits = [
    "Unlimited quotation generation with instant PDF export",
    "Full access to your UPVC pricing engine and GST logic",
    "WhatsApp integration for sharing quotes with customers",
    "Dedicated support from the Vitharn team",
  ];

  const body = `
    ${ep(`Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},`)}
    ${ep(`We hope you have been enjoying your experience with the <strong>Vitharn UPVC Quotation Maker Portal</strong>. This is a friendly reminder that your free trial period will expire in <strong style="color:${EMAIL_TOKENS.rust};">${dayWord}</strong>${expiryDate ? ` on <strong>${escapeHtml(expiryDate)}</strong>` : ""}.`)}
    ${ecallout("KEEP YOUR ACCESS ACTIVE", `To ensure uninterrupted service, please upgrade before your trial expires. Once upgraded, you will continue to enjoy:`)}
    ${echecklist(upgradeBenefits)}
    ${invoiceNumber ? ecallout("INVOICE READY", `Invoice: ${escapeHtml(invoiceNumber)}${amountDue ? ` &nbsp;|&nbsp; <strong>Amount Due:</strong> ${escapeHtml(amountDue)}` : ""}`) : ""}
    ${ebutton("Upgrade Now", upgradeUrl)}
    ${ep(`<strong>How to upgrade:</strong> Click the button above to proceed to billing, or simply reply to this email and our team will assist you with the payment. We accept UPI, bank transfer, and all major payment methods.`)}
    ${ep(`If you have any questions or need more time, just reply to this email. We are happy to help.`)}
    ${ep(`Warm regards,<br/><strong>Your Vitharn Architecture Team</strong>`)}
  `;

  const html = emailShell({
    preheader: `Your Vitharn Trial Expires in ${dayWord} — Upgrade to Keep Access`,
    eyebrow: "TRIAL UPDATE",
    heading: `Your Trial Expires in ${dayWord}`,
    body,
  });

  await sendMail({
    to,
    subject: `Your Vitharn Trial Expires in ${dayWord} — Upgrade to Keep Access`,
    html,
  });
}

// ---------------------------------------------------------------------------
// 4. INVOICE EMAIL — Professional billing, UPI payment, PDF attached.
// ---------------------------------------------------------------------------

export async function sendInvoiceEmail(opts: {
  to: string;
  clientName: string;
  clientCompany?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  paymentTerms?: string;
  /** Pre-built PDF bytes from buildInvoicePdf() — attached to the email. */
  pdfBytes?: Uint8Array | Buffer;
  pdfFilename?: string;
  /** Summary line items shown inline in the email body. */
  items?: Array<{ description: string; amount: number }>;
  subtotal: number;
  totalDue: number;
  upiId?: string;
  upiName?: string;
  notes?: string;
}): Promise<void> {
  const {
    to,
    clientName,
    clientCompany,
    invoiceNumber,
    invoiceDate,
    dueDate,
    paymentTerms = "Due on receipt",
    pdfBytes,
    pdfFilename,
    items,
    subtotal,
    totalDue,
    upiId,
    upiName,
    notes,
  } = opts;

  // Format INR for inline display (mirrors the PDF's inr() helper).
  const inr = (n: number): string => {
    const v = Number.isFinite(n) ? n : 0;
    const [whole, frac] = Math.abs(v).toFixed(2).split(".");
    let out: string;
    if (whole.length <= 3) {
      out = whole;
    } else {
      const last3 = whole.slice(-3);
      const rest = whole.slice(0, -3);
      out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
    }
    return `Rs. ${out}.${frac}`;
  };

  const itemsRows = (items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_TOKENS.lineSoft};color:${EMAIL_TOKENS.textBody};font-size:14px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(item.description)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_TOKENS.lineSoft};color:${EMAIL_TOKENS.ink};font-size:14px;font-weight:700;text-align:right;font-family:${EMAIL_TOKENS.font};">${inr(item.amount)}</td>
      </tr>`,
    )
    .join("");

  const attachments: Array<{
    filename?: string;
    content?: string | Buffer;
    contentType?: string;
  }> = [];

  if (pdfBytes) {
    attachments.push({
      filename: pdfFilename || `Vitharn-Invoice-${invoiceNumber}.pdf`,
      content: Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes),
      contentType: "application/pdf",
    });
  }

  const metaRows: [string, string][] = [
    ["Invoice No", invoiceNumber],
    ["Invoice Date", invoiceDate],
    ...(dueDate ? [["Due Date", dueDate] as [string, string]] : []),
    ["Payment Terms", paymentTerms],
  ];

  const body = `
    ${ep(`Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},`)}
    ${ep(`Thank you for trusting Vitharn ERP Services with your digital transformation. Please find your official invoice attached to this email. A summary is provided below for your reference.`)}
    ${efactBox(metaRows)}
    ${items && items.length > 0 ? `
      ${ep(`<strong>SERVICES RENDERED</strong>`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_TOKENS.paperWarm};border:1px solid ${EMAIL_TOKENS.lineSoft};border-radius:12px;overflow:hidden;margin:20px 0;font-family:${EMAIL_TOKENS.font};">
        <tr style="background:${EMAIL_TOKENS.paperWarm};">
          <th style="padding:10px 12px;text-align:left;color:${EMAIL_TOKENS.textMuted};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;font-family:${EMAIL_TOKENS.font};border-bottom:1px solid ${EMAIL_TOKENS.lineSoft};">Description</th>
          <th style="padding:10px 12px;text-align:right;color:${EMAIL_TOKENS.textMuted};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;font-family:${EMAIL_TOKENS.font};border-bottom:1px solid ${EMAIL_TOKENS.lineSoft};">Amount</th>
        </tr>
        ${itemsRows}
        <tr>
          <td colspan="2" style="border-top:2px solid ${EMAIL_TOKENS.rust};"></td>
        </tr>
        <tr>
          <td style="padding:10px 12px;text-align:right;color:${EMAIL_TOKENS.textMuted};font-size:14px;font-family:${EMAIL_TOKENS.font};border-top:1px solid ${EMAIL_TOKENS.lineSoft};">Subtotal</td>
          <td style="padding:10px 12px;text-align:right;color:${EMAIL_TOKENS.ink};font-size:14px;font-weight:700;font-family:${EMAIL_TOKENS.font};border-top:1px solid ${EMAIL_TOKENS.lineSoft};">${inr(subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;text-align:right;color:${EMAIL_TOKENS.textMuted};font-size:14px;font-family:${EMAIL_TOKENS.font};border-top:1px solid ${EMAIL_TOKENS.lineSoft};">GST</td>
          <td style="padding:10px 12px;text-align:right;color:${EMAIL_TOKENS.ink};font-size:14px;font-family:${EMAIL_TOKENS.font};border-top:1px solid ${EMAIL_TOKENS.lineSoft};">NIL</td>
        </tr>
        <tr>
          <td style="padding:12px 12px;text-align:right;color:${EMAIL_TOKENS.textMuted};font-size:16px;font-weight:700;font-family:${EMAIL_TOKENS.font};border-top:2px solid ${EMAIL_TOKENS.rust};">TOTAL DUE</td>
          <td style="padding:12px 12px;text-align:right;color:${EMAIL_TOKENS.rust};font-size:16px;font-weight:700;font-family:${EMAIL_TOKENS.font};border-top:2px solid ${EMAIL_TOKENS.rust};">${inr(totalDue)}</td>
        </tr>
      </table>
    ` : `
      ${ecallout("TOTAL DUE", inr(totalDue))}
    `}
    ${efactBox([
      ...(upiId ? [["UPI ID", upiId] as [string, string]] : []),
      ...(upiName ? [["Payee Name", upiName] as [string, string]] : []),
      ["Reference", invoiceNumber],
    ] as [string, string][])}
    ${ep(`Please quote the invoice number in the UPI remarks so we can match your payment.`)}
    ${notes ? ep(notes) : ""}
    ${ep(`A detailed PDF invoice is attached to this email for your records. To ensure uninterrupted service, please make your payment by the due date.`)}
    ${ep(`Warm regards,<br/><strong>Your Vitharn Architecture Team</strong>`)}
  `;

  const html = emailShell({
    preheader: `Invoice ${invoiceNumber} from Vitharn ERP Services — ${inr(totalDue)} Due`,
    eyebrow: "INVOICE",
    heading: `Official Invoice — ${escapeHtml(invoiceNumber)}`,
    body,
  });

  await sendMail({
    to,
    subject: `Invoice ${invoiceNumber} from Vitharn ERP Services — ${inr(totalDue)} Due`,
    html,
    ...(attachments.length ? { attachments } : {}),
  });
}