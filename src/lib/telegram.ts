// Telegram Bot notification service for Vitharn ERP Services.
//
// Sends formatted, branded messages to Aadi's Telegram whenever a business
// event happens (signup, trial warning, payment, new quotation). Built to the
// same "never throw into the caller's critical path" pattern as
// ./email-service.ts — a failed Telegram ping must never fail the underlying
// API call.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = "https://api.telegram.org";

export type TelegramResult = { sent: boolean; error?: string };

async function safeSend(fn: () => Promise<void>, label: string): Promise<TelegramResult> {
  try {
    await fn();
    return { sent: true };
  } catch (e: any) {
    const error = String(e?.message ?? e);
    console.error(`[telegram] ${label} failed:`, error);
    return { sent: false, error };
  }
}

/**
 * Low-level send. Uses `sendMessage` with HTML parse mode so we get bold,
 * italic, and <a href> links in Telegram.
 */
async function sendTelegramMessage(opts: {
  chatId: string;
  text: string;
  disableNotification?: boolean;
}): Promise<TelegramResult> {
  return safeSend(async () => {
    if (!BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }
    const url = `${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text,
        parse_mode: "HTML",
        disable_notification: opts.disableNotification ?? false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram API ${res.status}: ${body.slice(0, 300)}`);
    }
  }, `sendMessage -> ${opts.chatId}`);
}

// ---------------------------------------------------------------------------
// Message templates (professional, branded, concise)
// ---------------------------------------------------------------------------

/** Brand header prepended to every message — keeps identity consistent. */
const HEADER = "🟧 <b>Vitharn ERP Services</b>";

function divider(): string {
  return "────────────────────";
}

// ---------------------------------------------------------------------------
// 1. New client signup
// ---------------------------------------------------------------------------

export async function notifyNewClientSignup(opts: {
  chatId: string;
  clientName: string;
  email: string;
  plan?: string;
  phone?: string;
}): Promise<TelegramResult> {
  const { chatId, clientName, email, plan = "7-day free trial", phone } = opts;
  const text = `${HEADER}

✅ <b>New Client Signup</b>
${divider()}
👤 Client: ${escapeHtml(clientName)}
📧 Email: <code>${escapeHtml(email)}</code>
📱 Phone: ${phone ? escapeHtml(phone) : "—"}
📋 Plan: ${escapeHtml(plan)}

🕐 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

  return sendTelegramMessage({ chatId, text });
}

// ---------------------------------------------------------------------------
// 2. Trial expiry warning
// ---------------------------------------------------------------------------

export async function notifyTrialExpiryWarning(opts: {
  chatId: string;
  clientName: string;
  email: string;
  daysLeft: number;
  expiryDate?: string | Date;
}): Promise<TelegramResult> {
  const { chatId, clientName, email, daysLeft, expiryDate } = opts;
  const expired = daysLeft <= 0;
  const emoji = expired ? "🔴" : daysLeft <= 3 ? "🟡" : "🟠";
  const headline = expired
    ? "Trial Expired"
    : `${daysLeft} Day${daysLeft === 1 ? "" : "s"} Left`;

  const text = `${HEADER}

${emoji} <b>Trial Expiry Warning</b>
${divider()}
👤 Client: ${escapeHtml(clientName)}
📧 Email: <code>${escapeHtml(email)}</code>
⏰ Status: ${expired ? "<b>EXPIRED</b>" : `<b>${headline}</b>`}
📅 Expiry: ${expiryDate ? escapeHtml(String(expiryDate)) : "—"}

💡 Follow up to convert.`;

  return sendTelegramMessage({ chatId, text });
}

// ---------------------------------------------------------------------------
// 3. Payment received (UPI — manual trigger)
// ---------------------------------------------------------------------------

export async function notifyPaymentReceived(opts: {
  chatId: string;
  clientName: string;
  invoiceNumber: string;
  amount: number;
  paidOn?: Date | string;
}): Promise<TelegramResult> {
  const { chatId, clientName, invoiceNumber, amount, paidOn } = opts;
  const text = `${HEADER}

💰 <b>Payment Received</b>
${divider()}
👤 Client: ${escapeHtml(clientName)}
🧾 Invoice: <code>${escapeHtml(invoiceNumber)}</code>
💵 Amount: <b>₹${formatInr(amount)}</b>
📅 Paid On: ${paidOn ? escapeHtml(String(paidOn)) : new Date().toLocaleDateString("en-IN")}

✅ Mark invoice as paid in Supabase.`;

  return sendTelegramMessage({ chatId, text });
}

// ---------------------------------------------------------------------------
// 4. New quotation created
// ---------------------------------------------------------------------------

export async function notifyNewQuotation(opts: {
  chatId: string;
  clientName: string;
  quotationId: string;
  totalAmount: number;
  itemCount?: number;
}): Promise<TelegramResult> {
  const { chatId, clientName, quotationId, totalAmount, itemCount } = opts;
  const text = `${HEADER}

📄 <b>New Quotation Created</b>
${divider()}
👤 Client: ${escapeHtml(clientName)}
🔖 ID: <code>${escapeHtml(quotationId)}</code>
💵 Total: <b>₹${formatInr(totalAmount)}</b>
📦 Items: ${itemCount ?? "—"}

🕐 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

  return sendTelegramMessage({ chatId, text });
}

// ---------------------------------------------------------------------------
// 5. Client login (optional — low priority, silent)
// ---------------------------------------------------------------------------

export async function notifyClientLogin(opts: {
  chatId: string;
  clientName: string;
  email: string;
}): Promise<TelegramResult> {
  const { chatId, clientName, email } = opts;
  const text = `${HEADER}

🔑 <b>Client Login</b>
${divider()}
👤 ${escapeHtml(clientName)}
📧 <code>${escapeHtml(email)}</code>
🕐 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

  return sendTelegramMessage({ chatId, text, disableNotification: true });
}

// ---------------------------------------------------------------------------
// Generic ping (for tests / health checks)
// ---------------------------------------------------------------------------

export async function sendTelegramPing(chatId: string): Promise<TelegramResult> {
  const text = `${HEADER}

✅ <b>Telegram Bot Connected</b>
${divider()}
Bot: <code>rubix_dev_bot</code>
Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

Your Vitharn ERP notification channel is live.`;

  return sendTelegramMessage({ chatId, text });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape HTML entities so user data cannot break Telegram's parse mode. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format a number as Indian currency (e.g. 125000 -> "1,25,000"). */
function formatInr(n: number): string {
  if (isNaN(n)) return "0";
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** True if the bot token is configured (used by callers to skip if unset). */
export function isTelegramConfigured(): boolean {
  return !!BOT_TOKEN;
}
