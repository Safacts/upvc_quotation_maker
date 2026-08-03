import nodemailer from "nodemailer";

export const MAIL_FROM = "Vitharn | Rubix IT Solution <vitharn@rubixitsolution.com>";

export const ADMIN_EMAILS = ["kongaaadisheshu@gmail.com", "vitarn.dev@gmail.com", "pusalalaxmi41@gmail.com"];

function transporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP not configured");
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function slugify(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<void> {
  const from = opts.from || MAIL_FROM;
  await transporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
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

  for (const admin of ADMIN_EMAILS) {
    await sendMail({ to: admin, subject, html });
  }
}
