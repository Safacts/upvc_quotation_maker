import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendAdminCompose } from "@/lib/mail";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
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
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const payload = await request.json();
    const { to, subject, text } = payload;

    if (!to || !subject || !text) {
      return json({ success: false, error: "Missing required fields" }, 400);
    }

    await sendAdminCompose({ to, subject, text });

    return json({ success: true });
  } catch (err: any) {
    console.error("Admin send_mail error:", err);
    return json({ success: false, error: err.message }, 500);
  }
}
