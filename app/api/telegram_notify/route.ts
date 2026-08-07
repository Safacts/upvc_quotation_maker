// Admin API route for sending Telegram notifications.
//
// POST /api/telegram_notify
// Body: { event: "signup" | "trial_warning" | "payment" | "quotation" | "login" | "test", data: { ... } }
//
// Protected by admin session — mirrors the pattern in app/api/admin/send_mail/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  notifyNewClientSignup,
  notifyTrialExpiryWarning,
  notifyPaymentReceived,
  notifyNewQuotation,
  notifyClientLogin,
  sendTelegramPing,
  isTelegramConfigured,
  type TelegramResult,
} from "@/lib/telegram";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    // Auth: admin only
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    if (!isTelegramConfigured()) {
      return json({ success: false, error: "TELEGRAM_BOT_TOKEN not configured" }, 500);
    }

    const body = await request.json();
    const event = String(body.event || "").trim();
    const data = body.data || {};

    // Default to Aadi's chat ID, but allow override for testing.
    const chatId = String(data.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "1295597987");

    let result: TelegramResult;

    switch (event) {
      case "signup":
        result = await notifyNewClientSignup({
          chatId,
          clientName: String(data.clientName || "Unknown"),
          email: String(data.email || ""),
          plan: data.plan,
          phone: data.phone,
        });
        break;

      case "trial_warning":
        result = await notifyTrialExpiryWarning({
          chatId,
          clientName: String(data.clientName || "Unknown"),
          email: String(data.email || ""),
          daysLeft: Number(data.daysLeft || 0),
          expiryDate: data.expiryDate,
        });
        break;

      case "payment":
        result = await notifyPaymentReceived({
          chatId,
          clientName: String(data.clientName || "Unknown"),
          invoiceNumber: String(data.invoiceNumber || ""),
          amount: Number(data.amount || 0),
          paidOn: data.paidOn,
        });
        break;

      case "quotation":
        result = await notifyNewQuotation({
          chatId,
          clientName: String(data.clientName || "Unknown"),
          quotationId: String(data.quotationId || ""),
          totalAmount: Number(data.totalAmount || 0),
          itemCount: data.itemCount,
        });
        break;

      case "login":
        result = await notifyClientLogin({
          chatId,
          clientName: String(data.clientName || "Unknown"),
          email: String(data.email || ""),
        });
        break;

      case "test":
        result = await sendTelegramPing(chatId);
        break;

      default:
        return json(
          {
            success: false,
            error: `Unknown event: "${event}". Valid: signup, trial_warning, payment, quotation, login, test`,
          },
          400,
        );
    }

    if (result.sent) {
      return json({ success: true, event, chatId });
    }
    return json({ success: false, error: result.error }, 502);
  } catch (err: any) {
    console.error("[telegram_notify] error:", err);
    return json({ success: false, error: err.message }, 500);
  }
}
