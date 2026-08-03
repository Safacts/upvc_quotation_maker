import nodemailer from "nodemailer";

function transporter() {
  const smtpKey = process.env.BREVO_SMTP_KEY;
  if (!smtpKey) throw new Error("SMTP key not configured");
  return nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: { user: "ad3d10001@smtp-brevo.com", pass: smtpKey },
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
  const from = opts.from || "Vitharn UPVC <jvenkateshupvc@gmail.com>";
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
    from: "System Security <jvenkateshupvc@gmail.com>",
    to: recipient,
    subject: "Your Password Reset OTP",
    html,
  });
}
