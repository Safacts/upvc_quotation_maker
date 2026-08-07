import { sendMail, escapeHtml, MAIL_FROM_EMAIL } from "./mail";
import { BRAND, ORANGE, GST_NOTE } from "./brand";
import { buildInvoicePdf, inr, fmtDate, type InvoiceData } from "./invoice-pdf";

// Vitharn transactional email service (Brevo SMTP relay).
//
// Every business-facing email (invoice, onboarding, trial warning, payment
// receipt) is composed here so branding + tone live in ONE place. Low-level
// transport concerns stay in ./mail.ts.
//
// DESIGN RULE: these helpers NEVER throw into the caller's critical path.
// A failed email must not fail an invoice, a signup, or a cron run. Callers get
// a { sent, error } result and decide what to do.

export type MailResult = { sent: boolean; error?: string };

async function safeSend(fn: () => Promise<void>, label: string): Promise<MailResult> {
  try {
    await fn();
    return { sent: true };
  } catch (e: any) {
    const error = String(e?.message ?? e);
    console.error(`[email-service] ${label} failed:`, error);
    return { sent: false, error };
  }
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

/**
 * Wraps body HTML in the Vitharn shell (orange header band + footer).
 *
 * EMAIL-CLIENT GOTCHA: Gmail strips <style> blocks and most CSS classes, so
 * every rule here is a literal inline style attribute. Do not refactor into
 * classes.
 */
function shell(opts: { heading: string; body: string; preheader?: string }): string {
  const { heading, body, preheader } = opts;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    ${
      preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
        : ""
    }
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${ORANGE.lineHex};">
      <div style="background:${ORANGE.mainHex};padding:22px 28px;">
        <div style="color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">${BRAND.name}</div>
        <div style="color:${ORANGE.lightHex};font-size:12px;margin-top:3px;">${BRAND.tagline}</div>
      </div>
      <div style="padding:28px;">
        <h2 style="color:${ORANGE.darkHex};margin:0 0 16px 0;font-size:20px;">${heading}</h2>
        ${body}
      </div>
      <div style="border-top:3px solid ${ORANGE.mainHex};background:${ORANGE.paperHex};padding:18px 28px;">
        <div style="color:${ORANGE.inkHex};font-size:13px;font-weight:bold;">Vitharn ERP Services</div>
        <div style="color:${ORANGE.mutedHex};font-size:12px;margin-top:4px;">
          <a href="mailto:${BRAND.email}" style="color:${ORANGE.mainHex};text-decoration:none;">${BRAND.email}</a>
          ${BRAND.phone ? ` &nbsp;|&nbsp; ${escapeHtml(BRAND.phone)}` : ""}
          &nbsp;|&nbsp; <a href="${BRAND.site}" style="color:${ORANGE.mainHex};text-decoration:none;">${BRAND.site}</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 14px 0;">${text}</p>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:24px 0;text-align:center;">
    <a href="${href}" style="background:${ORANGE.mainHex};color:#ffffff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">${escapeHtml(label)}</a>
  </p>`;
}

function factBox(rows: Array<[string, string]>): string {
  const body = rows
    .filter(([, v]) => v !== "" && v != null)
    .map(
      ([k, v]) => `<tr>
        <td style="padding:7px 0;color:${ORANGE.mutedHex};font-size:13px;white-space:nowrap;">${escapeHtml(k)}</td>
        <td style="padding:7px 0;color:${ORANGE.inkHex};font-size:13px;font-weight:bold;text-align:right;">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join("");
  return `<div style="background:${ORANGE.paperHex};border:1px solid ${ORANGE.lightHex};border-radius:8px;padding:14px 18px;margin:18px 0;">
    <table style="width:100%;border-collapse:collapse;">${body}</table>
  </div>`;
}

// ---------------------------------------------------------------------------
// 1. Invoice email (PDF attached)
// ---------------------------------------------------------------------------

/** Slug-safe filename: "Vitharn-Invoice-VIT-2627-0001.pdf" */
export function invoiceFilename(invoiceNumber: string): string {
  const safe = String(invoiceNumber || "invoice").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `Vitharn-Invoice-${safe}.pdf`;
}

/**
 * Emails an invoice with the branded PDF attached.
 *
 * Pass `pdf` to reuse an already-rendered buffer (avoids re-rendering when the
 * caller already streamed it); otherwise it is built from `invoice`.
 */
export async function sendInvoiceEmail(opts: {
  invoice: InvoiceData;
  to: string;
  cc?: string;
  pdf?: Uint8Array;
  message?: string;
}): Promise<MailResult> {
  const { invoice, to, message } = opts;
  const total = (invoice.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const pdf = opts.pdf ?? (await buildInvoicePdf(invoice));

  const upiId = (invoice.upiId || process.env.VITHARN_UPI_ID || "").trim();
  const who = invoice.clientCompany || invoice.clientName || "there";

  const body = `
    ${paragraph(`Hi ${escapeHtml(who)},`)}
    ${paragraph(
      message
        ? escapeHtml(message)
        : `Please find attached invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong> from Vitharn ERP Services. The PDF is attached to this email.`,
    )}
    ${factBox([
      ["Invoice No", invoice.invoiceNumber],
      ["Invoice Date", fmtDate(invoice.invoiceDate)],
      ["Due Date", fmtDate(invoice.dueDate)],
      ["GST", "NIL"],
      ["Total Due", inr(total)],
      ...(upiId ? ([["Pay via UPI", upiId]] as Array<[string, string]>) : []),
    ])}
    ${paragraph(
      `<span style="color:${ORANGE.mutedHex};font-size:12.5px;">${escapeHtml(GST_NOTE)}</span>`,
    )}
    ${paragraph(
      `When you pay, please quote <strong>${escapeHtml(invoice.invoiceNumber)}</strong> in the UPI remarks so we can match your payment. Reply to this email with any questions.`,
    )}
    ${paragraph("Thank you for your business.<br/>— Team Vitharn")}
  `;

  return safeSend(
    () =>
      sendMail({
        to,
        subject: `Invoice ${invoice.invoiceNumber} from Vitharn ERP Services — ${inr(total)}`,
        html: shell({
          heading: `Invoice ${escapeHtml(invoice.invoiceNumber)}`,
          preheader: `${inr(total)} due by ${fmtDate(invoice.dueDate)}`,
          body,
        }),
        attachments: [
          {
            filename: invoiceFilename(invoice.invoiceNumber),
            content: Buffer.from(pdf),
            contentType: "application/pdf",
          },
        ],
      }),
    `invoice ${invoice.invoiceNumber} -> ${to}`,
  );
}

// ---------------------------------------------------------------------------
// 2. Onboarding email (new client, start of trial)
// ---------------------------------------------------------------------------

export async function sendOnboardingEmail(opts: {
  to: string;
  companyName: string;
  contactName?: string;
  tempPassword?: string;
  trialEndsAt?: Date | string | null;
  loginUrl?: string;
}): Promise<MailResult> {
  const { to, companyName, contactName, tempPassword, trialEndsAt } = opts;
  const loginUrl = opts.loginUrl || `${BRAND.site}/login`;
  const greeting = contactName || companyName;

  const body = `
    ${paragraph(`Hi ${escapeHtml(greeting)},`)}
    ${paragraph(
      `Welcome aboard! Your <strong>Vitharn ERP</strong> account for <strong>${escapeHtml(companyName)}</strong> is live. You can start creating professional UPVC quotations right away.`,
    )}
    ${factBox([
      ["Login Email", to],
      ...(tempPassword ? ([["Temporary Password", tempPassword]] as Array<[string, string]>) : []),
      ...(trialEndsAt
        ? ([["Free Trial Ends", fmtDate(trialEndsAt)]] as Array<[string, string]>)
        : []),
    ])}
    ${button("Open Your Portal", loginUrl)}
    ${paragraph(
      tempPassword
        ? "For your security, please change this temporary password after your first login. You can also sign in with Google using the same email address."
        : "You can sign in with Google using the email address above.",
    )}
    ${paragraph(
      "<strong>Getting started in 3 steps:</strong><br/>1. Log in and add your company logo &amp; details.<br/>2. Set your product rates.<br/>3. Create your first quotation and send it as a PDF.",
    )}
    ${paragraph(
      `Stuck anywhere? Just reply to this email — we usually respond the same day.`,
    )}
    ${paragraph("— Team Vitharn")}
  `;

  return safeSend(
    () =>
      sendMail({
        to,
        subject: `Welcome to Vitharn ERP — ${companyName} is ready`,
        html: shell({
          heading: `Welcome, ${escapeHtml(companyName)}!`,
          preheader: "Your Vitharn ERP account is live — here are your login details.",
          body,
        }),
      }),
    `onboarding -> ${to}`,
  );
}

// ---------------------------------------------------------------------------
// 3. Trial warning / expiry
// ---------------------------------------------------------------------------

/**
 * Trial reminder. `daysLeft <= 0` renders the post-expiry (locked-out) variant,
 * which matches the 403 message in app/api/portal_auth/route.ts.
 */
export async function sendTrialWarningEmail(opts: {
  to: string;
  companyName: string;
  daysLeft: number;
  trialEndsAt?: Date | string | null;
  priceNote?: string;
}): Promise<MailResult> {
  const { to, companyName, daysLeft, trialEndsAt, priceNote } = opts;
  const expired = daysLeft <= 0;

  const heading = expired
    ? "Your free trial has ended"
    : daysLeft === 1
      ? "Your trial ends tomorrow"
      : `${daysLeft} days left in your trial`;

  const subject = expired
    ? `Your Vitharn ERP trial has ended — ${companyName}`
    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your Vitharn ERP trial`;

  const callout = expired
    ? `<div style="background:${ORANGE.lightHex};border-left:4px solid ${ORANGE.mainHex};padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0;">
         <div style="color:${ORANGE.darkHex};font-size:14px;font-weight:bold;">Access is paused</div>
         <div style="color:#374151;font-size:13.5px;margin-top:5px;">Your data is safe and nothing has been deleted. Activate your plan and you can pick up exactly where you left off.</div>
       </div>`
    : `<div style="background:${ORANGE.paperHex};border-left:4px solid ${ORANGE.midHex};padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0;">
         <div style="color:${ORANGE.darkHex};font-size:14px;font-weight:bold;">Trial ends ${escapeHtml(fmtDate(trialEndsAt))}</div>
         <div style="color:#374151;font-size:13.5px;margin-top:5px;">Activate before then and you will not lose a single quotation.</div>
       </div>`;

  const body = `
    ${paragraph(`Hi ${escapeHtml(companyName)},`)}
    ${paragraph(
      expired
        ? "Your 7-day free trial of Vitharn ERP has ended. We hope it made quoting faster for your team."
        : `Just a quick heads-up — your free trial of Vitharn ERP ends soon.`,
    )}
    ${callout}
    ${priceNote ? paragraph(escapeHtml(priceNote)) : ""}
    ${button(expired ? "Activate My Account" : "Continue With Vitharn", `mailto:${BRAND.email}?subject=${encodeURIComponent(`Activate Vitharn ERP — ${companyName}`)}`)}
    ${paragraph(
      `Reply to this email or write to <a href="mailto:${BRAND.email}" style="color:${ORANGE.mainHex};">${BRAND.email}</a> and we will set you up within the day.`,
    )}
    ${paragraph("— Team Vitharn")}
  `;

  return safeSend(
    () => sendMail({ to, subject, html: shell({ heading, preheader: subject, body }) }),
    `trial-warning(${daysLeft}) -> ${to}`,
  );
}

// ---------------------------------------------------------------------------
// 4. Payment receipt
// ---------------------------------------------------------------------------

export async function sendPaymentReceivedEmail(opts: {
  to: string;
  companyName: string;
  invoiceNumber: string;
  amount: number;
  paidOn?: Date | string;
}): Promise<MailResult> {
  const { to, companyName, invoiceNumber, amount, paidOn } = opts;

  const body = `
    ${paragraph(`Hi ${escapeHtml(companyName)},`)}
    ${paragraph(
      `We have received your payment — thank you! Invoice <strong>${escapeHtml(invoiceNumber)}</strong> is now marked as paid.`,
    )}
    ${factBox([
      ["Invoice No", invoiceNumber],
      ["Amount Received", inr(amount)],
      ["Received On", fmtDate(paidOn || new Date())],
      ["Status", "PAID"],
    ])}
    ${paragraph("Your account remains fully active. We appreciate your business.")}
    ${paragraph("— Team Vitharn")}
  `;

  return safeSend(
    () =>
      sendMail({
        to,
        subject: `Payment received — Invoice ${invoiceNumber}`,
        html: shell({
          heading: "Payment received",
          preheader: `${inr(amount)} received against ${invoiceNumber}`,
          body,
        }),
      }),
    `payment-receipt ${invoiceNumber} -> ${to}`,
  );
}

/** Diagnostic ping used to verify Brevo credentials end-to-end. */
export async function sendTestEmail(to: string): Promise<MailResult> {
  return safeSend(
    () =>
      sendMail({
        to,
        subject: "Vitharn SMTP test — Brevo relay OK",
        html: shell({
          heading: "SMTP is working",
          body: `${paragraph(
            `If you can read this, the Brevo relay is correctly configured and mail is being sent as <strong>${escapeHtml(MAIL_FROM_EMAIL)}</strong>.`,
          )}${paragraph(`Sent at ${new Date().toISOString()}.`)}`,
        }),
      }),
    `test -> ${to}`,
  );
}
