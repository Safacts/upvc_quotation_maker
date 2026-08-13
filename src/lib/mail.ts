import nodemailer from "nodemailer";

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
  const loginUrl = "https://app.vitharn.com/login";
  const resetUrl = `https://app.vitharn.com/login?action=reset&email=${encodeURIComponent(email)}`;
  const company = cfg.companyName || clientId;
  const appName = cfg.appName || "UPVC Quotation Maker";
  const marketUrl = "https://app.vitharn.com/upvc/" + slugify(company);
  const appUrl = "https://app.vitharn.com/upvc/" + slugify(appName);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #1E3A5F; margin-top: 0;">Welcome, ${company}!</h2>
      <p style="color: #475569; font-size: 16px;">Your account for <strong>${appName}</strong> has been created on the Vitharn UPVC Quotation Maker Portal.</p>
      <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 6px 0;"><strong>Login Email:</strong> ${email}</p>
        <p style="margin: 6px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
      </div>
      <p style="color: #475569; font-size: 15px;">You can sign in with this email using Google Sign-In, or with the temporary password above. We recommend changing your password after your first login.</p>
      <p style="margin: 24px 0; text-align: center;">
        <a href="${loginUrl}" style="background: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Open Portal</a>
        <a href="${resetUrl}" style="background: #f1f5f9; color: #1E3A5F; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-left: 8px;">Reset Password</a>
      </p>
      <p style="color: #64748b; font-size: 14px;">Quick links for easy access:</p>
      <p style="margin: 8px 0;">
        <a href="${marketUrl}" style="color: #6366f1;">View your Market Page</a> &nbsp;|&nbsp;
        <a href="${appUrl}" style="color: #6366f1;">Open Web App</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">If you didn't expect this email, you can safely ignore it.</p>
    </div>
  `;

  await sendMail({
    to: email,
    subject: `Welcome to ${appName} — Your Login Details`,
    html,
  });
}

export async function sendOtpEmail(recipient: string, otp: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; text-align: center; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #1E3A5F;">Password Reset Request</h2>
      <p style="color: #475569; font-size: 16px;">We received a request to reset your password for the Vitharn UPVC Quotation Maker Portal.</p>
      <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1E3A5F;">
        ${otp}
      </div>
      <p style="color: #64748b; font-size: 14px;">Enter this code in the portal to reset your password. It expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

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

  const detailTable = detailRows
    .map(
      ([key, value]) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px; white-space: nowrap; vertical-align: top;">${key}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #1E3A5F; font-size: 14px; font-weight: bold; vertical-align: top;">${value}</td>
      </tr>`,
    )
    .join("");

  const note =
    kind === "new"
      ? "Their full profile auto-saves as they type. Please check the admin panel and follow up with this user."
      : "Please review this profile in the admin panel and create the client account when ready.";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #1E3A5F; margin-top: 0;">${heading}</h2>
      <p style="color: #475569; font-size: 16px;">${intro}</p>
      <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">${detailTable}</table>
      </div>
      <p style="color: #475569; font-size: 15px;">${note}</p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This is an automated notification sent by the Vitharn UPVC Quotation Maker Portal.</p>
    </div>
  `;

  await Promise.all(ADMIN_EMAILS.map((admin) => sendMail({ to: admin, subject, html })));
}

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string),
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
  const loginUrl = "https://app.vitharn.com/login";
  const submittedText = submittedAt
    ? new Date(submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #1E3A5F; margin-top: 0;">Thank you, ${escapeHtml(label)}!</h2>
      <p style="color: #475569; font-size: 16px;">We received your UPVC business profile on the <strong>Vitharn UPVC Quotation Maker Portal</strong> on ${submittedText}.</p>
      <p style="color: #475569; font-size: 16px;">Our team is now reviewing your details. Once approved, you will receive your login details by email and can start creating quotations right away.</p>
      <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 6px 0;"><strong>Registered Email:</strong> ${escapeHtml(email)}</p>
        ${companyName ? `<p style="margin: 6px 0;"><strong>Company:</strong> ${escapeHtml(companyName)}</p>` : ""}
      </div>
      <p style="margin: 24px 0; text-align: center;">
        <a href="${loginUrl}" style="background: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Check Request Status</a>
      </p>
      <p style="color: #64748b; font-size: 14px;">If you have questions, just reply to this email and our team will help you.</p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This is an automated message from the Vitharn UPVC Quotation Maker Portal.</p>
    </div>
  `;

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
        `<p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 14px 0;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      ${paragraphs}
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Sent by the Vitharn UPVC Quotation Maker Portal team.</p>
    </div>
  `;

  await sendMail({ to, subject, html });
}

// ---------------------------------------------------------------------------
// UNSUBSCRIBE FOOTER — appended to every transactional email below.
// Replace VITHARN_UNSUBSCRIBE_URL with a real one-pointing-unsub endpoint
// (e.g. a Vercel route) before going to production.
// ---------------------------------------------------------------------------

const UNSUBSCRIBE_URL =
  process.env.VITHARN_UNSUBSCRIBE_URL || "https://app.vitharn.com/unsubscribe";

/** Shared footer block closing every client-facing email. */
function emailFooter(): string {
  return `
    <div style="max-width: 600px; margin: auto; padding: 18px 30px 10px 30px; border-top: 1px solid #E5E7EB; margin-top: 28px;">
      <p style="color: #6B7280; font-size: 12px; line-height: 1.6; margin: 0 0 6px 0; font-family: Arial, sans-serif;">
        Vitharn ERP Services &nbsp;|&nbsp; ${MAIL_FROM_EMAIL} &nbsp;|&nbsp; <a href="https://app.vitharn.com" style="color: #EA580C;">app.vitharn.com</a>
      </p>
      <p style="color: #9CA3AF; font-size: 11px; line-height: 1.5; margin: 0; font-family: Arial, sans-serif;">
        You are receiving this email because you are a registered client of Vitharn ERP Services.
        <a href="${UNSUBSCRIBE_URL}" style="color: #EA580C;">Unsubscribe</a> from non-transactional emails at any time.
      </p>
    </div>
  `;
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

  const meetingDetailsRows: string[] = [];
  if (meetingDate) {
    meetingDetailsRows.push(`<p style="margin: 4px 0;"><strong>Date:</strong> ${escapeHtml(meetingDate)}</p>`);
  }
  if (meetingTime) {
    meetingDetailsRows.push(`<p style="margin: 4px 0;"><strong>Time:</strong> ${escapeHtml(meetingTime)} (IST)</p>`);
  }
  meetingDetailsRows.push(`<p style="margin: 4px 0;"><strong>Duration:</strong> Approximately ${durationMinutes} minutes</p>`);
  if (meetingLink) {
    meetingDetailsRows.push(`<p style="margin: 4px 0;"><strong>Meeting Link:</strong> <a href="${escapeHtml(meetingLink)}" style="color: #EA580C;">${escapeHtml(meetingLink)}</a></p>`);
  } else {
    meetingDetailsRows.push(`<p style="margin: 4px 0;"><strong>Meeting Link:</strong> Will be shared via WhatsApp or email prior to the call</p>`);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #FFF7ED; border-radius: 12px; overflow: hidden;">
      <!-- Header band -->
      <div style="background: #EA580C; padding: 28px 30px;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-family: Arial, sans-serif;">Vitharn ERP Services</h1>
        <p style="color: #FFEDD5; font-size: 14px; margin: 6px 0 0 0; font-family: Arial, sans-serif;">Project Kickoff Call</p>
      </div>

      <!-- Body -->
      <div style="padding: 28px 30px 10px 30px;">
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},
        </p>
        <p style="color: #4B5563; font-size: 15px; line-height: 1.7; margin: 0 0 18px 0; font-family: Arial, sans-serif;">
          Thank you for choosing Vitharn ERP Services as your technology partner. We are thrilled to get your UPVC quotation and ERP system up and running. Let us connect for a brief kickoff call to align on your requirements and plan the deployment.
        </p>

        <!-- Meeting details card -->
        <div style="background-color: #ffffff; border: 1px solid #E5E7EB; border-left: 4px solid #EA580C; border-radius: 8px; padding: 20px; margin: 18px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #EA580C; font-weight: bold; font-family: Arial, sans-serif;">MEETING DETAILS</p>
          ${meetingDetailsRows.join("")}
        </div>

        <!-- Agenda -->
        <p style="color: #1F2937; font-size: 15px; font-weight: bold; margin: 22px 0 10px 0; font-family: Arial, sans-serif;">AGENDA</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
          <tr>
            <td style="padding: 6px 8px; background: #FFF7ED; color: #7C2D12; font-weight: bold; font-size: 13px; width: 32px; font-family: Arial, sans-serif;">01</td>
            <td style="padding: 6px 8px; color: #4B5563; font-size: 14px; font-family: Arial, sans-serif;">Introductions and team overview</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #FFF7ED; color: #7C2D12; font-weight: bold; font-size: 13px; font-family: Arial, sans-serif;">02</td>
            <td style="padding: 6px 8px; color: #4B5563; font-size: 14px; font-family: Arial, sans-serif;">Understanding your UPVC operations and business goals</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #FFF7ED; color: #7C2D12; font-weight: bold; font-size: 13px; font-family: Arial, sans-serif;">03</td>
            <td style="padding: 6px 8px; color: #4B5563; font-size: 14px; font-family: Arial, sans-serif;">Scope review: pricing structure, GST logic, and customisation</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #FFF7ED; color: #7C2D12; font-weight: bold; font-size: 13px; font-family: Arial, sans-serif;">04</td>
            <td style="padding: 6px 8px; color: #4B5563; font-size: 14px; font-family: Arial, sans-serif;">Deployment timeline and immediate next steps</td>
          </tr>
        </table>

        <!-- What to prepare -->
        <p style="color: #1F2937; font-size: 15px; font-weight: bold; margin: 22px 0 10px 0; font-family: Arial, sans-serif;">WHAT TO PREPARE</p>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.7; margin: 0 0 8px 0; font-family: Arial, sans-serif;">
          To make the most of our time together, please have the following ready:
        </p>
        <ul style="color: #4B5563; font-size: 14px; line-height: 1.8; margin: 0 0 18px 0; padding-left: 20px; font-family: Arial, sans-serif;">
          <li>Any existing quotation formats, pricing spreadsheets, or mockups you currently use</li>
          <li>A list of your required UPVC profiles, hardware items, and supplier margins</li>
          <li>Your official GST Number, bank details, and company logo for system configuration</li>
        </ul>

        <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          If you have any questions before the call, simply reply to this email. We look forward to a productive conversation.
        </p>

        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 18px 0 0 0; font-family: Arial, sans-serif;">
          Warm regards,<br/>
          <strong>Your Vitharn Architecture Team</strong>
        </p>
      </div>

      ${emailFooter()}
    </div>
  `;

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
    loginUrl = "https://app.vitharn.com/login",
    tempPassword,
    marketPageUrl,
    appName = "UPVC Quotation Maker",
  } = opts;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #FFF7ED; border-radius: 12px; overflow: hidden;">
      <!-- Header band -->
      <div style="background: #EA580C; padding: 28px 30px;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-family: Arial, sans-serif;">Vitharn ERP Services</h1>
        <p style="color: #FFEDD5; font-size: 14px; margin: 6px 0 0 0; font-family: Arial, sans-serif;">Your Instance Is Ready</p>
      </div>

      <!-- Body -->
      <div style="padding: 28px 30px 10px 30px;">
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},
        </p>
        <p style="color: #4B5563; font-size: 15px; line-height: 1.7; margin: 0 0 18px 0; font-family: Arial, sans-serif;">
          Thank you so much for choosing <strong>Vitharn ERP Services</strong> as your technology partner. Your trust means a great deal to us. We are incredibly excited to automate your workflow, eliminate quotation errors, and help your UPVC manufacturing business scale without friction.
        </p>

        <!-- Login credentials card -->
        <div style="background-color: #ffffff; border: 1px solid #E5E7EB; border-left: 4px solid #EA580C; border-radius: 8px; padding: 20px; margin: 18px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #EA580C; font-weight: bold; font-family: Arial, sans-serif;">YOUR LOGIN DETAILS</p>
          <p style="margin: 4px 0;"><strong>Portal:</strong> <a href="${escapeHtml(loginUrl)}" style="color: #EA580C;">${escapeHtml(loginUrl)}</a></p>
          ${loginEmail ? `<p style="margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(loginEmail)}</p>` : ""}
          ${tempPassword ? `<p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${escapeHtml(tempPassword)}</p>` : ""}
          ${marketPageUrl ? `<p style="margin: 4px 0;"><strong>Your Market Page:</strong> <a href="${escapeHtml(marketPageUrl)}" style="color: #EA580C;">${escapeHtml(marketPageUrl)}</a></p>` : ""}
        </div>

        <p style="color: #4B5563; font-size: 15px; line-height: 1.7; margin: 0 0 18px 0; font-family: Arial, sans-serif;">
          You can sign in with your email using Google Sign-In, or with the credentials above. We strongly recommend changing your password after your first login.
        </p>

        <!-- CTA buttons -->
        <p style="margin: 22px 0; text-align: center;">
          <a href="${escapeHtml(loginUrl)}" style="background: #EA580C; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px;">Open Your Portal</a>
          ${marketPageUrl ? `<a href="${escapeHtml(marketPageUrl)}" style="background: #FFF7ED; color: #7C2D12; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px; margin-left: 8px; border: 1px solid #FB923C;">View Market Page</a>` : ""}
        </p>

        <!-- Our promise -->
        <p style="color: #1F2937; font-size: 15px; font-weight: bold; margin: 22px 0 10px 0; font-family: Arial, sans-serif;">OUR PROMISE TO YOU</p>
        <ul style="color: #4B5563; font-size: 14px; line-height: 1.8; margin: 0 0 18px 0; padding-left: 20px; font-family: Arial, sans-serif;">
          <li><strong>Zero-Error Quotes:</strong> High-quality mathematical accuracy with clear GST logic</li>
          <li><strong>Speed:</strong> Instant PDF generation and WhatsApp integration for your customers</li>
          <li><strong>Data Security:</strong> Absolute transparency and strict Row-Level Security for your pricing data</li>
          <li><strong>Continuous Optimisation:</strong> As Vitharn grows, your ERP instance gets faster and smarter</li>
        </ul>

        <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          If you have any questions, we are just a WhatsApp message or email away. We will check in regularly to ensure everything is on track.
        </p>

        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 18px 0 0 0; font-family: Arial, sans-serif;">
          Warm regards,<br/>
          <strong>Your Vitharn Architecture Team</strong>
        </p>
      </div>

      ${emailFooter()}
    </div>
  `;

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

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #FFF7ED; border-radius: 12px; overflow: hidden;">
      <!-- Header band -->
      <div style="background: #EA580C; padding: 28px 30px;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-family: Arial, sans-serif;">Vitharn ERP Services</h1>
        <p style="color: #FFEDD5; font-size: 14px; margin: 6px 0 0 0; font-family: Arial, sans-serif;">Your Trial Expires in ${dayWord}</p>
      </div>

      <!-- Body -->
      <div style="padding: 28px 30px 10px 30px;">
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},
        </p>
        <p style="color: #4B5563; font-size: 15px; line-height: 1.7; margin: 0 0 18px 0; font-family: Arial, sans-serif;">
          We hope you have been enjoying your experience with the <strong>Vitharn UPVC Quotation Maker Portal</strong>. This is a friendly reminder that your free trial period will expire in <strong style="color: #EA580C;">${dayWord}</strong>${expiryDate ? ` on <strong>${escapeHtml(expiryDate)}</strong>` : ""}.
        </p>

        <!-- Urgency card -->
        <div style="background-color: #ffffff; border: 1px solid #E5E7EB; border-left: 4px solid #EA580C; border-radius: 8px; padding: 20px; margin: 18px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #EA580C; font-weight: bold; font-family: Arial, sans-serif;">KEEP YOUR ACCESS ACTIVE</p>
          <p style="color: #4B5563; font-size: 14px; line-height: 1.7; margin: 0 0 10px 0; font-family: Arial, sans-serif;">
            To ensure uninterrupted service, please upgrade before your trial expires. Once upgraded, you will continue to enjoy:
          </p>
          <ul style="color: #4B5563; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px; font-family: Arial, sans-serif;">
            <li>Unlimited quotation generation with instant PDF export</li>
            <li>Full access to your UPVC pricing engine and GST logic</li>
            <li>WhatsApp integration for sharing quotes with customers</li>
            <li>Dedicated support from the Vitharn team</li>
          </ul>
        </div>

        <!-- Invoice details (if provided) -->
        ${invoiceNumber ? `
        <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
          <p style="margin: 0; color: #92400E; font-size: 14px; font-family: Arial, sans-serif;">
            <strong>Invoice:</strong> ${escapeHtml(invoiceNumber)}${amountDue ? ` &nbsp;|&nbsp; <strong>Amount Due:</strong> ${escapeHtml(amountDue)}` : ""}
          </p>
        </div>` : ""}

        <!-- CTA -->
        <p style="margin: 22px 0; text-align: center;">
          <a href="${escapeHtml(upgradeUrl)}" style="background: #EA580C; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px;">Upgrade Now</a>
        </p>

        <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          <strong>How to upgrade:</strong> Click the button above to proceed to billing, or simply reply to this email and our team will assist you with the payment. We accept UPI, bank transfer, and all major payment methods.
        </p>

        <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          If you have any questions or need more time, just reply to this email. We are happy to help.
        </p>

        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 18px 0 0 0; font-family: Arial, sans-serif;">
          Warm regards,<br/>
          <strong>Your Vitharn Architecture Team</strong>
        </p>
      </div>

      ${emailFooter()}
    </div>
  `;

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
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #4B5563; font-size: 14px; font-family: Arial, sans-serif;">${escapeHtml(item.description)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #1F2937; font-size: 14px; font-weight: bold; text-align: right; font-family: Arial, sans-serif;">${inr(item.amount)}</td>
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

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #FFF7ED; border-radius: 12px; overflow: hidden;">
      <!-- Header band -->
      <div style="background: #EA580C; padding: 28px 30px;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-family: Arial, sans-serif;">Vitharn ERP Services</h1>
        <p style="color: #FFEDD5; font-size: 14px; margin: 6px 0 0 0; font-family: Arial, sans-serif;">Official Invoice &mdash; ${escapeHtml(invoiceNumber)}</p>
      </div>

      <!-- Body -->
      <div style="padding: 28px 30px 10px 30px;">
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          Dear <strong>${escapeHtml(clientName)}</strong>${clientCompany ? `, <strong>${escapeHtml(clientCompany)}</strong>` : ""},
        </p>
        <p style="color: #4B5563; font-size: 15px; line-height: 1.7; margin: 0 0 18px 0; font-family: Arial, sans-serif;">
          Thank you for trusting Vitharn ERP Services with your digital transformation. Please find your official invoice attached to this email. A summary is provided below for your reference.
        </p>

        <!-- Invoice meta -->
        <div style="background-color: #ffffff; border: 1px solid #E5E7EB; border-left: 4px solid #EA580C; border-radius: 8px; padding: 20px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6B7280; font-size: 13px; width: 45%; font-family: Arial, sans-serif;">Invoice No</td>
              <td style="padding: 6px 0; color: #1F2937; font-size: 13px; font-weight: bold; font-family: Arial, sans-serif;">${escapeHtml(invoiceNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280; font-size: 13px; font-family: Arial, sans-serif;">Invoice Date</td>
              <td style="padding: 6px 0; color: #1F2937; font-size: 13px; font-weight: bold; font-family: Arial, sans-serif;">${escapeHtml(invoiceDate)}</td>
            </tr>
            ${dueDate ? `<tr>
              <td style="padding: 6px 0; color: #6B7280; font-size: 13px; font-family: Arial, sans-serif;">Due Date</td>
              <td style="padding: 6px 0; color: #1F2937; font-size: 13px; font-weight: bold; font-family: Arial, sans-serif;">${escapeHtml(dueDate)}</td>
            </tr>` : ""}
            <tr>
              <td style="padding: 6px 0; color: #6B7280; font-size: 13px; font-family: Arial, sans-serif;">Payment Terms</td>
              <td style="padding: 6px 0; color: #1F2937; font-size: 13px; font-weight: bold; font-family: Arial, sans-serif;">${escapeHtml(paymentTerms)}</td>
            </tr>
          </table>
        </div>

        <!-- Line items summary -->
        ${itemsRows ? `
        <p style="color: #1F2937; font-size: 15px; font-weight: bold; margin: 22px 0 10px 0; font-family: Arial, sans-serif;">SERVICES RENDERED</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
          <tr style="background: #FFF7ED;">
            <th style="padding: 8px 12px; text-align: left; color: #7C2D12; font-size: 13px; font-family: Arial, sans-serif;">Description</th>
            <th style="padding: 8px 12px; text-align: right; color: #7C2D12; font-size: 13px; font-family: Arial, sans-serif;">Amount</th>
          </tr>
          ${itemsRows}
          <tr>
            <td colspan="2" style="border-top: 2px solid #EA580C;"></td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; text-align: right; color: #6B7280; font-size: 14px; font-family: Arial, sans-serif;">Subtotal</td>
            <td style="padding: 8px 12px; text-align: right; color: #1F2937; font-size: 14px; font-weight: bold; font-family: Arial, sans-serif;">${inr(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; text-align: right; color: #6B7280; font-size: 14px; font-family: Arial, sans-serif;">GST</td>
            <td style="padding: 8px 12px; text-align: right; color: #1F2937; font-size: 14px; font-family: Arial, sans-serif;">NIL</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; text-align: right; color: #7C2D12; font-size: 16px; font-weight: bold; font-family: Arial, sans-serif;">TOTAL DUE</td>
            <td style="padding: 10px 12px; text-align: right; color: #EA580C; font-size: 16px; font-weight: bold; font-family: Arial, sans-serif;">${inr(totalDue)}</td>
          </tr>
        </table>` : `
        <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 16px 20px; margin: 18px 0; text-align: center;">
          <p style="margin: 0; color: #92400E; font-size: 18px; font-weight: bold; font-family: Arial, sans-serif;">TOTAL DUE: ${inr(totalDue)}</p>
        </div>`}

        <!-- UPI payment block -->
        <div style="background-color: #ffffff; border: 1px solid #E5E7EB; border-left: 4px solid #EA580C; border-radius: 8px; padding: 20px; margin: 18px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #EA580C; font-weight: bold; font-family: Arial, sans-serif;">PAY VIA UPI (INSTANT)</p>
          ${upiId ? `<p style="margin: 4px 0;"><strong>UPI ID:</strong> <span style="color: #7C2D12; font-weight: bold;">${escapeHtml(upiId)}</span></p>` : ""}
          ${upiName ? `<p style="margin: 4px 0;"><strong>Payee Name:</strong> ${escapeHtml(upiName)}</p>` : ""}
          <p style="margin: 4px 0;"><strong>Reference:</strong> <span style="font-weight: bold;">${escapeHtml(invoiceNumber)}</span></p>
          <p style="margin: 8px 0 0 0; color: #6B7280; font-size: 13px; line-height: 1.5; font-family: Arial, sans-serif;">
            Please quote the invoice number in the UPI remarks so we can match your payment.
          </p>
        </div>

        ${notes ? `<p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">${escapeHtml(notes)}</p>` : ""}

        <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 14px 0; font-family: Arial, sans-serif;">
          A detailed PDF invoice is attached to this email for your records. To ensure uninterrupted service, please make your payment by the due date.
        </p>

        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 18px 0 0 0; font-family: Arial, sans-serif;">
          Warm regards,<br/>
          <strong>Your Vitharn Architecture Team</strong>
        </p>
      </div>

      ${emailFooter()}
    </div>
  `;

  await sendMail({
    to,
    subject: `Invoice ${invoiceNumber} from Vitharn ERP Services — ${inr(totalDue)} Due`,
    html,
    ...(attachments.length ? { attachments } : {}),
  });
}
