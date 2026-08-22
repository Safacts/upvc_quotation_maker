import { sendMail, escapeHtml, MAIL_FROM_EMAIL } from "./mail";
import { BRAND, GST_NOTE } from "./brand";
import { buildInvoicePdf, inr, fmtDate, type InvoiceData } from "./invoice-pdf";
import { buildQuotationPdf, type QuotationPdfData } from "./quotation-pdf";
import { quotationTotals } from "./pricing";
import {
  emailShell,
  ep,
  epHtml,
  ebutton,
  efactBox,
  ecallout,
  echecklist,
} from "./email-template";

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
    ${ep(`Hi ${escapeHtml(who)},`)}
    ${ep(
      message
        ? escapeHtml(message)
        : `Please find attached invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong> from Vitharn ERP Services. The PDF is attached to this email.`,
    )}
    ${efactBox([
      ["Invoice No", invoice.invoiceNumber],
      ["Invoice Date", fmtDate(invoice.invoiceDate)],
      ["Due Date", fmtDate(invoice.dueDate)],
      ["GST", "NIL"],
      ["Total Due", inr(total)],
      ...(upiId ? ([["Pay via UPI", upiId]] as Array<[string, string]>) : []),
    ])}
    ${epHtml(`<span style="color:#7A5030;font-size:12.5px;">${escapeHtml(GST_NOTE)}</span>`)}
    ${ep(
      `When you pay, please quote <strong>${escapeHtml(invoice.invoiceNumber)}</strong> in the UPI remarks so we can match your payment. Reply to this email with any questions.`,
    )}
    ${ep("Thank you for your business.<br/>— Team Vitharn ERP Services")}
  `;

  return safeSend(
    () =>
      sendMail({
        to,
        subject: `Invoice ${invoice.invoiceNumber} from Vitharn ERP Services — ${inr(total)}`,
        html: emailShell({
          eyebrow: "INVOICE",
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
    ${ep(`Hi ${escapeHtml(greeting)},`)}
    ${ep(
      `Welcome aboard! Your <strong>Vitharn ERP</strong> account for <strong>${escapeHtml(companyName)}</strong> is live. You can start creating professional UPVC quotations right away.`,
    )}
    ${efactBox([
      ["Login Email", to],
      ...(tempPassword ? ([["Temporary Password", tempPassword]] as Array<[string, string]>) : []),
      ...(trialEndsAt
        ? ([["Free Trial Ends", fmtDate(trialEndsAt)]] as Array<[string, string]>)
        : []),
    ])}
    ${ebutton("Open Your Portal", loginUrl)}
    ${ep(
      tempPassword
        ? "For your security, please change this temporary password after your first login. You can also sign in with Google using the same email address."
        : "You can sign in with Google using the email address above.",
    )}
    ${echecklist([
      "Log in and add your company logo & details.",
      "Set your product rates.",
      "Create your first quotation and send it as a PDF.",
    ])}
    ${ep(`Stuck anywhere? Just reply to this email — we usually respond the same day.`)}
    ${ep("— Team Vitharn ERP Services")}
  `;

  return safeSend(
    () =>
      sendMail({
        to,
        subject: `Welcome to Vitharn ERP — ${companyName} is ready`,
        html: emailShell({
          eyebrow: "WELCOME ABOARD",
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
    ? ecallout(
        "Access is paused",
        "Your data is safe and nothing has been deleted. Activate your plan and you can pick up exactly where you left off.",
      )
    : ecallout(
        `Trial ends ${escapeHtml(fmtDate(trialEndsAt))}`,
        "Activate before then and you will not lose a single quotation.",
      );

  const body = `
    ${ep(`Hi ${escapeHtml(companyName)},`)}
    ${ep(
      expired
        ? "Your 7-day free trial of Vitharn ERP has ended. We hope it made quoting faster for your team."
        : `Just a quick heads-up — your free trial of Vitharn ERP ends soon.`,
    )}
    ${callout}
    ${priceNote ? ep(escapeHtml(priceNote)) : ""}
    ${ebutton(expired ? "Activate My Account" : "Continue With Vitharn", `mailto:${BRAND.email}?subject=${encodeURIComponent(`Activate Vitharn ERP — ${companyName}`)}`)}
    ${ep(
      `Reply to this email or write to <a href="mailto:${BRAND.email}" style="color:#E06A1E;">${BRAND.email}</a> and we will set you up within the day.`,
    )}
    ${ep("— Team Vitharn ERP Services")}
  `;

  return safeSend(
    () => sendMail({ to, subject, html: emailShell({ eyebrow: "TRIAL UPDATE", heading, preheader: subject, body }) }),
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
    ${ep(`Hi ${escapeHtml(companyName)},`)}
    ${ep(
      `We have received your payment — thank you! Invoice <strong>${escapeHtml(invoiceNumber)}</strong> is now marked as paid.`,
    )}
    ${efactBox([
      ["Invoice No", invoiceNumber],
      ["Amount Received", inr(amount)],
      ["Received On", fmtDate(paidOn || new Date())],
      ["Status", "PAID"],
    ])}
    ${ep("Your account remains fully active. We appreciate your business.")}
    ${ep("— Team Vitharn ERP Services")}
  `;

  return safeSend(
    () =>
      sendMail({
        to,
        subject: `Payment received — Invoice ${invoiceNumber}`,
        html: emailShell({
          eyebrow: "PAYMENT CONFIRMED",
          heading: "Payment received",
          preheader: `${inr(amount)} received against ${invoiceNumber}`,
          body,
        }),
      }),
    `payment-receipt ${invoiceNumber} -> ${to}`,
  );
}

// ---------------------------------------------------------------------------
// 5. Quotation email (PDF attached)
// ---------------------------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Emails a quotation with the branded PDF attached.
 *
 * Used by both the single-quotation "Email" action and the bulk email endpoint.
 * The quotation PDF is generated server-side from the SAME `src/lib/pricing.ts`
 * the on-screen preview uses, so the numbers the customer receives match what
 * the fabricator saw.
 */
export async function sendQuotationEmail(opts: {
  /** Full quotation row with measured_items + unmeasured_items embedded. */
  quotation: any;
  /** The client.config branding block (company name, logo, bank, terms...). */
  config: Record<string, any>;
  /** Optional override subject. */
  subject?: string;
  /** Optional override message body (plain text, rendered as one paragraph). */
  message?: string;
}): Promise<MailResult> {
  const { quotation: q, config, message } = opts;

  const measured = (q.measured_items || []).map((m: any) => ({
    code: String(m.code || ""),
    description: String(m.description || ""),
    glass: String(m.glass || ""),
    width: num(m.width),
    height: num(m.height),
    units: num(m.units, 1),
    rate: num(m.rate),
  }));
  const unmeasured = (q.unmeasured_items || []).map((u: any) => ({
    description: String(u.description || ""),
    units: num(u.units, 1),
    rate: num(u.rate),
  }));

  const totals = quotationTotals(q, measured, unmeasured);

  const pdfData: QuotationPdfData = {
    quoteNo: String(q.quote_no || ""),
    date: q.date || q.created_at || new Date(),
    customerName: String(q.customer_name || ""),
    contactNo: String(q.contact_no || ""),
    email: String(q.email || ""),
    address: String(q.address || ""),
    reference: String(q.reference || ""),
    supplierCompany: String(q.supplier_company || ""),
    measured,
    unmeasured,
    totals,
    companyName: String(config.companyName || config.appName || ""),
    companyAddress: String(config.companyAddress || ""),
    companyProprietor: String(config.companyProprietor || ""),
    companyContact: String(config.companyContact || ""),
    gstNumber: String(config.gstNumber || ""),
    bankName: String(config.bankName || ""),
    bankBranch: String(config.bankBranch || ""),
    bankAccountNo: String(config.bankAccountNo || ""),
    bankIfsc: String(config.bankIfsc || ""),
    termsAndConditions: Array.isArray(config.termsAndConditions)
      ? config.termsAndConditions.map(String)
      : [],
    logoUrl: String(config.logoUrl || ""),
    watermarkUrl: String(config.invoiceBackgroundLogoUrl || config.logoUrl || ""),
  };

  const pdf = await buildQuotationPdf(pdfData);
  const filename = `Quotation-${q.quote_no || q.id || ""}.pdf`;

  const who = q.customer_name || "there";
  const body = `
    ${ep(`Hi ${escapeHtml(who)},`)}
    ${ep(
      message
        ? escapeHtml(message)
        : `Please find attached quotation <strong>${escapeHtml(q.quote_no || "")}</strong> from ${escapeHtml(config.companyName || "Vitharn ERP Services")}.`,
    )}
    ${efactBox([
      ["Quote No", q.quote_no || "-"],
      ["Date", fmtDate(q.date || q.created_at)],
      ["Total", inr(totals.grandTotal)],
    ])}
    ${ep(`This quotation is valid for the period mentioned in the PDF. Reply to this email with any questions or to proceed.`)}
    ${ep("— Team Vitharn ERP Services")}
  `;

  return safeSend(
    () =>
      sendMail({
        to: q.email,
        subject: opts.subject || `Quotation ${q.quote_no || ""} from ${config.companyName || "Vitharn ERP Services"}`,
        html: emailShell({
          eyebrow: "QUOTATION",
          heading: `Quotation ${escapeHtml(q.quote_no || "")}`,
          preheader: `Quotation for ${inr(totals.grandTotal)} attached`,
          body,
        }),
        attachments: [
          {
            filename,
            content: Buffer.from(pdf),
            contentType: "application/pdf",
          },
        ],
      }),
    `quotation ${q.quote_no || q.id} -> ${q.email}`,
  );
}

/** Diagnostic ping used to verify Brevo credentials end-to-end. */
export async function sendTestEmail(to: string): Promise<MailResult> {
  return safeSend(
    () =>
      sendMail({
        to,
        subject: "Vitharn SMTP test — Brevo relay OK",
        html: emailShell({
          eyebrow: "TEST",
          heading: "SMTP is working",
          body: `${ep(
            `If you can read this, the Brevo relay is correctly configured and mail is being sent as <strong>${escapeHtml(MAIL_FROM_EMAIL)}</strong>.`,
          )}${ep(`Sent at ${new Date().toISOString()}.`)}`,
        }),
      }),
    `test -> ${to}`,
  );
}